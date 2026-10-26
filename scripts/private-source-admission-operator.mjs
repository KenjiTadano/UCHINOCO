#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {generateKeyPairSync,randomBytes,sign,verify,createPublicKey,createPrivateKey} from "node:crypto";
import {pathToFileURL} from "node:url";
import {parseHandoffIntent,intentDigest,handoffEpochMatches,sealPrivateHandoff,verifySealedHandoff} from "../lib/album-persistence/private-source-handoff-core.ts";
const json = async p => JSON.parse(await fs.readFile(p,"utf8"));
async function privateRead(p){const s=await fs.lstat(p);if(s.isSymbolicLink()||(s.mode&0o077)!==0||s.size>65536)throw Error("Private file permissions required");return json(p)}
async function writeOnce(p,value){await fs.writeFile(p,JSON.stringify(value),{flag:"wx",mode:0o600})}
function keys(){const k=generateKeyPairSync("ed25519");return {public:k.publicKey.export({format:"pem",type:"spki"}).toString(),private:k.privateKey.export({format:"pem",type:"pkcs8"}).toString()}}
export async function stageOnce(dir,input){
 const sha=spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout.trim();
 if(input.build!==sha||!/^[a-f0-9]{40}$/.test(sha)||input.region!=="sin1"||!["preview","production"].includes(input.environment))throw Error("Observed source required");
 const currentWindow=Math.floor(Date.now()/300000);
 if(!Number.isInteger(input.startWindow)||input.startWindow<currentWindow||input.startWindow>currentWindow+2)throw Error("Fixed near-term epoch required");
 const app=keys(),operator=keys(),m={version:1,environment:input.environment,build:sha,region:input.region,trial:input.trial,startWindow:input.startWindow,nonce:randomBytes(32).toString("hex"),proposalPublicKey:app.public,sealPublicKey:operator.public,slots:input.slots};
 const runtime={environment:m.environment,build:sha,region:"sin1"},pin=intentDigest(m);
 const intent=parseHandoffIntent(JSON.stringify(m),pin,runtime);if(!intent)throw Error("Invalid intent");
 await fs.mkdir(dir,{mode:0o700});
 await writeOnce(path.join(dir,"state.json"),{intent,pin,runtime,appKey:app.private,sealKey:operator.private});
 return {outcome:"staged",count:0,bindingCount:0,environment:m.environment,region:m.region,buildMatch:true,epochMatch:false};
}
export async function sealOnce(dir,readCertificate,now=()=>Date.now()){
 const state=await privateRead(path.join(dir,"state.json")),m=parseHandoffIntent(JSON.stringify(state.intent),state.pin,state.runtime);
 if(!m)throw Error("Invalid private state");
 const guard=await fs.open(path.join(dir,"seal.once"),"wx",0o600);await guard.close();
 const certificates=[];
 for(let slot=0;slot<m.slots.length;slot++){
  const text=await readCertificate(slot,m);
  if(Buffer.byteLength(text)>8192)throw Error("Oversize handoff");
  const c=JSON.parse(text);
  if(!c||!c.proposal||typeof c.signature!=="string"||!verify(null,Buffer.from(JSON.stringify(c.proposal)),createPublicKey(m.proposalPublicKey),Buffer.from(c.signature,"base64url")))throw Error("Unverified handoff");
  certificates.push(c);
 }
 const sealed=sealPrivateHandoff(m,certificates.map(c=>c.proposal),state.runtime,now());
 if(!sealed)throw Error("Incomplete handoff");
 const message={intentDigest:intentDigest(m),manifest:sealed.manifest,digest:sealed.digest,certificates};
 const control={version:1,phase:"trial",enabled:false,validUntil:(m.startWindow+2)*300000,intentDigest:message.intentDigest,manifest:sealed.manifest,manifestDigest:sealed.digest,certificates,signature:sign(null,Buffer.from(JSON.stringify(message)),createPrivateKey(state.sealKey)).toString("base64url")};
 if(!verifySealedHandoff(m,control,state.runtime,now()))throw Error("Seal validation failed");
 await writeOnce(path.join(dir,"sealed.pending"),control);
 await fs.rename(path.join(dir,"sealed.pending"),path.join(dir,"sealed.json"));
 return {outcome:"sealed",count:certificates.length,bindingCount:certificates.length*2,environment:m.environment,region:m.region,buildMatch:true,epochMatch:true};
}
function cliApi(connection,endpoint,method="GET",body){
 const cli=process.env.VERCEL_CLI_PATH;if(!cli)throw Error("CLI path required");
 const r=spawnSync(process.execPath,[cli,"--scope",connection.scope,"api",endpoint,"--method",method,...(body?["--input","-"]:[])],{input:body?JSON.stringify(body):undefined,encoding:"utf8",maxBuffer:2e7});
 if(r.status)throw Error("Private management operation failed");
 return r.stdout.trim()?JSON.parse(r.stdout):null;
}
function allowEnvironment(state,productionAuthorized){if(state.runtime.environment!=="preview"&&!productionAuthorized)throw Error("Production operation not authorized")}
export async function operatorCommand(command,dir,connectionPath,productionAuthorized=false){
 const s=await privateRead(path.join(dir,"state.json")),m=s.intent,c=await privateRead(connectionPath);allowEnvironment(s,productionAuthorized);
 if(process.env.DEBUG?.includes("blob")||process.env.NEXT_PUBLIC_DEBUG?.includes("blob"))throw Error("Verbose provider diagnostics forbidden");
 const api=(p,method,body)=>cliApi(c,p,method,body);
 if(!/^prj_[a-zA-Z0-9]+$/.test(c.projectId)||!/^ecfg_[a-zA-Z0-9]+$/.test(c.controlId))throw Error("Invalid private connection");
 const config=api("/v1/global-config").find(x=>x.id===c.controlId);
 if(!config||config.slug!=="uchinoco-admission-"+m.trial)throw Error("Unexpected control");
 if(["arm","publish","on"].includes(command)){
  const d=api("/v13/deployments/"+c.deploymentId);
  if(d.readyState!=="READY"||(d.projectId??d.project?.id)!==c.projectId||d.meta?.githubCommitSha!==m.build||(s.runtime.environment==="preview"&&d.meta?.githubCommitRef!==c.branch)||d.regions?.length!==1||d.regions[0]!=="sin1"||(d.target==="production")!==(s.runtime.environment==="production"))throw Error("Observed runtime mismatch");
 }
 const putControl=value=>api("/v1/global-config/"+c.controlId+"/items","PATCH",{items:[{operation:"upsert",key:"editReuse",value}]});
 if(command==="issue-grants"){
  const {issueSignedToken,presignUrl}=await import("@vercel/blob");
  const blobGrants=[];
  for(let slot=0;slot<m.slots.length;slot++){
   const pathname=`admission/${m.nonce}/slot-${slot}.json`,validUntil=(m.startWindow+2)*300000;
   const issued=await issueSignedToken({token:c.blobToken,pathname,operations:["put","head"],validUntil,allowedContentTypes:["application/json"],maximumSizeInBytes:8192});
   const put=await presignUrl(issued,{access:"private",operation:"put",pathname,validUntil,allowOverwrite:false,addRandomSuffix:false,allowedContentTypes:["application/json"],maximumSizeInBytes:8192});
   const head=await presignUrl(issued,{access:"private",operation:"head",pathname,validUntil});
   blobGrants.push({put:put.presignedUrl,head:head.presignedUrl,validUntil});
  }
  await writeOnce(path.join(dir,"connection-with-grants.json"),{...c,blobGrants});
 }else if(command==="configure-preview"||command==="configure"){
  const target=s.runtime.environment;
  if(command==="configure-preview"&&target!=="preview")throw Error("Preview only");
  if(target==="preview"&&(!c.branch?.startsWith("codex/")||c.branch==="main"))throw Error("Preview branch required");
  const current=api("/v10/projects/"+c.projectId+"/env").envs;
  const values={EDIT_SOURCE_HANDOFF_ENABLE:"true",EDIT_SOURCE_HANDOFF_INTENT:JSON.stringify(m),EDIT_SOURCE_HANDOFF_PIN:s.pin,EDIT_SOURCE_HANDOFF_SIGNING_KEY:s.appKey,EDIT_SOURCE_HANDOFF_BLOB_GRANTS:JSON.stringify(c.blobGrants),EDIT_SOURCE_CANARY_ENABLE:"true",EDIT_SOURCE_CANARY_CONTROL_ID:c.controlId,EDIT_SOURCE_CANARY_CONTROL_TOKEN:c.controlToken};
  if(current.some(e=>(target==="preview"?e.gitBranch===c.branch:!e.gitBranch&&e.target?.includes("production"))&&Object.hasOwn(values,e.key)))throw Error("Refuse existing enrollment");
  putControl({version:1,phase:"handoff",enabled:false,armed:false,intentDigest:s.pin,slot:0,validUntil:(m.startWindow+2)*300000});
  const records=[];
  // Control is OFF throughout installation; a partial install is never enabled.
  for(const [key,value]of Object.entries(values)){const r=api("/v10/projects/"+c.projectId+"/env","POST",{key,value,type:"sensitive",target:[target],...(target==="preview"?{gitBranch:c.branch}:{})});const e=r.created??r;records.push({id:e.id,key,target:e.target,gitBranch:e.gitBranch});await fs.writeFile(path.join(dir,"installed.json"),JSON.stringify(records),{mode:0o600})}
 }else if(command==="seal"){
  const {get}=await import("@vercel/blob");
  try{return await sealOnce(dir,async(slot,intent)=>{
   const r=await get(`admission/${intent.nonce}/slot-${slot}.json`,{access:"private",token:c.blobToken,useCache:false,abortSignal:AbortSignal.timeout(5000)});
   if(!r||r.statusCode!==200)throw Error("Missing proposal");
   let bytes=0;const chunks=[];for await(const chunk of r.stream){bytes+=chunk.length;if(bytes>8192)throw Error("Oversize proposal");chunks.push(Buffer.from(chunk))}return Buffer.concat(chunks).toString("utf8");
  });}catch{putControl({version:1,phase:"handoff",enabled:false,armed:false,intentDigest:s.pin,slot:0,validUntil:(m.startWindow+2)*300000});throw Error("Handoff failed; control OFF")}
 }else if(command==="arm"){
  if(!handoffEpochMatches(m))throw Error("Insufficient epoch time");
  const slot=Number(process.env.ADMISSION_SLOT??"0");if(!Number.isInteger(slot)||slot<0||slot>=m.slots.length)throw Error("Unapproved slot");
  try{await fs.access(path.join(dir,"seal.once"));throw Error("Trial already finalized")}catch(error){if(error.code!=="ENOENT")throw error}
  putControl({version:1,phase:"handoff",enabled:false,armed:true,intentDigest:s.pin,slot,validUntil:(m.startWindow+2)*300000});
 }else if(["publish","on","off"].includes(command)){
  let control;
  try{control=await privateRead(path.join(dir,"sealed.json"))}catch{if(command!=="off")throw Error("No sealed manifest")}
  if(control){
   if(command!=="off"&&!verifySealedHandoff(m,control,s.runtime))throw Error("Expired or invalid seal");
   putControl({...control,enabled:command==="on"});
  }else putControl({version:1,phase:"handoff",enabled:false,armed:false,intentDigest:s.pin,slot:0,validUntil:(m.startWindow+2)*300000});
 }else throw Error("Unknown operator command");
 return {outcome:command,count:0,bindingCount:0,environment:m.environment,region:m.region,buildMatch:true,epochMatch:false};
}
async function main(){
 const args=process.argv.slice(2),command=args[0],dir=args[1],input=args[2];
 if(!dir||!input)throw Error("Private state/input path required");
 if(command==="stage"){
  const v=await privateRead(input);if(v.environment==="production"&&!args.includes("--production-authorized"))throw Error("Production preparation not authorized");
  console.log(JSON.stringify(await stageOnce(dir,v)));
 }else console.log(JSON.stringify(await operatorCommand(command,dir,input,args.includes("--production-authorized"))));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({outcome:"operator-failed",count:0,bindingCount:0,buildMatch:false,epochMatch:false}));process.exitCode=1});
