import test from 'node:test';
import assert from 'node:assert/strict';
import { requestModules } from './helpers/album-request-modules.mjs';
import { requestTransport } from '../lib/request-transport.ts';
const view=()=>({albumId:'album',versionId:'v',revision:6,status:'editing',signature:'fixture',previewUrls:{},thumbnailUrls:{},spreads:Array.from({length:5},(_,i)=>({id:'s'+i,sourceFrames:[{aiPhotoId:'p'+i,userPhotoId:i===0?'replacement':null}],frames:[{effectivePhotoId:i===0?'replacement':'p'+i}],layoutRanking:{position:i}}))});
const pin={versionId:'v',revision:6,coverRevision:2,coverClientSeq:3};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup({lateChange=false,kind='revision',hold=false,prepared=false,deferCover=false}={}){
 const calls=[],paths=[],near=deferred(),remaining=deferred(),cover=deferred();let checks=0,reads=0;
 const load=requestModules({'../auth-performance-core.ts':{baselineProgressiveDelivery:()=>false},'../server-io-observer.ts':{observeIo(){}},'../album-load-trace.ts':{traceAlbumLoad:async(_s,f)=>f()},'./read-draft.ts':{readDraft:async()=>{reads++;return view()},signedPreviewUrls:async(_db,ids,_r,_u,thumbs)=>{calls.push(Array.from(ids));if(hold&&ids.includes('p1'))await near.promise;if(hold&&ids.includes('p3'))await remaining.promise;ids.forEach(id=>thumbs.set(id,'thumb/'+id));return new Map(ids.map(id=>[id,'main/'+id]));}}});
 const db={from(table){assert.equal(table,'album_draft_covers');const q={select(s){assert.match(s,/album_draft_versions!inner/);return q},eq(){return q},abortSignal(signal){assert.ok(signal);return q},async maybeSingle(){checks++;const changed=lateChange&&checks===2;const active={id:'v',revision:changed&&kind==='revision'?7:6,is_active:!(changed&&kind==='active'),album_id:'album'};return {data:changed&&kind==='missing'?null:{revision:changed&&kind==='cover'?3:2,client_seq:changed&&kind==='sequence'?4:3,album_draft_versions:active},error:changed&&kind==='error'?{message:'failed'}:null}}};return q}};
 const stream=load('lib/album-persistence/progressive-draft.ts').streamDraft(db,{userId:'synthetic-owner',photoRecords:async ids=>{paths.push(Array.from(ids));return []}},'album',{id:'v',revision:6},deferCover?cover.promise:{revision:2,clientSeq:3},undefined,prepared?Promise.resolve(view()):undefined);return {stream,calls,paths,near,remaining,cover,get checks(){return checks},get reads(){return reads}};
}
test('one metadata batch, two fresh joined validations, and bounded parallel tail groups',async()=>{
 const f=setup({hold:true});try{const a=await f.stream.primary;assert.equal(a.ok,true);assert.ok(a.base);await new Promise(setImmediate);assert.equal(f.calls.length,3);assert.equal(f.checks,1);assert.equal(f.reads,1);assert.deepEqual(f.paths,[['p0','replacement','p1','p2','p3','p4']]);f.near.resolve();f.remaining.resolve();const [b,c]=await Promise.all([f.stream.nearby,f.stream.complete]);assert.ok(b.ok&&c.ok);assert.ok(!('base' in b)&&!('view' in b)&&!('base' in c)&&!('view' in c));assert.equal(f.checks,2);}finally{f.near.resolve();f.remaining.resolve()}
});
test('all final joined-check mismatches reject both tail deltas',async()=>{
 for(const kind of ['revision','cover','sequence','active','missing','error']){const f=setup({lateChange:true,kind});assert.equal((await f.stream.primary).ok,true);assert.equal((await f.stream.nearby).ok,false);assert.equal((await f.stream.complete).ok,false);assert.equal(f.checks,2)}
});
function mergeFixture(){const load=requestModules({'./editor.ts':{applyPreviewUrls:(v,urls)=>({...v,previewUrls:urls})}});return load('lib/album-persistence/progressive-merge.ts')}
test('out-of-order deltas merge once on the same revision, retain resets, and never claim early completion',()=>{
 const {initialProgressiveState,mergeDraftDelivery}=mergeFixture();const expected={...view(),spreads:[]};let state=initialProgressiveState(expected,true);
 const messages=[{ok:true,stage:'complete',pin,urls:{p4:'main/p4'},thumbnails:{p4:'thumb/p4'}},{ok:true,stage:'primary',pin,base:view(),urls:{p0:'main/p0',replacement:'main/replacement'},thumbnails:{p0:'thumb/p0',replacement:'thumb/replacement'}},{ok:true,stage:'nearby',pin,urls:{p1:'main/p1'},thumbnails:{p1:'thumb/p1'}}];
 state=mergeDraftDelivery(state,messages[0],expected);assert.equal(state.rank,0);state=mergeDraftDelivery(state,messages[1],expected);assert.equal(state.rank,1);assert.equal(state.view.spreads[0].sourceFrames[0].aiPhotoId,'p0');assert.equal(state.view.spreads[0].sourceFrames[0].userPhotoId,'replacement');state=mergeDraftDelivery(state,messages[2],expected);assert.equal(state.rank,3);assert.equal(state.mask,7);assert.equal(state.view.previewUrls.p4,'main/p4');assert.equal(state.view.thumbnailUrls.replacement,'thumb/replacement');assert.deepEqual(state.view.spreads[4].layoutRanking,{position:4});assert.equal(mergeDraftDelivery(state,messages[1],expected),state);
});
test('failure or changed pin removes visible snapshot and stays failed despite late success',()=>{
 const {initialProgressiveState,mergeDraftDelivery}=mergeFixture();const initial=view();const first={ok:true,stage:'primary',pin,base:initial,urls:{},thumbnails:{}};const loaded=mergeDraftDelivery(initialProgressiveState(initial,true),first,initial);
 for(const message of [{ok:false,message:'reload'},{ok:true,stage:'complete',pin:{...pin,revision:7},urls:{},thumbnails:{}},{ok:true,stage:'complete',pin:{...pin,coverClientSeq:4},urls:{},thumbnails:{}}]){const failed=mergeDraftDelivery(loaded,message,initial);assert.equal(failed.view,null);assert.equal(failed.rank,0);assert.ok(failed.error);assert.equal(mergeDraftDelivery(failed,first,initial),failed)}
});
test('transport distinguishes document, navigation RSC and prefetch without credentials',()=>{
 assert.equal(requestTransport(new Headers({'accept':'text/html'}),'https://example.test/home').kind,'document');assert.equal(requestTransport(new Headers({'RSC':'1'}),'https://example.test/home').kind,'rsc');assert.equal(requestTransport(new Headers(),'https://example.test/home?_rsc=synthetic').kind,'rsc');assert.equal(requestTransport(new Headers({'rsc':'1','Next-Router-Prefetch':'1'}),'https://example.test/home').kind,'prefetch');assert.equal(requestTransport(new Headers({'accept':'text/x-component','sec-purpose':'prefetch;prerender'}),'https://example.test/home').kind,'prefetch');
});

test('already-started metadata is reused without another body read',async()=>{const f=setup({prepared:true});assert.equal((await f.stream.complete).ok,true);assert.equal(f.reads,0);assert.equal(f.paths.length,1);assert.equal(f.checks,2)});

test('first body signing starts during cover delivery but validation/release waits for its pin',async()=>{const f=setup({deferCover:true});await new Promise(setImmediate);assert.equal(f.calls.length,1);assert.equal(f.checks,0);f.cover.resolve({revision:2,clientSeq:3});assert.equal((await f.stream.complete).ok,true);assert.equal(f.checks,2)});
