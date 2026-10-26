import assert from "node:assert/strict";
import {test} from "node:test";
import {generateKeyPairSync,sign} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {executePrivateHandoff,handoffEpochMatches,parseHandoffIntent,intentDigest,sealPrivateHandoff,verifySealedHandoff} from "../lib/album-persistence/private-source-handoff-core.ts";
import {sealOnce} from "../scripts/private-source-admission-operator.mjs";
const now=1801000,build="a".repeat(40),album="11111111-1111-4111-8111-111111111111",pet="22222222-2222-4222-8222-222222222222";
const pair=()=>generateKeyPairSync("ed25519"),pub=k=>k.publicKey.export({type:"spki",format:"pem"}).toString(),priv=k=>k.privateKey.export({type:"pkcs8",format:"pem"}).toString();
const url=(p="synthetic.jpg")=>`https://synthetic.invalid/storage/v1/object/sign/pet-photos/${p}?token=x.${Buffer.from(JSON.stringify({exp:(now+3600000)/1000})).toString("base64url")}.x`;
function fixture(slots=1){
 const app=pair(),op=pair(),intent={version:1,environment:"preview",build,region:"sin1",trial:"synthetic-fixed",startWindow:6,nonce:"b".repeat(64),proposalPublicKey:pub(app),sealPublicKey:pub(op),slots:Array.from({length:slots},()=>({albumId:album,petId:pet}))};
 const runtime={environment:"preview",build,region:"sin1"},m=parseHandoffIntent(JSON.stringify(intent),intentDigest(intent),runtime);assert.ok(m);
 const control={version:1,phase:"handoff",enabled:false,armed:true,intentDigest:intentDigest(m),slot:0,validUntil:2400000},fresh=new Map([["synthetic-photo",url()]]),stored=new Map(),order=[],audits=[];
 const ctx={verifiedUserId:"synthetic-owner",sessionUserId:"synthetic-owner",accessToken:"synthetic-session",sessionExpiresAt:now+3600000};
 const deps={async control(){return control},async authenticate(){order.push("auth");return {...ctx}},async authorize(c,a,p){order.push("owner-pet-membership-source");return c.verifiedUserId==="synthetic-owner"&&a===album&&p===pet},async sign(){order.push("signing");return fresh},async unchangedSession(){order.push("credential-check");return true},async publish(slot,proposal){order.push("proposal");if(stored.has(slot))return "exists";stored.set(slot,{proposal,signature:sign(null,Buffer.from(JSON.stringify(proposal)),app.privateKey).toString("base64url")});return "created"},audit(v){audits.push(v)}};
 return {m,runtime,app,op,ctx,control,fresh,stored,order,audits,deps};
}
async function run(f,overrides={},clock=now,a=album,p=pet){return executePrivateHandoff(f.m,"synthetic-project",a,p,f.fresh,{...f.deps,...overrides},()=>clock)}
function sealed(f,certs=[...f.stored.values()]){
 const s=sealPrivateHandoff(f.m,certs.map(c=>c.proposal),f.runtime,now);if(!s)return null;
 const msg={intentDigest:intentDigest(f.m),manifest:s.manifest,digest:s.digest,certificates:certs};
 return {version:1,phase:"trial",enabled:false,validUntil:2400000,intentDigest:msg.intentDigest,manifest:s.manifest,manifestDigest:s.digest,certificates:certs,signature:sign(null,Buffer.from(JSON.stringify(msg)),f.op.privateKey).toString("base64url")};
}
test("fresh real-session-shaped flow orders checks/signing/proposal, audit only",async()=>{
 const f=fixture(),r=await run(f);assert.equal(r.outcome,"proposal-created");
 assert.deepEqual(f.order,["auth","owner-pet-membership-source","signing","credential-check","proposal"]);
 assert.deepEqual(Object.keys(r).sort(),["outcome","count","bindingCount","environment","region","buildMatch","epochMatch"].sort());
 const text=JSON.stringify(r);for(const secret of [album,pet,"synthetic-owner","synthetic-session","https://","synthetic.jpg",f.m.nonce])assert.equal(text.includes(secret),false);
});
for(const [name,override,outcome]of [
 ["different-owner",{authenticate:async()=>({verifiedUserId:"different",sessionUserId:"different",accessToken:"x",sessionExpiresAt:now+3600000})},"source-denied"],
 ["wrong-subject",{authenticate:async()=>({verifiedUserId:"a",sessionUserId:"b",accessToken:"x",sessionExpiresAt:now+3600000})},"auth-denied"],
 ["expired-session",{authenticate:async()=>({verifiedUserId:"a",sessionUserId:"a",accessToken:"x",sessionExpiresAt:now})},"auth-denied"],
 ["refreshed-credential",{unchangedSession:async()=>false},"session-or-epoch-changed"],
 ["changed-source-set",{sign:async()=>new Map([["synthetic-photo",url("changed.jpg")]])},"source-changed"],
 ["membership-read-failure",{authorize:async()=>false},"source-denied"],
 ["publish-error",{publish:async()=>{throw Error("private-data-must-not-log")}},"handoff-failed"],
])test("denied handoff: "+name,async()=>{const f=fixture(),r=await run(f,override);assert.equal(r.outcome,outcome);assert.equal(f.stored.size,0)});
for(const [a,p]of [["33333333-3333-4333-8333-333333333333",pet],[album,"33333333-3333-4333-8333-333333333333"]])test("wrong album/canonical pet cannot enroll",async()=>{const f=fixture();assert.equal((await run(f,{},now,a,p)).outcome,"scope-denied");assert.equal(f.stored.size,0)});
test("insufficient current+next window refuses without auth",async()=>{const f=fixture();assert.equal((await run(f,{},1920001)).outcome,"insufficient-epoch-time");assert.equal(f.order.length,0);assert.equal((await run(f,{},2100000)).outcome,"insufficient-epoch-time")});
for(const patch of [{environment:"production"},{build:"c".repeat(40)},{region:"iad1"}])test("wrong runtime pin rejects: "+Object.keys(patch)[0],()=>{const f=fixture();assert.equal(parseHandoffIntent(JSON.stringify(f.m),intentDigest(f.m),{...f.runtime,...patch}),null)});
test("third slot/fifth binding cannot enter finite manifest",async()=>{const f=fixture(2);for(let i=0;i<2;i++){f.control.slot=i;await run(f,{authenticate:async()=>({...f.ctx,accessToken:"session-"+i})})}
 const control=sealed(f);assert.ok(verifySealedHandoff(f.m,control,f.runtime,now));assert.equal(control.manifest.groups.flatMap(g=>g.bindings).length,4);
 const third={...f.m,slots:[...f.m.slots,f.m.slots[0]]};assert.equal(parseHandoffIntent(JSON.stringify(third),intentDigest(third),f.runtime),null);
 const cert=structuredClone([...f.stored.values()][0]);cert.proposal.group.bindings.push("f".repeat(64));assert.equal(sealPrivateHandoff(f.m,[cert.proposal,[...f.stored.values()][1].proposal],f.runtime,now),null);
});
test("concurrent/duplicate requests never replace committed slot session",async()=>{const f=fixture();await Promise.all(Array.from({length:24},(_,i)=>run(f,{authenticate:async()=>({...f.ctx,accessToken:"session-"+i})})));assert.equal(f.stored.size,1);assert.equal(f.audits.filter(r=>r.outcome==="proposal-created").length,1);assert.equal((await run(f)).outcome,"duplicate-proposal")});
test("operator seal validates certificates, exact digest/epochs/runtime; OFF is mutable only",async()=>{
 const f=fixture();await run(f);const c=sealed(f);assert.ok(verifySealedHandoff(f.m,c,f.runtime,now));assert.ok(verifySealedHandoff(f.m,{...c,enabled:true},f.runtime,now));
 for(const patch of [{validUntil:c.validUntil+300000},{manifestDigest:"d".repeat(64)},{signature:"bad"},{certificates:[]},{manifest:{...c.manifest,build:"f".repeat(40)}}])assert.equal(verifySealedHandoff(f.m,{...c,...patch},f.runtime,now),null);
 assert.equal(verifySealedHandoff(f.m,c,f.runtime,2400000),null);
});
test("partial and duplicate-session enrollment produces no manifest",async()=>{const f=fixture(2);await run(f);assert.equal(sealPrivateHandoff(f.m,[...f.stored.values()].map(c=>c.proposal),f.runtime,now),null);f.control.slot=1;await run(f);assert.equal(sealPrivateHandoff(f.m,[...f.stored.values()].map(c=>c.proposal),f.runtime,now),null)});
test("private operator one-shot seal cannot retry/replace; manifest has no session secrets",async()=>{
 const f=fixture();await run(f);const parent=await mkdtemp(path.join(tmpdir(),"admission-test-")),dir=path.join(parent,"state");
 try{
  await import("node:fs/promises").then(x=>x.mkdir(dir,{mode:0o700}));
  await writeFile(path.join(dir,"state.json"),JSON.stringify({intent:f.m,pin:intentDigest(f.m),runtime:f.runtime,sealKey:priv(f.op)}),{mode:0o600});
  const get=async()=>JSON.stringify([...f.stored.values()][0]);assert.equal((await sealOnce(dir,get,()=>now)).outcome,"sealed");
  await assert.rejects(sealOnce(dir,get,()=>now));const s=await readFile(path.join(dir,"sealed.json"),"utf8");for(const value of ["synthetic-session",album,pet,"https://","synthetic.jpg"])assert.equal(s.includes(value),false);
 }finally{await rm(parent,{recursive:true,force:true})}
});
test("no public route/UI or cookie extraction added; only server-side document hook",async()=>{
 const source=await readFile("lib/album-persistence/private-source-handoff.ts","utf8");assert.match(source,/import "server-only"/);assert.match(source,/sec-fetch-dest/);assert.match(source,/getUser/);assert.match(source,/canUsePhotoInAlbum/);assert.match(source,/createPhotoPreviewUrls/);
 assert.doesNotMatch(source,/document.cookie|localStorage|SERVICE_ROLE|NEXT_PUBLIC_|console.*(token|proposal|signature)/);
});

