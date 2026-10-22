import * as crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestModules } from './helpers/album-request-modules.mjs';
function fixture() {
  const calls=[], signed=[];
  const rows={albums:[{id:'album',pet_id:'primary',owner_user_id:'owner',status:'draft',period_from:'2026-01-01',period_to:'2027-01-01'}],album_pets:[{album_id:'album',pet_id:'primary'},{album_id:'album',pet_id:'second'}],pets:[{id:'primary',owner_user_id:'owner'},{id:'second',owner_user_id:'owner'}],photos:[
    {id:'a',pet_id:'primary',uploader_user_id:'owner',storage_path:'a.jpg',thumbnail_path:'a.webp'},
    {id:'b',pet_id:'second',uploader_user_id:'owner',storage_path:'b.jpg',thumbnail_path:'b.webp',generationUnused:true},
    {id:'outside',pet_id:'other',uploader_user_id:'owner',storage_path:'c.jpg'},
    {id:'wrong-owner',pet_id:'second',uploader_user_id:'stranger',storage_path:'d.jpg'},
  ],album_photos:[],album_draft_versions:[{id:'version',album_id:'album',is_active:true,generation_metadata:{generation_photo_ids:['a','b']},created_at:'2026-01-01',status:'draft'}]};
  const db={from(table){const filters=[];let field='';const q={select(s){field=s;return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},gte(){return q},lt(){return q},maybeSingle(){return execute(true)},then(a,b){return execute(false).then(a,b)}};async function execute(single){calls.push({table,field});const data=(rows[table]??[]).filter(r=>filters.every(f=>f(r)));return {data:single?(data[0]??null):data,error:null}}return q}};
  const load=requestModules({
    'node:crypto':crypto,
    '../album-load-trace.ts':{traceAlbumLoad:async(_s,work)=>work()},
    '../photo-image-delivery.ts':{createAlbumThumbnailDelivery:async(_db,_photos,urls)=>({urls,counts:{}}),createPhotoPreviewUrls:async(_db,photos,_fallback,_refresh,userId)=>{signed.push({photos,userId});return new Map(photos.map(p=>[p.id,'preview/'+p.id]))}},
    '../photo-list-images.ts':{createListImageUrls:async(_db,photos,userId)=>{signed.push({listed:photos,userId});return {signedUrlByPath:new Map()}}},
  });
  const {createAlbumRequestContext}=load('lib/album-persistence/request-context.ts');
  const {loadRequestEditorCandidates}=load('lib/album-persistence/editor-candidates.ts');
  return {db,calls,signed,rows,load,createAlbumRequestContext,loadRequestEditorCandidates,context:createAlbumRequestContext(db,'owner')};
}
test('candidate context fetched once, results preserve secondary/unused and reject outside/owner; paths reused',async()=>{
  const f=fixture();const shown=await f.loadRequestEditorCandidates(f.db,f.context,'primary','album');
  assert.deepEqual(Array.from(shown,p=>p.id),['a','b']);
  assert.equal(f.calls.filter(x=>x.table==='album_pets').length,1);
  assert.equal(f.calls.filter(x=>x.table==='albums').length,1);
  assert.equal(f.calls.filter(x=>x.table==='photos').length,1,'no photos path re-SELECT');
  assert.equal(f.calls.filter(x=>x.table==='pets').length,2,'route plus one grouping authorization');
  assert.equal(f.signed[0].userId,'owner');assert.equal(f.signed[0].photos[1].storage_path,'b.jpg');
});
test('request context coalesces concurrent reads, but never survives into a second request',async()=>{
  const f=fixture();await Promise.all([f.context.eligibility('album'),f.context.eligibility('album'),f.context.version('album'),f.context.version('album')]);
  assert.equal(f.calls.filter(x=>x.table==='album_pets').length,1);
  assert.equal(f.calls.filter(x=>x.table==='album_draft_versions').length,1);
  await f.createAlbumRequestContext(f.db,'owner').eligibility('album');
  assert.equal(f.calls.filter(x=>x.table==='album_pets').length,2);
  assert.equal(await f.createAlbumRequestContext(f.db,'stranger').eligibility('album'),null);
});
test('missing membership or ownership fails closed; cover restriction precedes signing without broadening selection',async()=>{
  const f=fixture();const shown=await f.loadRequestEditorCandidates(f.db,f.context,'primary',undefined,{restrictPhotoIds:['a'],routePetVerified:true});
  assert.deepEqual(Array.from(shown,p=>p.id),['a']);assert.equal(f.signed[0].photos.length,1);
  f.rows.album_pets=[];assert.equal(await f.createAlbumRequestContext(f.db,'owner').eligibility('album'),null);
  f.rows.album_pets=[{album_id:'album',pet_id:'primary'},{album_id:'album',pet_id:'second'}];f.rows.pets.pop();assert.equal(await f.createAlbumRequestContext(f.db,'owner').eligibility('album'),null);
});
test('draft Preview exits before legacy/entitlement/suggestion/photo reads; fallback and Complete still exist',()=>{
  const s=readFileSync('app/(app)/pets/[petId]/album/[albumId]/page.tsx','utf8');
  const early=s.indexOf('if (showPreview)');const earlyReturn=s.indexOf('return <AlbumPreviewScreen',early);
  for(const marker of ['loadUserEntitlements(supabase','findNewPhotoSuggestion(supabase','from("album_photos")','createListImageUrls(supabase']) assert.ok(s.indexOf(marker)>earlyReturn);
  assert.ok(s.includes('buildAlbumPreviewSpreads('));assert.ok(s.includes('if (showComplete)'));assert.ok(s.includes('AlbumCompleteScreen'));
});
test('Action entry points accept no trusted context; internal loaders are server-only and mutation RPCs remain',()=>{
  const s=readFileSync('app/(app)/album-draft-service.ts','utf8');
  assert.match(s,/loadEditorCandidates\(petId: string, albumId\?: string\)/);
  assert.match(s,/createAlbumRequestContext\(supabase, userId\)\.eligibility/);
  assert.match(s,/rpc\("apply_draft_frame_override"/);assert.match(s,/rpc\("apply_draft_cover_override"/);
  for(const name of ['request-context','editor-candidates','read-cover']) assert.match(readFileSync(`lib/album-persistence/${name}.ts`,'utf8'),/^import "server-only"/);
});

async function previewPageFixture(draft) {
  const f=fixture();f.db.auth={getUser:async()=>({data:{user:{id:'owner'}},error:null})};
  const events=[];let legacyBuilds=0,readCount=0;
  const overrides={
    '@/lib/auth-performance-core':{baselineProgressiveDelivery:()=>false},
    '@/lib/auth-performance':{traceAuthStage:async(_phase,work)=>work()},
    react:{Suspense:'suspense'},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    'next/navigation':{notFound(){throw new Error('not found')},redirect(){throw new Error('redirect')}},
    '@/lib/supabase/server':{createClient:async()=>f.db},
    '@/lib/album-persistence/request-context':{createAlbumRequestContext:f.createAlbumRequestContext},
    '@/lib/album-persistence/read-draft':{readDraft:async()=>{readCount++;return draft},resolveDraftPreviewUrls:async(_db,v)=>v},
    '@/lib/album-persistence/read-cover':{readDraftCover:async()=>null},
    '@/lib/album-analytics-server':{recordAlbumAnalyticsEvent:async x=>events.push(x.eventType)},
    '@/lib/album-new-photo-suggestions':{findNewPhotoSuggestion:async()=>null},
    '@/lib/album-load-trace':{traceAlbumLoad:async(_stage,work)=>work()},
    './analytics-actions':{acceptAlbumForOrder:async()=>{},acceptAlbumDraft:async()=>{},regenerateAlbumDraft:async()=>{}},
    '@/lib/entitlements-server':{loadUserEntitlements:async()=>({canRegenerateAlbum:true})},
    '@/lib/photo-list-images':{createListImageUrls:async()=>({signedUrlByPath:new Map()}),listImagePath:p=>p.thumbnail_path??p.storage_path},
    '@/lib/album-cover-title':{formatAlbumPeriodLabels:()=>({monthLabel:'month',coverDateLabel:'date'})},
    '@/lib/album-preview-spreads':{buildAlbumPreviewSpreads:()=>{legacyBuilds++;return ['legacy']}},
    './album-preview-screen':{AlbumPreviewScreen:'preview'},
    './album-complete-screen':{AlbumCompleteScreen:'complete'},
  };
  const load=requestModules(new Proxy(overrides,{has:()=>true,get:(target,key)=>target[key]??{}}));
  const Page=load('app/(app)/pets/[petId]/album/[albumId]/page.tsx').default;
  return {...f,run:view=>Page({params:Promise.resolve({petId:'primary',albumId:'album'}),searchParams:Promise.resolve({view})}),events,get legacyBuilds(){return legacyBuilds},get readCount(){return readCount}};
}
test('actual draft Preview page executes no legacy, entitlement, order, candidate or photo SELECT',async()=>{
  const f=await previewPageFixture({versionId:'version',previewUrls:{},spreads:[]});
  const result=await f.run('preview');assert.equal(result.type,'preview');assert.equal(result.props.draft.versionId,'version');
  assert.deepEqual(f.calls.map(x=>x.table),['albums','pets','album_draft_versions']);assert.equal(f.readCount,1);assert.equal(f.legacyBuilds,0);assert.deepEqual(f.events,['album_viewed']);
});
test('actual missing-draft Preview keeps legacy path; Complete still returns completion model',async()=>{
  const f=await previewPageFixture(null);const result=await f.run('preview');assert.equal(result.type,'preview');assert.deepEqual(result.props.spreads,['legacy']);assert.equal(f.readCount,1);assert.equal(f.legacyBuilds,1);assert.ok(f.calls.some(x=>x.table==='album_photos'));
  const complete=await previewPageFixture({versionId:'version',previewUrls:{},spreads:[]});const pending=await complete.run('complete');assert.equal(pending.type,'suspense');const final=await pending.props.children.type(pending.props.children.props);assert.equal(final.type,'complete');assert.equal(complete.readCount,0);assert.equal(complete.calls.filter(x=>x.table==='album_draft_versions').length,1);assert.equal(complete.calls.filter(x=>x.table==='orders').length,0);assert.deepEqual(complete.events,['album_viewed']);
});
test('actual draft/candidate/suggestion loaders share a 17-SELECT editor read budget',async()=>{
  const f=fixture();
  f.rows.album_draft_spreads=[{id:'spread',draft_version_id:'version',story_spread_id:'story',position:0,story_type:'everyday',recommended_density:'LOW',importance:1,coherence:1,ai_layout_id:'L01',revision:1,client_seq:0}];
  f.rows.album_draft_frames=[{id:'frame',draft_spread_id:'spread',frame_id:'hero',role:'hero',position:0,ai_photo_id:'a',ai_crop_x:.5,ai_crop_y:.5,ai_crop_scale:1,revision:1,client_seq:0}];
  await f.context.album('album');
  await f.db.from('pets').select('id').eq('id','primary').eq('owner_user_id','owner').maybeSingle();
  const {readDraft}=f.load('lib/album-persistence/read-draft.ts');
  const {findNewPhotoSuggestion}=f.load('lib/album-new-photo-suggestions.ts');
  const [view,photos,suggestion]=await Promise.all([
    readDraft(f.db,'album',undefined,f.context),
    f.loadRequestEditorCandidates(f.db,f.context,'primary','album',{routePetVerified:true}),
    findNewPhotoSuggestion(f.db,{albumId:'album',routePetId:'primary',userId:'owner'},f.context),
  ]);
  assert.equal(view.versionId,'version');assert.equal(photos.length,2);assert.equal(suggestion,null);
  assert.equal(f.calls.length,17,'plus the unchanged analytics insert = 18 DB calls');
  for(const table of ['albums','album_pets','album_draft_versions'])assert.equal(f.calls.filter(x=>x.table===table).length,1,table);
});

 test('request photo metadata coalesces concurrent and overlapping ID sets, without reuse across requests',async()=>{
  const f=fixture();
  const [first,second]=await Promise.all([f.context.photoRecords(['a','b']),f.context.photoRecords(['b'])]);
  assert.equal(first.length,2);assert.equal(second[0].id,'b');assert.equal(f.calls.filter(c=>c.table==='photos').length,1);
  await f.context.photoRecords(['a','outside']);assert.equal(f.calls.filter(c=>c.table==='photos').length,2);
  await f.createAlbumRequestContext(f.db,'owner').photoRecords(['a']);assert.equal(f.calls.filter(c=>c.table==='photos').length,3);
 });
