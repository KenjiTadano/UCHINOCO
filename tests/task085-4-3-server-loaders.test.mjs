import test from 'node:test';
import assert from 'node:assert/strict';
import { requestModules } from './helpers/album-request-modules.mjs';
import { loadAnniversaryMemory } from '../lib/anniversary-memories.ts';

function memoryDb() {
 const calls=[];
 const db={from(table){const filters=[];let field;const q={select(s){field=s;return q},in(){return q},gte(k,v){filters.push([k,v]);return q},lt(){return q},is(){return q},or(){return q},order(){return q},limit(){return q},then(a,b){calls.push({table,field,filters});return Promise.resolve({data:[],error:null}).then(a,b)}};return q}};
 return {db,calls};
}
test('anniversary reuses exact request today dataset and preserves bounded historical reads',async()=>{
 const f=memoryDb(),now=new Date('2026-10-21T03:00:00Z');
 const today=[{id:'synthetic-photo',pet_id:'synthetic-pet',created_at:now.toISOString()}];
 const r=await loadAnniversaryMemory({supabase:f.db,pets:[],selectedPetIds:['synthetic-pet'],now,todayPhotos:Promise.resolve(today)});
 assert.equal(r.todayPhotos,today);
 assert.equal(f.calls.filter(c=>c.table==='photos').length,2);
 assert.ok(f.calls.filter(c=>c.table==='photos').every(c=>!c.filters.some(([k,v])=>k==='taken_at'&&v.startsWith('2026'))));
 const g=memoryDb();await loadAnniversaryMemory({supabase:g.db,pets:[],selectedPetIds:['synthetic-pet'],now});
 assert.equal(g.calls.filter(c=>c.table==='photos').length,4,'standalone callers retain their today read');
});

function printFixture({missingOwner=false,missingPet=false,ordered=false,deferDraft=false}={}) {
 const calls=[],downloads=[],snapshots=[];let activeReads=0,draftReads=0;
 let releaseDraft; const draftGate=new Promise(resolve=>releaseDraft=resolve);
 const petId='10000000-0000-4000-8000-000000000001',albumId='20000000-0000-4000-8000-000000000001';
 const album={id:albumId,pet_id:petId,owner_user_id:'owner',status:ordered?'ordered':'draft',period_from:null,period_to:null};
 const view={albumId,versionId:'same-active-version',revision:9,previewUrls:{a:'signed-a',b:'signed-b'},compositionPlan:null,spreads:[{source:{},sourceFrames:[{aiPhotoId:'a',userPhotoId:'b'}],texts:[],decorations:[],elements:[],backgrounds:[]}]};
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from(){return {download:async p=>{downloads.push(p);return {data:{arrayBuffer:async()=>new Uint8Array([1]).buffer},error:null}}}}},from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},maybeSingle(){calls.push(table);return Promise.resolve({data:table==='albums'?(missingOwner?null:album):table==='pets'?(missingPet?null:{id:petId,name:'synthetic'}):table==='album_draft_covers'?{ai_photo_id:'a',user_photo_id:'b'}:null,error:null})},then(a,b){calls.push(table);return Promise.resolve({data:table==='photos'?[{id:'a',storage_path:'original-a'},{id:'b',storage_path:'original-b'}]:[],error:null}).then(a,b)}};return q}};
 const modules=requestModules({
  '@/lib/auth-performance':{traceAuthStage:async(_p,f)=>f()},
  '@/lib/supabase/server':{createClient:async()=>db},
  '@/app/(app)/album-draft-service':{loadActiveDraft:async()=>{activeReads++;throw Error('must reuse loaded draft')}},
  '@/lib/album-persistence/request-context':{createAlbumRequestContext:()=>({userId:'owner',version:async()=>({id:'same-active-version'}),photoRecords:async()=>[{id:'a',storage_path:'original-a'},{id:'b',storage_path:'original-b'}]})},
  '@/lib/album-persistence/read-draft':{readDraft:async()=>{draftReads++;if(deferDraft)await draftGate;return view},signedPreviewUrls:async()=>{throw Error('cover URLs already available')}},
  '@/lib/album-persistence/cover':{mapDraftCoverRow:r=>({aiPhotoId:r.ai_photo_id,userPhotoId:r.user_photo_id}),toCoverEditor:(r,urls)=>({source:r,previewUrl:urls[r.userPhotoId||r.aiPhotoId]})},
  '@/lib/album-print/snapshot':{buildAlbumPrintSnapshot:input=>{snapshots.push(input);return {fingerprint:'same',compositionPlan:null,spreads:[{texts:[],elements:[]}]}},draftPrintIsStale:()=>false},
  '@/lib/album-print/fonts':{loadPrintFont:async()=>({bytes:new Uint8Array([1])})},
  '@/lib/album-print/images':{acceptOriginalPath:p=>p,probeRaster:()=>({width:1200,height:900,orientation:1})},
  '@/lib/album-print/crop':{orientedPixelSize:(width,height)=>({width,height})},
  '@/lib/album-print/quality':{assessPrintQuality:(_snapshot,facts)=>{assert.equal(facts.b.width,1200);return [{code:'TEST_BLOCKER',severity:'blocking'}]}},
 });
 return {releaseDraft,run:()=>modules('lib/album-print/inspection.ts').loadPrintPreviewData(petId,albumId),calls,downloads,snapshots,get activeReads(){return activeReads},get draftReads(){return draftReads},view};
}
test('Print GET shares exact version/revision/cover between UI and full original quality inspection',async()=>{
 const f=printFixture(),r=await f.run();assert.equal(r.view,f.view);assert.equal(f.activeReads,0);assert.equal(f.draftReads,1);
 assert.equal(f.calls.filter(t=>t==='album_draft_covers').length,1);assert.equal(f.calls.filter(t=>t==='albums').length,1);
 assert.equal(r.cover.previewUrl,'signed-b');assert.deepEqual(f.downloads,['original-b']);
 assert.equal(f.snapshots[0].draftVersionId,r.view.versionId);assert.equal(f.snapshots[0].draftRevision,r.view.revision);
 assert.equal(r.inspection.issues[0].severity,'blocking','quality blockers retained');
});
test('Print GET denies wrong owner/pet and never reads originals; ordered source is not inspected as draft',async()=>{
 for(const options of [{missingOwner:true},{missingPet:true}]){const f=printFixture(options);assert.equal(await f.run(),null);assert.equal(f.downloads.length,0)}
 const f=printFixture({ordered:true}),r=await f.run();assert.equal(r.inspection.ordered,true);assert.equal(f.downloads.length,0);
});