test("server adapter enforces owner/RLS and document-only private transport",async()=>{
 const {default:vm}=await import("node:vm"),{default:ts}=await import("typescript"),{createRequire}=await import("node:module");
 const {canUsePhotoInAlbum}=await import("../lib/album-persistence/photo-eligibility.ts");
 const require=createRequire(import.meta.url),code=ts.transpileModule(await readFile("lib/album-persistence/private-source-handoff.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const scenario of ["valid","wrong-owner","wrong-photo-owner","prefetch","bad-grant","overwrite","suffix","missing","wrong-size","wrong-path","expired","zero-flags"]){
  const f=fixture(),exports={},logs=[];let writes=0,authCalls=0;
  const pathname="admission/"+f.m.nonce+"/slot-0.json";
  // Run the installed official SDK serializer with an explicitly synthetic,
  // non-provider-issued delegation fixture. No credential or network is used.
  const {presignUrl}=await import("@vercel/blob");
  const expiry=Date.now()+600000;
  const scope={pathname,operations:["put"],validUntil:expiry,maximumSizeInBytes:8192};
  const fixtureToken={clientSigningToken:Buffer.alloc(32,7).toString("base64url"),delegationToken:Buffer.from(JSON.stringify(scope)).toString("base64url")+".synthetic"};
  const result=await presignUrl(fixtureToken,{access:"private",operation:"put",pathname,validUntil:expiry,allowOverwrite:false,addRandomSuffix:false,maximumSizeInBytes:8192});
  const put=new URL(result.presignedUrl);
  assert.equal(put.searchParams.get("vercel-blob-allow-overwrite"),"false");
  assert.equal(put.searchParams.get("vercel-blob-add-random-suffix"),"false");
  if(scenario==="overwrite")put.searchParams.set("vercel-blob-allow-overwrite","true");
  if(scenario==="suffix")put.searchParams.set("vercel-blob-add-random-suffix","true");
  if(scenario==="missing")put.searchParams.delete("vercel-blob-allow-overwrite");
  if(scenario==="wrong-size")put.searchParams.set("vercel-blob-maximum-size-in-bytes","8193");
  if(scenario==="wrong-path")put.searchParams.set("pathname","different.json");
  if(scenario==="zero-flags")put.searchParams.set("vercel-blob-allow-overwrite","0");
  const grants=[{head:"https://synthetic.private.blob.vercel-storage.com/"+pathname,put:put.toString(),validUntil:scenario==="expired"?now-1:2400000}];if(scenario==="bad-grant")grants[0].put="http://synthetic.invalid/";
  const env={EDIT_SOURCE_HANDOFF_ENABLE:"true",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_SHA:build,VERCEL_REGION:"sin1",VERCEL_PROJECT_ID:"synthetic-project",EDIT_SOURCE_HANDOFF_INTENT:JSON.stringify(f.m),EDIT_SOURCE_HANDOFF_PIN:intentDigest(f.m),EDIT_SOURCE_HANDOFF_SIGNING_KEY:priv(f.app),EDIT_SOURCE_HANDOFF_BLOB_GRANTS:JSON.stringify(grants),EDIT_SOURCE_CANARY_CONTROL_ID:"ecfg_synthetic",EDIT_SOURCE_CANARY_CONTROL_TOKEN:"synthetic-control"};
  const user=scenario==="wrong-owner"?"other-owner":"synthetic-owner";
  const rows={albums:[{id:album,pet_id:pet,owner_user_id:"synthetic-owner"}],album_pets:[{album_id:album,pet_id:pet}],pets:[{id:pet,owner_user_id:"synthetic-owner"}],photos:[{id:"synthetic-photo",pet_id:pet,uploader_user_id:scenario==="wrong-photo-owner"?"other-owner":"synthetic-owner",storage_path:"synthetic.jpg",thumbnail_path:null}]};
  const client={auth:{async getUser(){authCalls++;return {data:{user:{id:user}},error:null}},async getSession(){return {data:{session:{user:{id:user},access_token:f.ctx.accessToken,expires_at:f.ctx.sessionExpiresAt/1000}},error:null}}},from(table){
   const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},maybeSingle(){single=true;return q},then(resolve){const list=rows[table].filter(r=>filters.every(fn=>fn(r)));return Promise.resolve(resolve({data:single?list[0]??null:list,error:null}))}};return q;
  }};
  vm.runInNewContext(code,{exports,process:{env},Date:{now:()=>now},Buffer,URL,AbortSignal,performance,console:{info:(_label,text)=>logs.push(JSON.parse(text))},fetch:async(url,options={})=>{
   if(String(url).includes("global-config.vercel.com"))return new Response(JSON.stringify(f.control),{status:200});
   if(options.method==="HEAD")return new Response(null,{status:writes?200:404});
   assert.equal(options.method,"PUT");writes++;return new Response("",{status:200});
  },require:n=>n==="server-only"?{}:n==="next/headers"?{headers:async()=>new Headers({"sec-fetch-dest":scenario==="prefetch"?"empty":"document",...(scenario==="prefetch"?{rsc:"1"}:{})})}:n.includes("photo-image-delivery")?{createPhotoPreviewUrls:async()=>f.fresh}:n.includes("photo-eligibility")?{canUsePhotoInAlbum}:n.includes("private-source-handoff-core")?{parseHandoffIntent,handoffEpochMatches:(m)=>handoffEpochMatches(m,now),verifySealedHandoff:(...a)=>verifySealedHandoff(...a,now),executePrivateHandoff:(...a)=>executePrivateHandoff(...a,()=>now)}:require(n)});
  const r=await exports.runPrivateSourceHandoff(client,album,pet,f.fresh);assert.equal(r.handled,true);
  assert.equal(writes,scenario==="valid"?1:0);if(scenario==="prefetch")assert.equal(authCalls,0);
  const text=JSON.stringify(logs);for(const value of [album,pet,"synthetic-owner","synthetic-control","synthetic-session","https://",f.m.nonce])assert.equal(text.includes(value),false);
 }
});
