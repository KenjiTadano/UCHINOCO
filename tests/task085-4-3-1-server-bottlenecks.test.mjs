import test from 'node:test';
import assert from 'node:assert/strict';
import {createFontAssetReader,loadPrintFont} from '../lib/album-print/fonts.ts';
import {createAlbumThumbnailDelivery,clearPhotoImageUrlCacheForTests} from '../lib/photo-image-delivery.ts';

test('immutable font files coalesce concurrent reads and protect retained bytes',async()=>{
 let reads=0;const read=createFontAssetReader(async()=>{reads++;return new Uint8Array([11,22]);});
 const [a,b]=await Promise.all([read('synthetic.ttf'),read('synthetic.ttf')]);assert.equal(reads,1);a[0]=0;assert.equal(b[0],11);assert.equal((await read('synthetic.ttf'))[0],11);assert.equal(reads,1);
});
test('missing font remains blocking and retry can recover',async()=>{
 let reads=0;const read=createFontAssetReader(async()=>{if(++reads===1)throw Error('missing');return new Uint8Array([1]);});
 assert.equal(await read('synthetic.ttf'),null);assert.deepEqual(await read('synthetic.ttf'),new Uint8Array([1]));assert.equal(reads,2);
});
test('build shipped style identity and explicit fallback stay intact',async()=>{
 const minimal=await loadPrintFont('minimal');const editorial=await loadPrintFont('editorial');assert.equal(minimal.explicitFallbackFrom,'Geist');assert.equal(minimal.file,editorial.file);assert.ok(minimal.bytes?.length);assert.deepEqual(minimal.bytes,editorial.bytes);
});
test('slow signing peer and availability probe do not block next work; unique paths sign once',async()=>{
 clearPhotoImageUrlCacheForTests();let releaseSlow,releaseProbe;const slow=new Promise(r=>releaseSlow=r),probe=new Promise(r=>releaseProbe=r);const started=[];let active=0,max=0;
 const photos=Array.from({length:6},(_,i)=>({id:'synthetic-'+i,storage_path:'synthetic/'+i+'.jpg',thumbnail_path:null}));photos.push({...photos[1],id:'duplicate'});
 const main=new Map(photos.map(p=>[p.id,'https://images.test/storage/v1/object/sign/pet-photos/'+p.storage_path]));
 const db={storage:{from(){return {async createSignedUrls(){await probe;return {data:[],error:null};},async createSignedUrl(path){started.push(path);max=Math.max(max,++active);if(path.endsWith('/0.jpg'))await slow;active--;return {data:{signedUrl:'https://images.test/transformed/'+path},error:null};}};}}};
 const work=createAlbumThumbnailDelivery(db,photos,main,'synthetic-owner');await new Promise(r=>setImmediate(r));
 assert.ok(started.includes('synthetic/5.jpg'));assert.ok(max<=4);assert.equal(started.filter(x=>x==='synthetic/1.jpg').length,1);
 releaseSlow();releaseProbe();const result=await work;assert.equal(result.counts.transformedThumbnailCount,7);assert.equal(result.urls.get('duplicate'),result.urls.get('synthetic-1'));assert.equal(result.counts.originalFallbackCount,0);
});
