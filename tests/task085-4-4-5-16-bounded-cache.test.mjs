import assert from 'node:assert/strict';import {test,after} from 'node:test';import {writeFile,readFile} from 'node:fs/promises';
import {reuseSignedSourceMap} from '../lib/album-persistence/signed-source-lease.ts';
import {optionalCacheBudget,OPTIONAL_CACHE_BUDGET_MS} from '../lib/album-persistence/optional-cache-budget.ts';
const now=1000000,lease={verifiedUserId:'synthetic-owner',sessionUserId:'synthetic-owner',accessToken:'synthetic-session',sessionExpiresAt:now+3600000,scope:'synthetic-preview'};
const url=`https://synthetic.invalid/storage/v1/object/sign/pet-photos/synthetic.jpg?token=x.${Buffer.from(JSON.stringify({exp:(now+3600000)/1000})).toString('base64url')}.x`;
const fresh=()=>new Map([['synthetic-photo',url]]),metrics=[];
const delay=(ms,signal)=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new Error('synthetic abort'));},{once:true});});
const cases={
 'slow-get':()=>({async get(_k,s){await delay(300,s);return null},async set(){throw Error('must not write')},expected:'get-timeout'}),
 'get-timeout':()=>({get:()=>new Promise(()=>{}),async set(){throw Error('must not write')},expected:'get-timeout'}),
 'get-reject':()=>({async get(){throw Error('synthetic reject')},async set(){},expected:'cache-error'}),
 'slow-successful-get':()=>({async get(_k,s){await delay(115,s);return null},async set(){throw Error('must skip')},expected:'seed-skipped-budget'}),
 'miss-slow-set':()=>({async get(_k,s){await delay(20,s);return null},async set(_k,_v,_t,s){await delay(300,s)},expected:'set-timeout'}),
 'set-timeout':()=>({async get(){return null},set:()=>new Promise(()=>{}),expected:'set-timeout'}),
 'set-reject':()=>({async get(){return null},async set(){throw Error('synthetic reject')},expected:'cache-error'}),
 'provider-unavailable':()=>({async get(){throw Error('synthetic unavailable')},async set(){},expected:'cache-error'}),
 'corrupt-entry':()=>({async get(){return 'corrupt'},async set(){},expected:'invalid-entry'}),
 'normal-seed':()=>({async get(){return null},async set(){},expected:'seed'}),
};
for(const [name,create]of Object.entries(cases))test('shared optional budget: '+name,async()=>{for(let i=0;i<5;i++){const f=fresh(),s=create(),start=performance.now(),r=await reuseSignedSourceMap(f,lease,s,now),durationMs=performance.now()-start;assert.equal(r.urls,f);assert.equal(r.outcome,s.expected);assert.ok(durationMs<OPTIONAL_CACHE_BUDGET_MS+100,`${name} exceeds scheduling tolerance`);metrics.push({case:name,outcome:r.outcome,durationMs});}});
test('one shared deadline includes prior session work; no new allowance for get/set',async()=>{const b=optionalCacheBudget();await b.run('session',s=>delay(110,s));let writes=0;const f=fresh(),start=performance.now(),r=await reuseSignedSourceMap(f,lease,{async get(){return null},async set(){writes++}},now,b);assert.equal(r.outcome,'seed-skipped-budget');assert.equal(writes,0);assert.ok(performance.now()-start<50);});
test('timeout signals cooperative store and never starts set after a late get',async()=>{let aborted=false,writes=0;const f=fresh(),r=await reuseSignedSourceMap(f,lease,{get:(_k,s)=>new Promise((_r,reject)=>s.addEventListener('abort',()=>{aborted=true;reject(new Error('synthetic abort'))})),async set(){writes++}},now);assert.equal(r.urls,f);assert.equal(r.outcome,'get-timeout');assert.equal(aborted,true);assert.equal(writes,0);});
test('late non-abortable set completion cannot change returned fresh map',async()=>{let committed=false;const f=fresh(),r=await reuseSignedSourceMap(f,lease,{async get(){return null},async set(){await delay(190);committed=true}},now);assert.equal(r.outcome,'set-timeout');assert.equal(r.urls,f);await delay(60);assert.equal(committed,true);assert.equal(f.get('synthetic-photo'),url);});
test('100 item and 64KiB limits remain bypasses for large books',async()=>{let reads=0;const store={async get(){reads++;return null},async set(){}};const tooMany=new Map(Array.from({length:101},(_,i)=>['synthetic-'+i,url]));assert.equal((await reuseSignedSourceMap(tooMany,lease,store,now)).outcome,'disabled');const large=new Map(Array.from({length:90},(_,i)=>['synthetic-'+i,url.replace('synthetic.jpg','synthetic-'+i+'x'.repeat(1000)+'.jpg')]));assert.equal((await reuseSignedSourceMap(large,lease,store,now)).outcome,'disabled');assert.equal(reads,0);});
for(const fault of ['sdk-unavailable','session-timeout'])test('actual optional adapter budget: '+fault,async()=>{
 const vm=await import('node:vm'),ts=await import('typescript');const {OptionalCacheTimeout}=await import('../lib/album-persistence/optional-cache-budget.ts');
 const code=ts.default.transpileModule(await readFile('lib/album-persistence/signed-source-reuse.ts','utf8'),{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
 const exports={},logs=[];vm.runInNewContext(code,{exports,performance,Date,Boolean,process:{env:{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'synthetic'}},console:{info:(_label,data)=>logs.push(JSON.parse(data))},require:n=>n.includes('optional-cache-budget')?{optionalCacheBudget,OptionalCacheTimeout}:n.includes('source-reuse-mode')?{sourceReuseEnabled:()=>true}:n==='@vercel/functions'?{getCache(){throw Error('synthetic SDK unavailable')}}:{}});
 const f=fresh(),start=performance.now();const r=await exports.applySourceReuse({auth:{getSession:fault==='session-timeout'?()=>new Promise(()=>{}):async()=>({data:{session:{}},error:null})}},'synthetic-owner',f,true);const durationMs=performance.now()-start;
 assert.equal(r,f);assert.equal(logs[0].outcome,fault==='session-timeout'?'session-timeout':'cache-unavailable');assert.ok(durationMs<OPTIONAL_CACHE_BUDGET_MS+100);metrics.push({case:fault,outcome:logs[0].outcome,durationMs});
});
after(async()=>{if(process.env.TASK16_METRICS_FILE)await writeFile(process.env.TASK16_METRICS_FILE,JSON.stringify(metrics));});
