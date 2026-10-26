import {test} from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createHeadingTrace,headingRun,headingSpan,headingSync,headingDuration,headingOutcome,headingFlush,headingCurrent}from'../lib/heading-trace-core.ts';
test('diagnostics are Preview opt-in only; never a user/auth cache',async()=>{
 const old={...process.env};try{for(const environment of ['production','preview']){process.env.VERCEL_ENV=environment;process.env.HEADING_DIAGNOSTICS_ENABLE='true';const t=createHeadingTrace();const result=await headingRun(t,()=>headingSpan('route.auth',async()=>17));assert.equal(result,17);assert.equal(t.pending.length,environment==='preview'?1:0)}
 process.env.HEADING_DIAGNOSTICS_ENABLE='false';assert.equal(headingCurrent(),undefined);
 }finally{process.env=old}
});
test('request context isolates concurrent traces, buffers metrics outside critical operations',async()=>{
 const old={...process.env};process.env.VERCEL_ENV='preview';process.env.HEADING_DIAGNOSTICS_ENABLE='true';try{
 const a=createHeadingTrace(),b=createHeadingTrace(),out=[];a.sink=e=>out.push(e);b.sink=e=>out.push(e);
 await Promise.all([headingRun(a,()=>headingSpan('route.auth',async()=>{await new Promise(r=>setTimeout(r,5));assert.equal(headingCurrent(),a)})),headingRun(b,()=>headingSpan('route.auth',async()=>{assert.equal(headingCurrent(),b)}))]);
 assert.notEqual(a.trace,b.trace);assert.equal(out.length,0);headingFlush(a);headingFlush(b);assert.equal(out.length,2);assert.deepEqual(new Set(out.map(e=>e.trace)),new Set([a.trace,b.trace]));assert.equal(headingCurrent(),undefined);
 }finally{process.env=old}
});
test('unknown stage/outcome is discarded, thrown work preserved, no private argument data',async()=>{
 const old={...process.env};process.env.VERCEL_ENV='preview';process.env.HEADING_DIAGNOSTICS_ENABLE='true';try{
 const t=createHeadingTrace(),events=[];t.sink=e=>events.push(e);
 await headingRun(t,async()=>{await assert.rejects(headingSpan('route.auth',()=>Promise.reject(new Error('private-secret'))));headingSync('private-secret',()=>null);headingOutcome('private-secret',1);headingDuration('source.optional',20);headingOutcome('reuse',20)});headingFlush(t);assert.equal(events.length,3);assert.equal(events[0].ok,false);assert.equal(JSON.stringify(events).includes('private-secret'),false);assert.ok(events.every(e=>e.durationMs>=0));
 }finally{process.env=old}
});
test('no query/URL/credential collection or source-loading policy change in client observer',async()=>{
 const source=await readFile('instrumentation-client.ts','utf8');assert.doesNotMatch(source,/currentSrc|document\.cookie|localStorage|sessionStorage|fetch\(|\.decode\(|fetchPriority|\.loading\s*=/);assert.match(source,/NEXT_PUBLIC_HEADING_DIAGNOSTICS/);assert.match(source,/data-heading-diagnostic/);
});
test('HTTP observer returns exact Response and never stores query/header values',async()=>{
 const old={...process.env},originalFetch=globalThis.fetch;process.env.VERCEL_ENV='preview';process.env.HEADING_DIAGNOSTICS_ENABLE='true';try{
 const {headingFetch}=await import('../lib/heading-trace-core.ts'),trace=createHeadingTrace(),response=new Response('opaque',{status:200}),events=[];trace.sink=e=>events.push(e);const target='https://synthetic.invalid/rest/v1/photos?id=private-marker',init={headers:{Authorization:'private-marker'}};let calls=0;
 globalThis.fetch=async(u,o)=>{calls++;assert.equal(u,target);assert.equal(o,init);return response};assert.equal(await headingRun(trace,()=>headingFetch(target,init)),response);headingFlush(trace);assert.equal(calls,1);assert.equal(events[0].stage,'http.db.photos');assert.equal(JSON.stringify(events).includes('private-marker'),false);assert.equal(trace.counts['http.db.photos'],1);
 }finally{globalThis.fetch=originalFetch;process.env=old}
});
