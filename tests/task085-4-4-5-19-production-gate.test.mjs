import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { runEditSourceCanary } from "../lib/album-persistence/edit-source-canary-core.ts";
import { readCanaryControl, configuredAdmission } from "../lib/album-persistence/source-canary-control.ts";
import { admissionDigest, admissionScope, parseFiniteAdmission } from "../lib/album-persistence/finite-source-admission.ts";
import { proposeSourceAdmission } from "../lib/album-persistence/signed-source-lease.ts";
const now=1000000, startWindow=Math.floor(now/300000), owner="synthetic-owner", album="synthetic-album";
const url=(exp=now+3600000)=>`https://synthetic.invalid/storage/v1/object/sign/pet-photos/synthetic.jpg?token=x.${Buffer.from(JSON.stringify({exp:exp/1000})).toString("base64url")}.x`;
const fresh=()=>new Map([["synthetic-photo",url()]]);
function setup(environment="production"){
 const base={version:1,environment,trial:"synthetic-fixed",build:"a".repeat(40),region:"sin1",startWindow,groups:[]};
 const lease={verifiedUserId:owner,sessionUserId:owner,accessToken:"synthetic-credential",sessionExpiresAt:now+3600000,scope:admissionScope("synthetic-project",base,album)};
 const raw={...base,groups:[proposeSourceAdmission(fresh(),lease,startWindow,now)]};
 const manifest=parseFiniteAdmission(JSON.stringify(raw),{environment,build:base.build,region:"sin1"});assert.ok(manifest);
 const env={environment,build:base.build,region:"sin1",project:"synthetic-project",enable:"true",manifest:JSON.stringify(raw),pin:admissionDigest(manifest)};
 const values=new Map(), metrics=[], namespaces=[],calls={control:0,session:0,get:0,set:0};
 const policy={version:1,enabled:true,manifestDigest:env.pin,validUntil:(startWindow+2)*300000};
 const deps={async control(){calls.control++;return {...policy}},async session(){calls.session++;return {data:{session:{user:{id:owner},access_token:lease.accessToken,expires_at:lease.sessionExpiresAt/1000}}}},store(namespace){namespaces.push(namespace);return {async get(k){calls.get++;return values.get(k)},async set(k,v){calls.set++;values.set(k,v)}}},metric(m){metrics.push(m)}};
 return {env,manifest,policy,deps,values,metrics,calls,namespaces,lease};
}
for(const environment of ["preview","production"])test("same gate code safely seeds/reuses and runtime OFF skips provider: "+environment,async()=>{
 const s=setup(environment),f=fresh();
 assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);
 const newer=new Map([["synthetic-photo",url(now+3700000)]]);
 const reused=await runEditSourceCanary(newer,"edit",owner,album,s.env,s.deps,now+100);
 assert.equal(reused.get("synthetic-photo"),f.get("synthetic-photo"));assert.equal(s.metrics.at(-1).outcome,"reuse");
 const counts={...s.calls};s.policy.enabled=false;
 assert.equal(await runEditSourceCanary(newer,"edit",owner,album,s.env,s.deps,now+200),newer);
 assert.equal(s.metrics.at(-1).outcome,"disabled");assert.equal(s.calls.get,counts.get);assert.equal(s.calls.session,counts.session);
 assert.equal(s.namespaces[0],`uchinoco-${environment}-source-lease-v1`);
});
test("Preview and Production cannot share admitted manifest or namespace",()=>{
 const p=setup("preview");assert.equal(configuredAdmission("edit",{...p.env,environment:"production"},now),null);
 const a=setup("production");assert.notEqual(admissionScope("synthetic-project",p.manifest,album),admissionScope("synthetic-project",a.manifest,album));
});
for(const route of ["page-editor","preview","complete","print","home","cover","other"])test("non-Edit is OFF: "+route,async()=>{
 const s=setup();const f=fresh();assert.equal(await runEditSourceCanary(f,route,owner,album,s.env,s.deps,now),f);assert.equal(s.calls.control,0);assert.equal(s.calls.get,0);
});
test("default OFF/malformed/missing pin/SHA/region/environment never call control",async()=>{
 const s=setup(), f=fresh();for(const env of [{...s.env,enable:undefined},{...s.env,enable:"false"},{...s.env,manifest:"{}"},{...s.env,pin:undefined},{...s.env,build:"b".repeat(40)},{...s.env,region:"iad1"},{...s.env,environment:"development"},{...s.env,project:undefined}]){
 assert.equal(await runEditSourceCanary(f,"edit",owner,album,env,s.deps,now),f);
 }assert.equal(s.calls.control,0);assert.equal(s.calls.get,0);
});
for(const fault of ["invalid","timeout","reject"])test("control "+fault+" falls OFF before optional work",async()=>{
 const s=setup(),f=fresh();s.deps.control=fault==="timeout"?()=>new Promise(()=>{}):fault==="reject"?async()=>{throw Error("private synthetic failure")}:async()=>({...s.policy,manifestDigest:"wrong"});
 const start=performance.now();assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);
 assert.equal(s.calls.session,0);assert.equal(s.calls.get,0);assert.ok(performance.now()-start<320);
 assert.equal(s.metrics.at(-1).outcome,{invalid:"control-invalid",timeout:"control-timeout",reject:"control-error"}[fault]);
});
test("runtime control cannot replace or extend fixed manifest",async()=>{
 const s=setup();for(const policy of [{...s.policy,validUntil:s.policy.validUntil+300000},{...s.policy,manifestDigest:"b".repeat(64)},{...s.policy,enabled:"true"},null]){
 const r=await readCanaryControl(async()=>policy,s.env.pin,s.policy.validUntil,now);assert.equal(r.enabled,false);
 }
});
for(const fault of ["sdk","provider","capacity-rejection","eviction","session-timeout"])test("adapter fresh fallback: "+fault,async()=>{
 const s=setup(),f=fresh();if(fault==="session-timeout")s.deps.session=()=>new Promise(()=>{});
 else if(fault==="sdk")s.deps.store=()=>{throw Error("SDK unavailable")};
 else s.deps.store=()=>({async get(){if(fault==="provider")throw Error("provider unavailable");return null},async set(){if(fault==="capacity-rejection")throw Error("capacity rejection")}});
 const start=performance.now();assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);
 assert.ok(performance.now()-start<250);assert.ok(["cache-unavailable","cache-error","seed","session-timeout"].includes(s.metrics.at(-1).outcome));
});
test("unapproved session, fifth key and refreshed credential do not issue cache I/O",async()=>{
 const s=setup(),f=fresh();s.deps.session=async()=>({data:{session:{user:{id:owner},access_token:"unapproved-third",expires_at:10000}}});
 assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);
 assert.equal(s.metrics.at(-1).outcome,"admission-denied");assert.equal(s.calls.get,0);assert.equal(s.calls.set,0);
});
test("aggregate schema never emits private fields or exceptions",async()=>{
 const s=setup();await runEditSourceCanary(fresh(),"edit",owner,album,s.env,s.deps,now);
 assert.deepEqual(Object.keys(s.metrics[0]).sort(),["controlElapsedMs","count","optionalElapsedMs","outcome","reusedCount"].sort());
 const log=JSON.stringify(s.metrics);for(const secret of [owner,album,"synthetic.jpg","synthetic-credential",s.env.pin,"https://"])assert.equal(log.includes(secret),false);
});
test("only Edit passes signed URL mapping, after auth/owner/pet, no loader rewrite",async()=>{
 const edit=await readFile("app/(app)/pets/[petId]/album/[albumId]/edit/page.tsx","utf8"),draft=await readFile("lib/album-persistence/read-draft.ts","utf8");
 assert.ok(edit.indexOf("if (!pet)")<edit.indexOf("mapSignedUrls:"));
 assert.ok(edit.indexOf("auth.getUser")<edit.indexOf("mapSignedUrls:"));
 assert.ok(draft.indexOf("const freshUrls")<draft.indexOf("options.mapSignedUrls(freshUrls)"));
 const adapter=await readFile("lib/album-persistence/edit-source-canary.ts","utf8");
 assert.match(adapter,/import "server-only"/);assert.match(adapter,/cache: "no-store"/);assert.match(adapter,/name: ""/);
 assert.doesNotMatch(adapter,/SERVICE_ROLE|NEXT_PUBLIC_|query|branch|cookie/);
});


