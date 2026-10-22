import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requestModules } from './helpers/album-request-modules.mjs';
const makeView=()=>({albumId:'album',versionId:'v',revision:6,status:'editing',signature:'s',previewUrls:{},thumbnailUrls:{},spreads:Array.from({length:5},(_,i)=>({id:'spread-'+i,sourceFrames:[{aiPhotoId:'p'+i,userPhotoId:i===0?'replacement':null}],frames:[{effectivePhotoId:i===0?'replacement':'p'+i}],layoutRanking:{test:i}}))});
function setup({changed=false,coverChanged=false,missing=false}={}) {
 const view=makeView(),batches=[];let coverReads=0;
 const db={from(table){assert.equal(table,'album_draft_covers');const q={select(value){assert.ok(value.includes('!inner'));return q},eq(){return q},abortSignal(signal){assert.ok(signal);return q},async maybeSingle(){coverReads++;return {data:{revision:coverChanged?2:1,client_seq:0,album_draft_versions:{id:'v',revision:changed&&coverReads>1?7:6,is_active:true,album_id:'album'}},error:null};}};return q;}};
 const load=requestModules({
  '../auth-performance-core.ts':{baselineProgressiveDelivery:()=>false},
  '../server-io-observer.ts':{observeIo(){}},
  './read-draft.ts':{readDraft:async(_db,_album,options)=>{assert.equal(options.resolveUrls,false);return view;},signedPreviewUrls:async(_db,ids,_refresh,_user,thumbs)=>{batches.push(Array.from(ids));for(const id of ids)if(!missing)thumbs.set(id,'thumb/'+id);return new Map(missing?[]:ids.map(id=>[id,'main/'+id]));}},
  './editor.ts':{applyPreviewUrls:(v,urls)=>({...v,previewUrls:{...v.previewUrls,...urls}})},
  '../album-load-trace.ts':{traceAlbumLoad:async(_s,work)=>work()},
 });
 const stream=load('lib/album-persistence/progressive-draft.ts').streamDraft(db,{userId:'synthetic-owner',photoRecords:async()=>[]},'album',{id:'v',revision:6},{revision:1,clientSeq:0});return {stream,batches,view,get coverReads(){return coverReads}};
}
test('stream prioritizes first spread, nearby rail, then rest with reset identity and exact source preservation',async()=>{
 const f=setup();const a=await f.stream.primary;assert.equal(a.ok,true);assert.deepEqual(f.batches[0],['p0','replacement']);const b=await f.stream.nearby;assert.equal(b.ok,true);const c=await f.stream.complete;assert.equal(c.ok,true);assert.deepEqual(f.batches,[['p0','replacement'],['p1','p2'],['p3','p4']]);assert.ok(a.base);assert.ok(!('view' in b)&&!('base' in b));assert.ok(!('view' in c)&&!('base' in c));assert.equal(Object.keys(c.urls).length,2);assert.equal(f.coverReads,2);
});
test('version change between phases never merges stale/new snapshots or marks completion ready',async()=>{
 const f=setup({changed:true});assert.equal((await f.stream.primary).ok,true);assert.equal((await f.stream.nearby).ok,false);assert.equal((await f.stream.complete).ok,false);assert.equal(f.batches.length,3);
});
test('cover revision change and missing private image fail closed with explicit reload error',async()=>{
 for(const options of [{coverChanged:true},{missing:true}]){const f=setup(options);const result=await f.stream.complete;assert.equal(result.ok,false);assert.match(result.message,/再読み込み/);assert.equal(f.batches.length,1);}
});
test('public shells contain no identity and print controls remain disabled before inspection',()=>{
 const source=fs.readFileSync('app/(app)/_components/route-loading-shell.tsx','utf8');assert.match(source,/data-load-stage="shell"/);assert.match(source,/<button[^>]+disabled/);for(const field of ['albumId','petId','previewUrl','userId'])assert.ok(!source.includes(field));
 const page=fs.readFileSync('app/(app)/pets/[petId]/album/[albumId]/print/page.tsx','utf8');assert.ok(page.indexOf('if (!pet) notFound()')<page.indexOf('return <Suspense'));assert.match(page,/const loaded = await delivery/);
});
test('main editor no longer waits for candidate/suggestion completion and keeps save contract unchanged',()=>{
 const source=fs.readFileSync('app/(app)/pets/[petId]/album/[albumId]/pages/edit/page.tsx','utf8');assert.match(source,/const view = await readDraft/);assert.match(source,/candidateDelivery=\{view \? candidateDelivery/);assert.ok(!source.includes('const [view, candidates, suggestion]'));
});
