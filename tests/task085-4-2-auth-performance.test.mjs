import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const require=createRequire(import.meta.url);
function load(file,overrides={},env={},logs=[]){
 const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{exports,URL,Headers,Request,fetch,performance,process:{env:{VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://auth.example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',...env}},console:{info:(name,payload)=>logs.push({name,...JSON.parse(payload)})},require(name){if(name in overrides)return overrides[name];if(name==='server-only')return {};if(name.startsWith('node:'))return require(name);throw Error('Unmocked '+name);}});
 return exports;
}
test('route and trace metadata never contain identifiers, query strings or credentials',async()=>{
 const logs=[];const core=load('lib/auth-performance-core.ts',{}, {},logs);
 assert.equal(core.authRoute('/pets/private-pet/album/private-album','preview'),'preview');
 const t=core.newAuthTrace('email@example.test');assert.equal(t.route,'other');
 await core.authTraceWork(t,'layout.app',async()=>{});
 assert.equal(logs.length,2);assert.equal(logs[0].requestId,logs[1].requestId);
 assert.ok(!JSON.stringify(logs).includes('private-'));assert.ok(!JSON.stringify(logs).includes('email@'));
 const bad=core.forwardedAuthTrace(new Headers({'x-uchinoco-auth-trace':'malicious\tvalue','x-uchinoco-auth-start':'0','x-uchinoco-auth-route':'secret-route'}));assert.equal(bad.route,'other');assert.notEqual(bad.requestId,'malicious\tvalue');
});
test('proxy preserves getClaims, refresh cookies and response headers, overwrites untrusted trace headers',async()=>{
 const logs=[];const core=load('lib/auth-performance-core.ts',{}, {},logs);let claims=0;let options;
 const request={headers:new Headers({'x-uchinoco-auth-trace':'attacker','cookie':'synthetic-cookie'}),nextUrl:new URL('https://app.example.test/pets/synthetic'),cookies:{getAll:()=>[],set(name,value){request.headers.set('cookie',name+'='+value);}}};
 const proxy=load('lib/supabase/proxy.ts',{'../auth-performance-core':core,'@supabase/ssr':{createServerClient(_url,_key,o){options=o;return {auth:{async getClaims(){claims++;o.cookies.setAll([{name:'session',value:'synthetic-refreshed',options:{httpOnly:true}}],{'cache-control':'private,no-store'});return {data:{claims:{sub:'not-logged'}}};}}};}},'next/server':{NextResponse:{next(o){return {forwarded:o.request.headers,headers:new Headers(),cookies:{set(){}}};}}}}, {},logs);
 const result=await proxy.updateSession(request);assert.equal(claims,1);assert.notEqual(result.forwarded.get('x-uchinoco-auth-trace'),'attacker');assert.equal(result.forwarded.get('cookie'),'session=synthetic-refreshed');assert.equal(result.headers.get('cache-control'),'private,no-store');assert.ok(options.global.fetch);assert.ok(!JSON.stringify(logs).includes('synthetic-refreshed'));assert.ok(!JSON.stringify(logs).includes('not-logged'));
});
test('Auth fetch attempts differ from physical undici requests when downstream deduplicates',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;const logs=[];const core=load('lib/auth-performance-core.ts',{}, {NEXT_PUBLIC_SUPABASE_URL:origin},logs);let shared;
  const measured=core.authMeasuredFetch(core.newAuthTrace('home'),(input,init)=>shared??=(fetch(input,init)));
  await Promise.all([measured(origin+'/auth/v1/user'),measured(origin+'/auth/v1/user')]);
  assert.equal(logs.filter(x=>x.phase.endsWith('fetch.auth.start')).length,2);assert.equal(logs.filter(x=>x.phase==='http.auth.request').length,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('instrumentation disabled leaves downstream fetch behavior unchanged',async()=>{
 const logs=[];const core=load('lib/auth-performance-core.ts',{}, {VERCEL_ENV:'production'},logs);let calls=0;
 const value={status:200};assert.equal(await core.authMeasuredFetch(core.newAuthTrace('home'),async()=>{calls++;return value;})('https://auth.example.test/auth/v1/user'),value);assert.equal(calls,1);assert.equal(logs.length,0);
});

test('login browser timing keeps form action and records only phase/time, with no input reads',()=>{
 const logs=[];const jsx=(type,props)=>({type,props});const client=load('app/_components/auth-browser-timing.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},react:{useEffect:fn=>fn()}},{},logs);const action=async()=>{};
 const form=client.AuthTimingForm({action,children:'synthetic-children',enabled:true});assert.equal(form.type,'form');assert.equal(form.props.action,action);assert.equal(form.props.children,'synthetic-children');form.props.onSubmit();client.AuthHomeTiming({enabled:true});assert.deepEqual(logs.map(l=>l.phase),['login.submit','home.committed']);assert.ok(logs.every(l=>Object.keys(l).sort().join(',')==='atMs,name,phase'));
 const n=logs.length;client.AuthTimingForm({action,enabled:false}).props.onSubmit();client.AuthHomeTiming({enabled:false});assert.equal(logs.length,n);
});
