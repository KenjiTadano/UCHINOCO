import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
export type HeadingTrace = {trace:string;started:number;arm:"setup"|"off"|"on";kind:"unknown"|"document"|"navigation"|"prefetch";count:number;sourceOutcome?:string;counts:Record<string,number>;pending:Record<string,unknown>[];sink?:(event:Record<string,unknown>)=>void};
const store=new AsyncLocalStorage<HeadingTrace>();
const stages=new Set(["layout.app","layout.pet","auth.layout.app","auth.layout.pet","owner.layout.pet","route.total","route.auth","route.album","route.pet","draft.total","draft.version","draft.spreads","draft.elements","draft.preview-urls","photo.read","signing","cover.read","cover.urls","source.adapter","admission.intent","admission.seal","admission.configured","lease.admission","source.session","cache.sdk","cache.get","cache.set","source.control.remote","source.optional","source.result","route.return","membership.calls","admission.epoch-match","admission.credential-match","admission.source-set-match","admission.exact-binding-match","admission.reason","admission.session-horizon"]);
const tables=new Set(["albums","pets","album_pets","album_draft_versions","album_draft_spreads","album_draft_frames","album_draft_text_elements","album_draft_decorations","album_draft_page_elements","album_draft_spread_backgrounds","album_draft_covers","photos"]);
export const headingEnabled=()=>process.env.VERCEL_ENV==="preview"&&process.env.HEADING_DIAGNOSTICS_ENABLE==="true";
export const createHeadingTrace=():HeadingTrace=>({trace:randomBytes(12).toString("hex"),started:performance.now(),arm:"setup",kind:"unknown",count:0,counts:{},pending:[]});
export const headingCurrent=()=>headingEnabled()?store.getStore():undefined;
export function headingRun<T>(trace:HeadingTrace,work:()=>T):T{return store.run(trace,work)}
function emit(stage:string,start:number,end:number,ok:boolean,value?:number,outcome?:string){
 const c=headingCurrent();if(!c||c.count>=500||!(stages.has(stage)||stage==="http.auth"||stage==="http.storage"||stage==="http.other"||stage.startsWith("http.db.")&&tables.has(stage.slice(8))))return;
 c.count++;c.counts[stage]=(c.counts[stage]??0)+1;const event={trace:c.trace,stage,offsetMs:Math.round((start-c.started)*1000)/1000,durationMs:Math.round((end-start)*1000)/1000,ok,arm:c.arm,kind:c.kind,...(value===undefined?{}:{value}),...(outcome===undefined?{}:{outcome})};
 c.pending.push(event);
}
export async function headingSpan<T>(stage:string,work:()=>PromiseLike<T>):Promise<T>{if(!headingCurrent())return await work();const s=performance.now();let ok=false;try{const v=await work();ok=true;return v}finally{emit(stage,s,performance.now(),ok)}}
export function headingSync<T>(stage:string,work:()=>T):T{if(!headingCurrent())return work();const s=performance.now();let ok=false;try{const v=work();ok=true;return v}finally{emit(stage,s,performance.now(),ok)}}
export function headingDuration(stage:string,duration:number){const e=performance.now();if(Number.isFinite(duration)&&duration>=0)emit(stage,e-duration,e,true,duration)}
export function headingOutcome(outcome:string,count:number){const allowed=new Set(["reuse","seed","disabled","admission-denied","control-timeout","control-error","control-invalid","session-timeout","get-timeout","set-timeout","cache-unavailable","cache-error","invalid-entry","seed-skipped-budget"]);if(allowed.has(outcome)&&Number.isFinite(count)){const c=headingCurrent();if(c)c.sourceOutcome=outcome;emit("source.result",performance.now(),performance.now(),true,count,outcome)}}
export async function headingFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 let stage="http.other";
 try{const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(u.pathname.startsWith("/auth/v1/"))stage="http.auth";else if(u.pathname.startsWith("/storage/v1/"))stage="http.storage";else if(u.pathname.startsWith("/rest/v1/")){const t=u.pathname.split("/")[3];if(tables.has(t))stage="http.db."+t}}catch{}
 const started=performance.now();try{const r=await fetch(input,init);const category=r.status>=200&&r.status<300?"2xx":r.status>=400&&r.status<500?"4xx":r.status>=500?"5xx":"other";emit(stage,started,performance.now(),r.ok,1,category);return r}catch(error){emit(stage,started,performance.now(),false,1,"fetch-error");throw error}
}

export function headingFlush(c:HeadingTrace){for(const event of c.pending.splice(0)){try{if(c.sink)c.sink(event);else console.info("Heading diagnostic",JSON.stringify(event));}catch{}}}

export function headingCount(stage:string,value:number){const t=performance.now();if(Number.isFinite(value)&&value>=0)emit(stage,t,t,true,value)}

export function headingAdmission(value:{reason:string;epochMatch:boolean;credentialMatch:boolean;sourceSetMatch:boolean;exactBindingMatch:boolean}){
 if(!headingCurrent())return;
 for(const [stage,match]of [["admission.epoch-match",value.epochMatch],["admission.credential-match",value.credentialMatch],["admission.source-set-match",value.sourceSetMatch],["admission.exact-binding-match",value.exactBindingMatch]] as const)headingCount(stage,match?1:0);
 if(["match","epoch-expired","credential-mismatch","source-set-mismatch","unknown"].includes(value.reason))emit("admission.reason",performance.now(),performance.now(),true,1,value.reason);
}
