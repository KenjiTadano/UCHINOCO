import test from 'node:test';
import assert from 'node:assert/strict';
import {registerIoObserver,observeIo,ioVariant,ioWork} from '../lib/server-io-observer.ts';
import {createPhotoPreviewDelivery,clearPhotoImageUrlCacheForTests} from '../lib/photo-image-delivery.ts';
import {createFontAssetReader} from '../lib/album-print/fonts.ts';

test('request-client observation is isolated, fixed-schema and non-identifying',async()=>{
 const a={},b={},events=[];registerIoObserver(a,{variant:'baseline',record:e=>events.push(e)});
 observeIo(a,'metadata.hit',2);observeIo(b,'metadata.hit',99);observeIo(a,'private-photo-id',1);observeIo(a,'metadata.hit',-1);observeIo(a,'metadata.hit',1,Infinity);
 assert.equal(events.length,1);assert.deepEqual(events[0],{metric:'metadata.hit',count:2,durationMs:0});assert.equal(ioVariant(a),'baseline');assert.equal(ioVariant(b),'candidate');
 await assert.rejects(ioWork(a,'sign.original',1,async()=>{throw Error('signed URL never logged')}));assert.equal(events.length,2);assert.ok(!JSON.stringify(events).includes('URL'));
});
test('candidate overlaps independent original and thumbnail signing; baseline stays sequential with identical results',async()=>{
 for(const variant of ['baseline','candidate']){
  clearPhotoImageUrlCacheForTests();const events=[],calls=[];let release;const gate=new Promise(r=>release=r);
  const db={storage:{from(bucket){return {async createSignedUrls(paths){calls.push(bucket);if(bucket==='pet-photo-thumbnails')await gate;return {data:paths.map(path=>({path,signedUrl:'https://images.test/'+bucket+'/'+path,error:null})),error:null};}};}}};
  registerIoObserver(db,{variant,record:e=>events.push(e)});
  const photos=[{id:'original',storage_path:'synthetic/a.jpg',thumbnail_path:null},{id:'thumbnail',storage_path:'synthetic/b.jpg',thumbnail_path:'synthetic/b.webp'}];
  const work=createPhotoPreviewDelivery(db,photos,true,false,'synthetic-owner');await new Promise(r=>setImmediate(r));
  assert.equal(calls.includes('pet-photos'),variant==='candidate');release();const first=await work;assert.equal(first.sourceByPhotoId.get('original'),'original');assert.equal(first.sourceByPhotoId.get('thumbnail'),'thumbnail');
  const before=calls.length;await createPhotoPreviewDelivery(db,photos,true,false,'synthetic-owner');assert.equal(calls.length,before);assert.ok(events.some(e=>e.metric==='url.cache.hit'));
  await createPhotoPreviewDelivery(db,photos,true,false,'other-owner');assert.ok(calls.length>before);
 }
});
test('font diagnostics distinguish pending/cache hit, file miss and failed read without file names',async()=>{
 const client={},events=[];registerIoObserver(client,{variant:'candidate',record:e=>events.push(e)});let release;const read=createFontAssetReader(()=>new Promise(r=>release=r));
 const a=read('synthetic-private.ttf',client),b=read('synthetic-private.ttf',client);await new Promise(r=>setImmediate(r));release(new Uint8Array([1]));await Promise.all([a,b]);assert.equal(events.filter(e=>e.metric==='font.cache.miss').length,1);assert.equal(events.filter(e=>e.metric==='font.cache.hit').length,1);assert.equal(events.filter(e=>e.metric==='font.file.read').length,1);assert.ok(!JSON.stringify(events).includes('private'));
});

test('photo metadata counters distinguish same-request reuse from a fresh request',async()=>{
 const {requestModules}=await import('./helpers/album-request-modules.mjs');const load=requestModules({"../album-load-trace.ts":{traceAlbumLoad:async(_phase,work)=>work()}});const events=[];let reads=0;
 const db={from(){return {select(){return this},in(_key,ids){reads++;return Promise.resolve({data:ids.map(id=>({id,storage_path:'synthetic/path.jpg',thumbnail_path:null}))});}};}};
 const observer=load('lib/server-io-observer.ts');observer.registerIoObserver(db,{variant:'candidate',record:e=>events.push(e)});
 const {createAlbumRequestContext}=load('lib/album-persistence/request-context.ts');
 const a=createAlbumRequestContext(db,'synthetic-owner');await a.photoRecords(['synthetic-photo']);await a.photoRecords(['synthetic-photo']);await createAlbumRequestContext(db,'synthetic-owner').photoRecords(['synthetic-photo']);assert.equal(reads,2);assert.equal(events.filter(e=>e.metric==='metadata.miss').reduce((n,e)=>n+e.count,0),2);assert.equal(events.filter(e=>e.metric==='metadata.hit').reduce((n,e)=>n+e.count,0),1);assert.ok(!JSON.stringify(events).includes('synthetic'));
});
