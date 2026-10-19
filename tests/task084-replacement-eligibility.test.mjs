import { requestModules } from './helpers/album-request-modules.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { canUsePhotoInAlbum } from '../lib/album-persistence/photo-eligibility.ts';
const album={ownerUserId:'owner',allowedPetIds:['primary','second']};
const photo=(pet_id='primary',uploader_user_id='owner')=>({pet_id,uploader_user_id});
test('picker and server accept owned primary and secondary pets, including generation-unused photos',()=>{
  for(const p of [photo(),photo('second'),{...photo('second'),generationUnused:true}]) assert.equal(canUsePhotoInAlbum(album,p,'owner'),true);
});
test('wrong owner, uploader, pet, missing/stale album or photo fail closed',()=>{
  for(const [a,p,u] of [[album,photo('outside'),'owner'],[album,photo('primary','other'),'owner'],[album,photo(),'other'],[null,photo(),'owner'],[album,null,'owner'],[{...album,allowedPetIds:[]},photo(),'owner']]) assert.equal(canUsePhotoInAlbum(a,p,u),false);
});
test('every displayed candidate satisfies the same authoritative persistence predicate',()=>{
  const input=[photo(),photo('second'),photo('outside'),photo('second','other')];
  const shown=input.filter(p=>canUsePhotoInAlbum(album,p,'owner'));
  assert.equal(shown.length,2);
  for(const p of input) assert.equal(shown.includes(p),canUsePhotoInAlbum(album,p,'owner'));
});
test('candidate loader, body and cover mutations share eligibility and keep RPC validation',async()=>{
  const source=await readFile('app/(app)/album-draft-service.ts','utf8');
  assert.equal((source.match(/canUsePhotoInAlbum\(/g)||[]).length,2);
  assert.match(await readFile('lib/album-persistence/editor-candidates.ts','utf8'),/rows\.filter\(\(photo\) => canUsePhotoInAlbum/);
  assert.match(source,/rpc\("apply_draft_frame_override"/);
  assert.match(source,/rpc\("apply_draft_cover_override"/);
  assert.doesNotMatch(source,/photo\.pet_id !== album\.pet_id/);
});

// Execute the actual server actions against a deterministic Supabase double.
// This verifies picker -> mutation wiring, not just the shared predicate in isolation.
import ts from 'typescript';
import vm from 'node:vm';
async function actionsFixture() {
  const state={writes:[],active:'v',links:['primary','second'],photos:[
    {id:'10000000-0000-4000-8000-000000000001',...photo('primary'),storage_path:'a'},
    {id:'10000000-0000-4000-8000-000000000002',...photo('second'),storage_path:'b',generationUnused:true},
    {id:'10000000-0000-4000-8000-000000000003',...photo('outside'),storage_path:'c'},
    {id:'10000000-0000-4000-8000-000000000004',...photo('second','other'),storage_path:'d'},
  ]};
  const albumId='20000000-0000-4000-8000-000000000001',petId='30000000-0000-4000-8000-000000000001';
  // Use valid IDs at the route boundary, preserving realistic membership values internally.
  state.links[0]=petId;state.photos[0].pet_id=petId;
  const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){
    const filters=[];
    const result=()=>{
      let rows=table==='albums'?[{id:albumId,pet_id:petId,owner_user_id:'owner'}]:
        table==='album_pets'?state.links.map(pet_id=>({album_id:albumId,pet_id})):
        table==='pets'?state.links.map(id=>({id,owner_user_id:'owner'})):
        table==='photos'?state.photos:table==='album_photos'?[]:
        table==='album_draft_frames'?[{id:'40000000-0000-4000-8000-000000000001',draft_spread_id:'s'}]:
        table==='album_draft_spreads'?[{id:'s',draft_version_id:'v',album_draft_versions:{album_id:albumId}}]:
        table==='album_draft_versions'?[{id:state.active,album_id:albumId,is_active:true}]:[];
      return {data:rows.filter(r=>filters.every(([key,value])=>Array.isArray(value)?value.includes(r[key]):r[key]===value))};
    };
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:result().data[0]??null}),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
  },rpc:async(name,args)=>{state.writes.push({name,args});return {data:{status:'applied'}}}};
  const source=await readFile('app/(app)/album-draft-service.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const internal=requestModules({
    '../photo-image-delivery.ts':{createPhotoPreviewUrls:async(_db,rows)=>new Map(rows.map(p=>[p.id,'preview']))},
    '../photo-list-images.ts':{createListImageUrls:async()=>({signedUrlByPath:new Map()})},
    '../album-load-trace.ts':{traceAlbumLoad:async(_stage,work)=>work()},
  });
  const exports={};
  vm.runInNewContext(compiled,{exports,require:(name)=>{
    if(name==='@/lib/album-persistence/request-context')return internal('lib/album-persistence/request-context.ts');
    if(name==='@/lib/album-persistence/editor-candidates')return internal('lib/album-persistence/editor-candidates.ts');
    if(name==='@/lib/album-persistence/photo-eligibility')return {canUsePhotoInAlbum};
    if(name==='@/lib/supabase/server')return {createClient:async()=>db};
    if(name==='@/lib/album-persistence/read-draft')return {fail:message=>({ok:false,message}),readDraft:async()=>({versionId:'v'}),signedPreviewUrls:async(_db,ids)=>new Map(ids.map(id=>[id,'preview']))};
    if(name==='@/lib/photo-list-images')return {createListImageUrls:async()=>({signedUrlByPath:new Map()})};
    if(name==='next/cache')return {revalidatePath(){}};
    if(name==='@/lib/album-analytics-server')return {recordAlbumAnalyticsEvent:async()=>{}};
    return {};
  }});
  return {actions:exports,state,albumId,petId,frameId:'40000000-0000-4000-8000-000000000001'};
}
test('real candidate loader -> actual mutation accepts every shown photo, including second-pet unused',async()=>{
  const {actions,state,albumId,petId,frameId}=await actionsFixture();
  const shown=await actions.loadEditorCandidates(petId,albumId);
  assert.equal(shown.length,2);
  for(const candidate of shown) assert.equal((await actions.overrideFramePhoto(frameId,1,2,candidate.id)).ok,true);
  assert.equal(state.writes.length,2);
  assert.equal(state.writes[1].args.p_user_photo_id,state.photos[1].id);
});
test('actual mutation rejects outside pet, wrong uploader, missing photo and stale version without RPC',async()=>{
  const {actions,state,frameId}=await actionsFixture();
  for(const id of [state.photos[2].id,state.photos[3].id,'10000000-0000-4000-8000-000000000099']) assert.equal((await actions.overrideFramePhoto(frameId,1,2,id)).ok,false);
  state.active='new-version';
  assert.equal((await actions.overrideFramePhoto(frameId,1,2,state.photos[0].id)).ok,false);
  assert.equal(state.writes.length,0);
});
