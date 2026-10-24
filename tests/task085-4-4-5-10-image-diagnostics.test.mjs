import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {diagnosticRoute,finiteTiming,resourceTimingData} from '../lib/diagnostics/image-timing-data.ts';

const privateUrl='https://synthetic.invalid/private/photo.jpg?token=synthetic-secret';
test('resource DTO is a numeric allowlist, not raw entry serialization',()=>{
 const entry={name:privateUrl,pathname:'/private',token:'synthetic-secret',startTime:12,responseStart:0,responseEnd:50,duration:38,transferSize:0,encodedBodySize:0,decodedBodySize:0,initiatorType:'img',toJSON(){throw Error('must not serialize')}};
 const data=resourceTimingData(entry);assert.equal(data.responseEnd,50);assert.equal(data.detailTimingExposed,false);assert.equal(data.transferSize,0);assert.equal(JSON.stringify(data).includes('synthetic'),false);assert.equal('name'in data,false);assert.equal('toJSON'in data,false);
});
test('sanitizer never reads name getter or emits arbitrary initiator text',()=>{const entry={get name(){throw Error('private name accessed')},initiatorType:privateUrl,responseStart:5};assert.equal(resourceTimingData(entry).initiatorType,'other');assert.equal(resourceTimingData(entry).detailTimingExposed,true)});
test('non-finite and string timing values cannot carry payloads',()=>{for(const x of [NaN,Infinity,-1,privateUrl,{},null])assert.equal(finiteTiming(x),0);assert.equal(finiteTiming(1.26),1.3)});
test('route classification emits only generic enums and excludes Print/Cover/login',()=>{assert.equal(diagnosticRoute('/pets/synthetic/album/synthetic/edit',''),'edit');assert.equal(diagnosticRoute('/pets/synthetic/album/synthetic/pages/edit',''),'page-editor');assert.equal(diagnosticRoute('/pets/synthetic/album/synthetic','?view=preview'),'preview');for(const path of ['/login','/home','/pets/synthetic/album/synthetic/print','/pets/synthetic/album/synthetic/cover/edit'])assert.equal(diagnosticRoute(path,''),null)});

