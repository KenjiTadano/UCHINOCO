import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {publishPrivateProposal} from '../lib/album-persistence/private-source-publication.ts';
import {executePrivateHandoff,parseHandoffIntent,intentDigest} from '../lib/album-persistence/private-source-handoff-core.ts';
import {generateKeyPairSync} from 'node:crypto';
const input=()=>({head:'https://synthetic.invalid/head',put:'https://synthetic.invalid/put',value:'{"opaque":"synthetic"}',validUntil:Date.now()+60000});
function fixture(mode='normal'){
 let exists=false,puts=0,heads=0,postHeads=0,jsonCalls=0;const events=[];
 const fetch=async(_url,options)=>{
  if(options.method==='HEAD'){
   heads++;if(puts)postHeads++;
   if(mode==='head-unavailable'&&puts)throw Error('PRIVATE_URL_MUST_NOT_LOG');
   if(mode==='visibility-delay'&&puts&&postHeads===1)return new Response(null,{status:404});
   return new Response(null,{status:exists?200:404});
  }
  puts++;
  if(mode==='reject')return new Response('private-provider-error',{status:403});
  exists=true;
  if(mode==='timeout-after-commit')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('PRIVATE_URL_MUST_NOT_LOG')),{once:true}));
  if(mode==='lost-ack'||mode==='visibility-delay')throw Error('PRIVATE_URL_MUST_NOT_LOG');
  if(mode==='invalid-shape')return {sdkResult:'not-a-fetch-response'};
  if(mode==='delayed')await new Promise(r=>setTimeout(r,15));
  const r=new Response(mode==='malformed-json'?'{invalid-json':'opaque-response',{status:200});
  r.json=()=>{jsonCalls++;throw Error('PRIVATE_URL_MUST_NOT_LOG')};
  if(mode==='locked-body')r.body.getReader();
  return r;
 };
 return {fetch,events,audit:e=>events.push(e),get puts(){return puts},get heads(){return heads},get jsonCalls(){return jsonCalls}};
}
for(const mode of ['normal','delayed','malformed-json','locked-body'])test('confirmed publication: '+mode,async()=>{
 const f=fixture(mode),result=await publishPrivateProposal(input(),{fetch:f.fetch,audit:f.audit});
 assert.equal(result,'created');assert.equal(f.puts,1);assert.equal(f.heads,2);assert.equal(f.jsonCalls,0);
 assert.equal(f.events.at(-1).stage,'head-confirmed');assert.equal(f.events.at(-1).committedObjectObserved,true);
 if(mode==='locked-body')assert.equal(f.events.find(x=>x.stage==='put-response-parsed').responseShape,'cleanup-failed');
});
test('old broad catch reproducibly reports failed after committed PUT + locked body',async()=>{
 let committed=false;let outcome;try{committed=true;const r=new Response('opaque');r.body.getReader();await r.body.cancel();outcome='created'}catch{outcome='handoff-failed'}
 assert.equal(committed,true);assert.equal(outcome,'handoff-failed');
 const f=fixture('locked-body');assert.equal(await publishPrivateProposal(input(),{fetch:f.fetch,audit:f.audit}),'created');
});
for(const mode of ['timeout-after-commit','lost-ack','invalid-shape','visibility-delay'])test('observed object with unknown ACK is not success: '+mode,async()=>{
 const f=fixture(mode),result=await publishPrivateProposal(input(),{fetch:f.fetch,audit:f.audit,putTimeoutMs:25});
 assert.equal(result,'committed-ack-unknown');assert.equal(f.puts,1);assert.equal(f.events.at(-1).committedObjectObserved,true);
 assert.equal(f.heads,mode==='visibility-delay'?3:2);
 const text=JSON.stringify(f.events);assert.equal(text.includes('PRIVATE_URL_MUST_NOT_LOG'),false);assert.equal(text.includes('https://'),false);assert.equal(text.includes('synthetic'),false);
});
test('explicit reject plus repeated private absence is actual failure',async()=>{
 const f=fixture('reject');assert.equal(await publishPrivateProposal(input(),{fetch:f.fetch,audit:f.audit}),'failed');assert.equal(f.puts,1);assert.equal(f.heads,3);
});
test('expired grant never starts a fetch or PUT',async()=>{
 let calls=0;const events=[];assert.equal(await publishPrivateProposal({...input(),validUntil:Date.now()-1},{fetch:async()=>{calls++;throw Error('forbidden')},audit:e=>events.push(e)}),'failed');assert.equal(calls,0);assert.equal(events[0].stage,'grant-validated');assert.equal(events[0].success,false);
});
test('timeout + still absent does not pretend to prove non-commit',async()=>{
 let puts=0;const fetch=async(_u,o)=>{if(o.method==='HEAD')return new Response(null,{status:404});puts++;throw Error('private error')};
 assert.equal(await publishPrivateProposal(input(),{fetch}),'ack-unknown');assert.equal(puts,1);
});
test('HTTP ACK without visible HEAD remains unconfirmed, not success',async()=>{
 let puts=0;const fetch=async(_u,o)=>{if(o.method==='HEAD')return new Response(null,{status:404});puts++;return new Response('opaque')};
 assert.equal(await publishPrivateProposal(input(),{fetch}),'ack-unknown');assert.equal(puts,1);
});
test('existing committed slot never receives another PUT',async()=>{
 let puts=0;assert.equal(await publishPrivateProposal(input(),{fetch:async(_u,o)=>{if(o.method==='PUT')puts++;return new Response(null,{status:200})}}),'exists');assert.equal(puts,0);
});
test('unavailable preflight fails without attempting PUT',async()=>{
 let puts=0;assert.equal(await publishPrivateProposal(input(),{fetch:async(_u,o)=>{if(o.method==='PUT')puts++;throw Error('private failure')}}),'failed');assert.equal(puts,0);
});
test('HEAD outage after a successful ACK never becomes generic failure',async()=>{
 const f=fixture('head-unavailable');assert.equal(await publishPrivateProposal(input(),{fetch:f.fetch,audit:f.audit}),'ack-unknown');assert.equal(f.puts,1);
});
test('diagnostic sink failure never changes confirmed outcome',async()=>{
 const f=fixture();assert.equal(await publishPrivateProposal(input(),{fetch:f.fetch,audit:()=>{throw Error('private diagnostic failure')}}),'created');
});
test('shared deadline bounds even an adapter ignoring abort; actual signal is aborted',async()=>{
 let signal;const began=performance.now();const result=await publishPrivateProposal(input(),{budgetMs:60,headTimeoutMs:40,fetch:async(_u,o)=>{signal=o.signal;return new Promise(()=>{})}});const elapsed=performance.now()-began;
 assert.equal(result,'failed');assert.equal(signal.aborted,true);assert.ok(elapsed<310,`bounded elapsed ${elapsed}`);
});
test('native HTTP client timeout after server commit is reconciled without retry',async()=>{
 let committed=false,puts=0,aborted=false;const timers=[];
 const server=createServer((req,res)=>{if(req.method==='HEAD'){res.writeHead(committed?200:404);res.end();return}puts++;committed=true;res.on('close',()=>{if(!res.writableEnded)aborted=true});timers.push(setTimeout(()=>{res.writeHead(200);res.end('opaque')},250));req.resume();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${server.address().port}`,events=[];const result=await publishPrivateProposal({...input(),head:base+'/head',put:base+'/put'},{putTimeoutMs:40,audit:e=>events.push(e)});assert.equal(committed,true);assert.equal(result,'committed-ack-unknown');assert.equal(puts,1);assert.equal(events.find(e=>e.stage==='put-returned').responseShape,'timeout');await new Promise(r=>setTimeout(r,10));assert.equal(aborted,true)}finally{timers.forEach(clearTimeout);server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('core audit preserves ACK unknown and failed as non-success, then emits audit stage',async()=>{
 const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({format:'pem',type:'spki'}).toString(),now=1801000;
 const raw={version:1,environment:'preview',build:'a'.repeat(40),region:'sin1',trial:'synthetic-ack',startWindow:6,nonce:'b'.repeat(64),proposalPublicKey:key,sealPublicKey:key,slots:[{albumId:'11111111-1111-4111-8111-111111111111',petId:'22222222-2222-4222-8222-222222222222'}]},m=parseHandoffIntent(JSON.stringify(raw),intentDigest(raw),raw);
 const url='https://synthetic.invalid/storage/v1/object/sign/pet-photos/synthetic.jpg?token=x.'+Buffer.from(JSON.stringify({exp:7200})).toString('base64url')+'.x',fresh=new Map([['synthetic',url]]);
 for(const [publication,outcome]of [['committed-ack-unknown','handoff-committed-ack-unknown'],['ack-unknown','handoff-publication-unknown'],['failed','handoff-publication-failed'],['created','proposal-created']]){
  const events=[];const r=await executePrivateHandoff(m,'synthetic',raw.slots[0].albumId,raw.slots[0].petId,fresh,{control:async()=>({version:1,phase:'handoff',enabled:false,armed:true,intentDigest:intentDigest(m),slot:0,validUntil:2400000}),authenticate:async()=>({verifiedUserId:'synthetic',sessionUserId:'synthetic',accessToken:'synthetic',sessionExpiresAt:7200000}),authorize:async()=>true,sign:async()=>fresh,unchangedSession:async()=>true,publish:async()=>publication,audit:()=>{},publicationAudit:e=>events.push(e)},()=>now);
  assert.equal(r.outcome,outcome);assert.equal(r.count,publication==='created'?1:0);assert.equal(events.at(-1).stage,'audit-emitted');
 }
});
