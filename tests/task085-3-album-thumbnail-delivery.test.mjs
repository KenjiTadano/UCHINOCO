import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAlbumThumbnailDelivery, clearPhotoImageUrlCacheForTests} from '../lib/photo-image-delivery.ts';

const photo = (id) => ({id,storage_path:`synthetic-owner/synthetic-pet/${id}.jpg`,thumbnail_path:null});
const original = p => `https://images.test/storage/v1/object/sign/pet-photos/${p.storage_path}?token=synthetic`;
test('only original fallback gets bounded aspect-preserving delivery; main URLs unchanged',async()=>{
 clearPhotoImageUrlCacheForTests();const photos=Array.from({length:9},(_,i)=>photo(String(i)));let concurrent=0,max=0;const calls=[];
 const db={storage:{from(bucket){assert.equal(bucket,'pet-photos');return {async createSignedUrl(path,ttl,options){concurrent++;max=Math.max(max,concurrent);calls.push({path,ttl,options});await new Promise(r=>setImmediate(r));concurrent--;return {data:{signedUrl:`https://images.test/render/${path}`},error:null};}}}}};
 const main=new Map(photos.map(p=>[p.id,original(p)]));const snapshot=[...main];
 const result=await createAlbumThumbnailDelivery(db,photos,main,'owner-a');assert.deepEqual([...main],snapshot);assert.equal(max,4);assert.equal(result.counts.transformedThumbnailCount,9);assert.equal(result.counts.originalFallbackCount,0);
 assert.deepEqual(calls[0].options.transform,{width:400,height:400,resize:'contain',quality:76});
 await createAlbumThumbnailDelivery(db,photos,main,'owner-a');assert.equal(calls.length,9);
 await createAlbumThumbnailDelivery(db,photos,main,'owner-b');assert.equal(calls.length,18);
 await createAlbumThumbnailDelivery(db,photos,main,'owner-a',true);assert.equal(calls.length,27);
});
test('existing preview and square thumbnail are reused exactly, with no geometry-changing substitution',async()=>{
 clearPhotoImageUrlCacheForTests();const photos=[photo('preview'),photo('thumb')];const main=new Map([['preview','https://images.test/storage/v1/object/sign/pet-photo-thumbnails/a.preview.webp'],['thumb','https://images.test/storage/v1/object/sign/pet-photo-thumbnails/a.webp']]);
 const result=await createAlbumThumbnailDelivery({storage:{from(){throw new Error('unexpected signing');}}},photos,main,'owner-a');assert.deepEqual([...result.urls],[...main]);assert.equal(result.counts.previewResolvedCount,1);
});
test('sign rejection and exception retain authorized main fallback',async()=>{
 for(const throws of [false,true]){clearPhotoImageUrlCacheForTests();const p=photo('fallback');const main=new Map([[p.id,original(p)]]);const db={storage:{from(){return {async createSignedUrl(){if(throws)throw new Error('synthetic failure');return {error:{message:'denied'},data:null};}}}}};const result=await createAlbumThumbnailDelivery(db,[p],main,'owner');assert.equal(result.urls.get(p.id),original(p));assert.equal(result.counts.originalFallbackCount,1);}
});
test('thumbnail-only loading hints and URL substitution leave shared crop/contain renderer in place',()=>{
 const root='app/(app)/pets/[petId]/album/_components/';const s=readFileSync(root+'draft-spread-view.tsx','utf8');assert.match(s,/loading=\{thumbnail \? "lazy" : undefined\}/);assert.match(s,/decoding=\{thumbnail \? "async" : undefined\}/);assert.match(s,/src=\{thumbnail \? thumbnailUrls\?\.\[photoId\] \?\? src : src\}/);assert.match(s,/imageFit === "contain" \? "none"/);assert.match(s,/effectiveSrc !== fallbackSrc/);
});
test('preview availability uses one user-scoped batch and does not alter main URL choices',async()=>{
 clearPhotoImageUrlCacheForTests();const photos=[photo('available'),photo('missing')];let batches=0;
 const db={storage:{from(){return {async createSignedUrls(paths){batches++;return {data:paths.map(path=>({path,signedUrl:path.includes('available')?'https://images.test/preview':null,error:path.includes('missing')?'not found':null})),error:null};}}}}};
 const main=new Map(photos.map(p=>[p.id,'https://images.test/unchanged.webp']));
 const first=await createAlbumThumbnailDelivery(db,photos,main,'owner');assert.equal(first.counts.previewAvailableCount,1);assert.equal(first.counts.previewUnknownCount,0);assert.deepEqual([...first.urls],[...main]);
 await createAlbumThumbnailDelivery(db,photos,main,'owner');assert.equal(batches,1);
 await createAlbumThumbnailDelivery(db,photos,main,'other-owner');assert.equal(batches,2);
});
