import "server-only";
import {cache} from "react";
import {headers} from "next/headers";
import {createHeadingTrace,headingEnabled,headingCurrent,headingRun,headingSpan,headingFlush} from "./heading-trace-core";
const requestTrace=cache(createHeadingTrace);
export async function withHeadingRequest<T>(stage:string,work:()=>Promise<T>):Promise<T>{
 if(!headingEnabled())return work();
 const c=requestTrace();
 const h=await headers();c.kind=h.has("next-router-prefetch")?"prefetch":h.has("rsc")?"navigation":"document";
 return headingRun(c,async()=>{try{return await headingSpan(stage,work)}finally{headingFlush(c)}});
}
export function headingMarker(){const c=headingCurrent();return c?{trace:c.trace,arm:c.arm,kind:c.kind,outcome:c.sourceOutcome??"not-observed",storageCount:c.counts["http.storage"]??0}:null}
export function headingClientTrace(){return headingEnabled()?(headingCurrent()??requestTrace()):undefined}