test("eviction only loses reuse benefit and capacity rejection preserves sources",async()=>{
 const s=setup(),f=fresh();await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now);
 assert.equal(s.values.size,1);s.values.clear();
 const newer=new Map([["synthetic-photo",url(now+3800000)]]);
 assert.equal(await runEditSourceCanary(newer,"edit",owner,album,s.env,s.deps,now+50),newer);
 assert.equal(s.metrics.at(-1).outcome,"seed");
});
test("actual server adapter wiring uses isolated SDK namespace and fixed-schema logs",async()=>{
 const {default:vm}=await import("node:vm"),{default:ts}=await import("typescript");
 const code=ts.transpileModule(await readFile("lib/album-persistence/edit-source-canary.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const environment of ["preview","production"]){
  const s=setup(environment),exports={},logs=[],writes=[];
  const env={VERCEL_ENV:environment,VERCEL_GIT_COMMIT_SHA:s.env.build,VERCEL_REGION:"sin1",VERCEL_PROJECT_ID:s.env.project,EDIT_SOURCE_CANARY_ENABLE:"true",EDIT_SOURCE_CANARY_MANIFEST:s.env.manifest,EDIT_SOURCE_CANARY_PIN:s.env.pin,EDIT_SOURCE_CANARY_CONTROL_ID:"ecfg_synthetic",EDIT_SOURCE_CANARY_CONTROL_TOKEN:"synthetic-control-token"};
  const cache=new Map();let syntheticNow=now;
  vm.runInNewContext(code,{exports,process:{env},console:{info:(_label,value)=>logs.push(JSON.parse(value))},fetch:async(_url,options)=>{assert.equal(options.cache,"no-store");assert.ok(options.signal);return {ok:true,json:async()=>({...s.policy})}},require:n=>n==="server-only"?{}:n==="@vercel/functions"?{getCache(options){
   assert.equal(options.namespace,`uchinoco-${environment}-source-lease-v1`);assert.equal(options.keyHashFunction("opaque"),"opaque");
   return {async get(k){return cache.get(k)},async set(k,v,opts){assert.equal(opts.name,"");assert.ok(opts.ttl<=300);writes.push({k,v});cache.set(k,v)}};
  }}:n.includes("edit-source-canary-core")?{runEditSourceCanary:(...args)=>runEditSourceCanary(...args,syntheticNow+=10)}:{}});
  const client={auth:{getSession:s.deps.session}};
  const f=fresh();assert.equal(await exports.applyEditSourceCanary(client,owner,album,f),f);
  const next=new Map([["synthetic-photo",url(now+4000000)]]);
  assert.equal((await exports.applyEditSourceCanary(client,owner,album,next)).get("synthetic-photo"),f.get("synthetic-photo"));
  s.policy.enabled=false;assert.equal(await exports.applyEditSourceCanary(client,owner,album,next),next);assert.equal(writes.length,1);
  const serialized=JSON.stringify(logs);for(const privateText of [owner,album,s.env.pin,"https://","synthetic-control-token","synthetic-credential"])assert.equal(serialized.includes(privateText),false);
 }
});


test("SDK initialization shares the same deadline; OFF never initializes it",async()=>{
 const s=setup(),f=fresh();let factories=0;
 s.deps.store=()=>{factories++;return new Promise(()=>{})};
 const start=performance.now();assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);
 assert.equal(s.metrics.at(-1).outcome,"get-timeout");assert.ok(performance.now()-start<250);
 s.env.enable="false";assert.equal(await runEditSourceCanary(f,"edit",owner,album,s.env,s.deps,now),f);assert.equal(factories,1);
});
test("a fifth binding in an otherwise two-session manifest is invalid",()=>{
 const s=setup(),raw=JSON.parse(s.env.manifest),g=raw.groups[0];
 raw.groups=[{...g,bindings:[...g.bindings,"b".repeat(64)]},{sessionTag:"c".repeat(64),sourceSetTag:"d".repeat(64),bindings:["e".repeat(64),"f".repeat(64)]}];
 assert.equal(parseFiniteAdmission(JSON.stringify(raw),s.env),null);
});
test("other route sources cannot opt into the Edit adapter",async()=>{
 for(const route of ["page.tsx","pages/edit/page.tsx","cover/edit/page.tsx","print/page.tsx"]){
 const src=await readFile("app/(app)/pets/[petId]/album/[albumId]/"+route,"utf8");assert.doesNotMatch(src,/applyEditSourceCanary|mapSignedUrls/);
 }
});

