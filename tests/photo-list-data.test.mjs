import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getPhotoPage,getMemoryPhotoPage,nextPhotoCursor} from '../lib/photo-pagination.ts';
import {createListImageUrls,listImagePath} from '../lib/photo-list-images.ts';

test('Memories explicitly opts into relation RPC; Album default stays primary-only; cursor and limit+1 survive',async()=>{
 const calls=[];
 const photos=[3,2,1].map(n=>({id:String(n),pet_id:'primary',timeline_at:'2026-09-15T00:00:00Z'}));
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:photos,error:null};}};
 const cursor={at:'2026-09-16T00:00:00Z',id:'4'};
 const result=await getMemoryPhotoPage(client,'secondary',2,cursor,true);
 assert.equal(calls[0].name,'get_pet_memories_page');
 assert.deepEqual(calls[0].args,{p_pet_id:'secondary',p_limit:3,p_cursor_at:cursor.at,p_cursor_id:cursor.id,p_favorite_only:true});
 assert.deepEqual(result.photos,photos.slice(0,2));assert.equal(result.hasMore,true);
 assert.deepEqual(nextPhotoCursor(result.photos),{at:photos[1].timeline_at,id:'2'});
 assert.equal(result.photos[0].pet_id,'primary');
 await getPhotoPage(client,'secondary',2,null);
 assert.equal(calls[1].name,'get_pet_photos_page');
});
test('Signed URLs use stored primary paths, thumbnail preferred and original fallback when absent',async()=>{
 const photos=[{storage_path:'owner/primary/original',thumbnail_path:'owner/primary/thumb'},
 {storage_path:'owner/other/original',thumbnail_path:null}];
 const calls=[];
 const client={storage:{from:bucket=>({createSignedUrls:async(paths,ttl)=>{
 calls.push({bucket,paths,ttl});return {data:paths.map(path=>({path,signedUrl:`signed:${path}`})),error:null};
 }})}};
 const result=await createListImageUrls(client,photos);
 assert.deepEqual(calls,[{bucket:'pet-photo-thumbnails',paths:['owner/primary/thumb'],ttl:3600},
 {bucket:'pet-photos',paths:['owner/other/original'],ttl:3600}]);
 assert.equal(listImagePath(photos[0]),'owner/primary/thumb');
 assert.equal(listImagePath(photos[1]),'owner/other/original');
 assert.equal(result.signedUrlByPath.get(listImagePath(photos[1])),'signed:owner/other/original');
});