async function harness({complete=false,opacity='0',ready=true}={}){
 let clock=10;const timers=[],docEvents={},winEvents={};const output={id:'image-timing-diagnostics',textContent:'',dataset:{observerReady:ready?'1':'0'}};
 class FakeElement{constructor(){this.id='';this.parentElement=null;this.isConnected=true}getBoundingClientRect(){return {x:10,y:10,left:10,top:10,right:110,bottom:110,width:100,height:100}}closest(){return null}}
 class FakeImage extends FakeElement{constructor(){super();this.complete=complete;this.naturalWidth=complete?100:0;this.naturalHeight=complete?100:0;this.src=privateUrl;this.currentSrc=privateUrl}getAttribute(k){return k==='src'?privateUrl:k==='loading'?'eager':k==='decoding'?'async':null}}
 const img=new FakeImage(),document={images:[img],readyState:'interactive',documentElement:new FakeElement(),getElementById:()=>output,querySelector:()=>({textContent:'アルバムを編集'}),addEventListener:(name,cb)=>docEvents[name]=cb,removeEventListener:(name)=>delete docEvents[name]};
 let resourceCallback;class PO{constructor(cb){resourceCallback=cb}observe(){resourceCallback({getEntries:()=>[{name:privateUrl,initiatorType:'img',startTime:1,responseStart:20,responseEnd:40,duration:39,transferSize:200,encodedBodySize:100,decodedBodySize:100}]})}disconnect(){}}
 class MO{constructor(cb){this.cb=cb}observe(){}disconnect(){}}
 const code=ts.transpileModule(await readFile('lib/diagnostics/image-timing-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:()=>({diagnosticRoute,finiteTiming,resourceTimingData}),document,window:{addEventListener:(n,cb)=>winEvents[n]=cb,removeEventListener:n=>delete winEvents[n]},location:{pathname:'/pets/synthetic/album/synthetic/edit',search:''},performance:{now:()=>clock,timeOrigin:1000,getEntriesByType:()=>[{name:privateUrl,startTime:0,responseStart:1,responseEnd:5,loadEventStart:0,loadEventEnd:0}]},Element:FakeElement,HTMLImageElement:FakeImage,PerformanceObserver:PO,MutationObserver:MO,Map,Number,JSON,Math,Boolean,innerWidth:380,innerHeight:715,getComputedStyle:()=>({display:'block',visibility:'visible',opacity,overflowX:'visible',overflowY:'visible'}),setTimeout:cb=>{timers.push(cb);return timers.length},clearTimeout(){}});
 exports.installImageTimingDiagnostics();return {img,document,docEvents,winEvents,timers,output,setClock:t=>clock=t,read:()=>JSON.parse(output.textContent)};
}
test('runtime URL match publishes sanitized timing, and opacity-zero image remains viewport allocated',async()=>{const h=await harness();const data=h.read();assert.equal(data.images[0].viewport,'full');assert.equal(data.images[0].opacity,0);assert.equal(data.images[0].resources[0].responseEnd,40);assert.equal(h.output.textContent.includes('synthetic'),false);assert.equal(data.images[0].complete,false);assert.equal(h.img.src,privateUrl)});
test('capture load/error times without changing image or invoking decode',async()=>{const h=await harness();h.setClock(100);h.img.complete=true;h.img.naturalWidth=100;h.img.naturalHeight=100;h.docEvents.load({target:h.img,type:'load'});h.setClock(110);h.docEvents.error({target:h.img,type:'error'});h.setClock(120);h.winEvents.load();const d=h.read();assert.deepEqual(d.images[0].loadEvents,[100]);assert.deepEqual(d.images[0].errorEvents,[110]);assert.equal(d.images[0].completeObservedAt,100);assert.equal(d.documentLoadAt,120);assert.equal(d.decode,'UNVERIFIED_NOT_INVOKED');assert.equal(h.img.src,privateUrl)});
test('already complete images do not receive invented load events',async()=>{const h=await harness({complete:true});const d=h.read();assert.equal(d.images[0].loadEventUnavailable,true);assert.deepEqual(d.images[0].loadEvents,[]);assert.equal(d.images[0].completeObservedAt,10)});
test('bounded stop publishes final record and detaches listeners',async()=>{const h=await harness();h.setClock(31000);h.timers.at(-1)();assert.equal(h.read().stopped,true);assert.equal(h.docEvents.load,undefined);assert.equal(h.docEvents.error,undefined)});
test('diagnostic scope uses Preview build flag and no image/network mutation',async()=>{const [entry,config,layout,client]=await Promise.all(['instrumentation-client.ts','next.config.ts','app/layout.tsx','lib/diagnostics/image-timing-client.ts'].map(f=>readFile(f,'utf8')));assert.match(entry,/NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS === "1"/);assert.match(config,/process.env.VERCEL_ENV === "preview" \? "1" : "0"/);assert.match(layout,/process.env.VERCEL_ENV === "preview"/);assert.doesNotMatch(client,/\.decode\s*\(|new Image\s*\(|fetch\s*\(|sendBeacon\s*\(|console\./);assert.doesNotMatch(client,/\.src\s*=|setAttribute\s*\(/)});
test('Production omits diagnostic DOM and disables client build flag',async()=>{
 const compile=async file=>ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const [layout,config]=await Promise.all([compile('app/layout.tsx'),compile('next.config.ts')]);
 for(const mode of ['production','preview']){
  const exports={},jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
  vm.runInNewContext(layout,{exports,URL,process:{env:{VERCEL_ENV:mode}},require:name=>name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='./image-timing-outlet'?{PreviewImageTimingOutlet:()=>jsx('output',{id:'image-timing-diagnostics',hidden:true})}:name==='next/font/google'?Object.fromEntries(['Geist','Geist_Mono','Klee_One','Zen_Kurenaido'].map(k=>[k,()=>({variable:'synthetic-font'})])):{}});
  const tree=exports.default({children:'app'});const serialized=JSON.stringify(tree);assert.equal(serialized.includes('image-timing-diagnostics'),mode==='preview');
  const configExports={};vm.runInNewContext(config,{exports:configExports,URL,process:{env:{VERCEL_ENV:mode}}});assert.equal(configExports.default.env.NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS,mode==='preview'?'1':'0');
 }
});

test('image preloads retain allowlisted link initiator for runtime DOM matching',()=>{assert.equal(resourceTimingData({initiatorType:'link',startTime:1,responseEnd:2}).initiatorType,'link')});

test('events captured early leave DOM untouched until hydration readiness',async()=>{const h=await harness({ready:false});assert.equal(h.output.textContent,'');h.setClock(100);h.img.complete=true;h.img.naturalWidth=100;h.docEvents.load({target:h.img,type:'load'});assert.equal(h.output.textContent,'');h.output.dataset.observerReady='1';h.setClock(200);h.timers.at(-1)();assert.deepEqual(h.read().images[0].loadEvents,[100]);assert.equal(h.read().images[0].completeObservedAt,100)});
test('client outlet independently returns null when Preview build flag is disabled',async()=>{
 const code=ts.transpileModule(await readFile('app/image-timing-outlet.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const enabled of ['0','1']){
  const exports={};vm.runInNewContext(code,{exports,process:{env:{NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS:enabled}},require:n=>n==='react'?{useRef:()=>({current:null}),useEffect:()=>{}}:{jsx:(type,props)=>({type,props})}});
  const rendered=exports.PreviewImageTimingOutlet();assert.equal(rendered===null,enabled==='0');if(rendered)assert.equal(rendered.props.hidden,true);
 }
});