function homeFixture({owner=true}={}) {
 const stages=[],calls=[],heroes=[];let release;
 const todayGate=new Promise(resolve=>release=resolve);
 const photo={id:'synthetic-photo',pet_id:'synthetic-pet',created_at:'2026-10-21T03:00:00Z',storage_path:'synthetic.jpg'};
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async name=>{calls.push(name);return {data:name==='get_pet_photos_page'?[photo]:[],error:null}},from(table){const q={select(){return q},in(){return q},eq(){return q},gte(){return q},lt(){return q},is(){return q},or(){return q},order(){return q},limit(){return q},then(a,b){calls.push(table);return Promise.resolve({data:table==='pets'?[{id:'synthetic-pet',owner_user_id:owner?'owner':'family-owner',name:'Synthetic',birthday:null,adoption_date:null}]:[],count:0,error:null}).then(a,b)}};return q},storage:{from:()=>({createSignedUrls:async()=>({data:[]})})}};
 const load=requestModules(new Proxy({
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  '@/lib/auth-performance':{traceAuthStage:async(stage,work)=>{stages.push(stage);return work()}},
  '@/lib/supabase/server':{createClient:async()=>db},
  '@/lib/uchinoco-now':{tokyoDateParts:()=>({year:2026,month:10,day:21}),tokyoRange:()=>({start:'start',end:'end'}),selectUchinocoNowHero:input=>{heroes.push(input);return null}},
  '@/lib/uchinoco-now-data':{loadPhotosInRange:async()=>{calls.push('today');await todayGate;return {photos:[photo],error:null}},selectStoredTodayBestShot:async(_db,p)=>({photo:p[0],usedStoredIntelligence:true})},
  '@/lib/anniversary-memories':{loadAnniversaryMemory:async input=>{await input.todayPhotos;return {events:[],pastByYear:[],growthComparison:null}}},
  '@/lib/album-monthly-lifecycle':{currentTokyoMonth:()=>({key:'2026-10',month:10}),previousTokyoMonth:()=>({key:'2026-09',month:9}),periodMatchesMonth:()=>false},
  '@/lib/annual-album':{annualCandidateYear:()=>null},
  '@/lib/passive-album-candidate-server':{preparePassiveCandidate:async()=>{calls.push('passive');return null}},
  '@/lib/photo-list-images':{createListImageUrls:async()=>({signedUrlByPath:new Map()}),listImagePath:p=>p.storage_path},
  '@/lib/album-candidates/config':{ALBUM_CANDIDATES_CONFIG:{budget:{minPhotos:12}}},
 },{has:()=>true,get:(t,k)=>t[k]??{}}));
 const Page=load('app/(app)/home/page.tsx').default;
 return {run:()=>Page({searchParams:Promise.resolve({})}),release,stages,calls,heroes};
}
test('Home starts independent reads before today resolves; shares today and preserves hero inputs',async()=>{
 const f=homeFixture(),pending=f.run();
 for(let i=0;i<20;i++)await Promise.resolve();
 for(const stage of ['home.recent','home.albums','home.month-counts','home.family','home.passive-previous'])assert.ok(f.stages.includes(stage),stage);
 assert.ok(f.calls.includes('get_family_new_photo_activity'));f.release();await pending;
 assert.equal(f.calls.filter(c=>c==='today').length,1);assert.equal(f.heroes[0].todayBestShot.id,'synthetic-photo');assert.equal(f.heroes[0].fallbackPhoto.id,'synthetic-photo');
 const family=homeFixture({owner:false});const result=family.run();family.release();await result;assert.equal(family.calls.includes('passive'),false,'family access does not become owner-only candidate access');
});

 test('Print cover read overlaps URL/draft work but remains pinned to its active version',async()=>{
  const f=printFixture({deferDraft:true}),pending=f.run();
  for(let i=0;i<40;i++)await Promise.resolve();
  assert.equal(f.calls.filter(t=>t==='album_draft_covers').length,1);
  f.releaseDraft();const r=await pending;assert.equal(r.view.versionId,'same-active-version');assert.equal(f.calls.filter(t=>t==='photos').length,0,'reuse loaded photo metadata instead of a path SELECT');
 });
