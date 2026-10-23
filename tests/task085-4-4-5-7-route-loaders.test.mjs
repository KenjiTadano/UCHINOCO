import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {canUsePhotoInAlbum} from '../lib/album-persistence/photo-eligibility.ts';
async function moduleAt(file, deps={}) {
 const code=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,Map,Set,Promise,Boolean,Error,performance,process:{env:{}},console,require:name=>{if(name==='server-only')return {};if(name.includes('trace'))return {traceAlbumLoad:(_s,f)=>f(),traceRouteLoader:(_s,f)=>f()};if(name in deps)return deps[name];if(deps['*'])return deps['*'](name);throw Error('unexpected import '+name)}});return exports;
}
const album={id:'album',pet_id:'primary',owner_user_id:'owner',status:'draft',title:'title',period_from:null,period_to:null,cover_photo_id:'cover'};
function dbFixture(){
 const calls=[];const state={links:['primary','secondary'],pets:['primary','secondary'],rows:[{id:'a',pet_id:'primary',uploader_user_id:'owner',storage_path:'a.jpg',thumbnail_path:null},{id:'b',pet_id:'secondary',uploader_user_id:'owner',storage_path:'b.jpg',thumbnail_path:null},{id:'bad',pet_id:'outside',uploader_user_id:'owner',storage_path:'bad.jpg',thumbnail_path:null},{id:'wrong',pet_id:'primary',uploader_user_id:'other',storage_path:'wrong.jpg',thumbnail_path:null}],selected:[],error:null};
 const db={auth:{getUser(){throw Error('duplicate auth')}},from(table){const filters=[];let cap=Infinity;const result=()=>{calls.push(table);let rows=table==='album_pets'?state.links.map(pet_id=>({pet_id,album_id:'album'})):table==='pets'?state.pets.map(id=>({id,owner_user_id:'owner'})):table==='photos'?state.rows:table==='album_photos'?state.selected.map(photo_id=>({photo_id,album_id:'album'})):table==='album_draft_versions'?[{id:'version',album_id:'album',status:'editing',revision:3,created_at:'2026-01-01',is_active:true}]:[];rows=rows.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));return {data:state.error===table?null:rows.slice(0,cap),error:state.error===table?new Error('denied'):null}};const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},limit(n){cap=n;return q},maybeSingle:async()=>{const r=result();return {...r,data:r.data?.[0]??null}},then(a,b){return Promise.resolve(result()).then(a,b)}};return q}};return {db,calls,state};
}
const {createRouteReadContext}=await moduleAt('lib/album-persistence/route-read-context.ts');
test('version and eligibility promises shared only in the same render context',async()=>{const {db,calls}=dbFixture(),ctx=createRouteReadContext(db,'owner',album);await Promise.all([ctx.version(),ctx.version(),ctx.eligibility(),ctx.eligibility()]);assert.equal(calls.filter(x=>x==='album_draft_versions').length,1);assert.equal(calls.filter(x=>x==='album_pets').length,1);assert.equal(calls.filter(x=>x==='pets').length,1);assert.deepEqual(JSON.parse(JSON.stringify(await ctx.eligibility())),{ownerUserId:'owner',allowedPetIds:['primary','secondary']})});
for(const kind of ['wrong owner','missing anchor','unowned pet','membership error'])test('eligibility fails closed: '+kind,async()=>{const f=dbFixture();if(kind==='missing anchor')f.state.links=['secondary'];if(kind==='unowned pet')f.state.pets=['primary'];if(kind==='membership error')f.state.error='album_pets';const ctx=createRouteReadContext(f.db,kind==='wrong owner'?'other':'owner',album);assert.equal(await ctx.eligibility(),null)});
test('new request does not inherit earlier authorization result',async()=>{const f=dbFixture();assert.ok(await createRouteReadContext(f.db,'owner',album).eligibility());f.state.pets=[];assert.equal(await createRouteReadContext(f.db,'owner',album).eligibility(),null)});
test('already fetched photo paths avoid another SELECT',async()=>{const f=dbFixture(),ctx=createRouteReadContext(f.db,'owner',album);ctx.remember(f.state.rows.slice(0,2));assert.equal((await ctx.photoRecords(['a','b','a'])).length,2);assert.equal(f.calls.length,0);await ctx.photoRecords(['a','missing']);assert.equal(f.calls.filter(x=>x==='photos').length,1)});
const {loadRouteCandidates}=await moduleAt('lib/album-persistence/route-candidates.ts',{'./photo-eligibility':{canUsePhotoInAlbum},'./read-draft':{signedPreviewUrls:async(_db,ids,_refresh,ctx)=>{const rows=await ctx.photoRecords(ids);return new Map(rows.map(r=>[r.id,'preview:'+r.id]))}},'../photo-list-images':{createListImageUrls:async(_db,_rows,user)=>{assert.equal(user,'owner');return {signedUrlByPath:new Map()}}}});
test('new render candidate path keeps secondary-pet unused photos and rejects wrong uploader/outside pets',async()=>{const f=dbFixture(),ctx=createRouteReadContext(f.db,'owner',album);const shown=await loadRouteCandidates(f.db,ctx);assert.deepEqual(Array.from(shown,x=>x.id),['a','b']);assert.equal(f.calls.filter(x=>x==='album_pets').length,1);assert.equal(f.calls.filter(x=>x==='photos').length,1);for(const p of f.state.rows)assert.equal(shown.some(x=>x.id===p.id),canUsePhotoInAlbum(await ctx.eligibility(),p,'owner'))});
test('selected membership read failure produces no candidates',async()=>{const f=dbFixture();f.state.error='album_photos';assert.equal((await loadRouteCandidates(f.db,createRouteReadContext(f.db,'owner',album))).length,0)});
test('candidate path recovers selected photos outside recent cap with a bounded identity query',async()=>{const f=dbFixture();f.state.selected=['b'];f.state.rows=[...Array.from({length:80},(_,i)=>({...f.state.rows[0],id:'recent-'+i})),f.state.rows[1]];const shown=await loadRouteCandidates(f.db,createRouteReadContext(f.db,'owner',album));assert.ok(shown.some(x=>x.id==='b'))});
test('Complete metadata branch and saved Preview branch exclude full-draft/legacy work respectively',async()=>{const s=await readFile('app/(app)/pets/[petId]/album/[albumId]/page.tsx','utf8');const complete=s.slice(s.indexOf('  if (showComplete)'));assert.match(complete,/context\.version\(\)/);assert.doesNotMatch(complete,/await readDraft\(/);assert.ok(s.indexOf('loadRouteDraft(supabase, context)')<s.indexOf('loadUserEntitlements(supabase'));assert.match(s,/\.eq\("id", albumId\)\.eq\("pet_id", petId\)/);assert.doesNotMatch(s.slice(0,s.indexOf('const isOwner')),/\.eq\("owner_user_id", user\.id\)/)});
test('render context is not wired into authoritative mutation validation',async()=>{const s=await readFile('app/(app)/album-draft-service.ts','utf8');assert.doesNotMatch(s,/RouteReadContext|createRouteReadContext/);assert.match(s,/canUsePhotoInAlbum\(await photoEligibility/);const page=await readFile('app/(app)/pets/[petId]/album/[albumId]/pages/edit/page.tsx','utf8');assert.match(page,/Promise\.all\(/);assert.match(page,/after\(\(\) => recordAlbumAnalyticsEvent/)});
for(const pages of [24,48,72])test('body+cover metadata starts together and resolves one union of effective/reset paths for '+pages+'P',async()=>{
 let coverStarted=false,queries=0,requested=[];
 const spreads=Array.from({length:pages/2},(_,i)=>({sourceFrames:[{aiPhotoId:'ai-'+i,userPhotoId:i===0?'replacement':null}],layoutRanking:{rank:i},backgrounds:{left:'warm'},imageFit:'contain'}));
 const {loadRouteDraft}=await moduleAt('lib/album-persistence/load-route-draft.ts',{
 './read-draft':{readDraft:async(_db,_id,opts)=>{assert.equal(opts.resolveUrls,false);await Promise.resolve();assert.equal(coverStarted,true);return {spreads,previewUrls:{}}},signedPreviewUrls:async(_db,ids,_refresh,ctx)=>{requested=ids;return new Map((await ctx.photoRecords(ids)).map(p=>[p.id,'url:'+p.id]))}},
 './editor':{applyPreviewUrls:(d,urls)=>({...d,previewUrls:urls,spreads:d.spreads.map(s=>({...s,layoutRanking:undefined}))})},
 './cover':{mapDraftCoverRow:r=>r,toCoverEditor:(r,urls)=>({previewUrl:urls[r.userPhotoId??r.aiPhotoId]})}
 });
 const db={from(table){assert.equal(table,'album_draft_covers');return {select(){return this},eq(_k,v){assert.equal(v,'v');return this},async maybeSingle(){coverStarted=true;return {data:{aiPhotoId:'cover-ai',userPhotoId:'replacement'}}}}}};
 const ctx={album:{...album},version:async()=>({id:'v'}),async photoRecords(ids){queries++;return [...new Set(ids)].map(id=>({id}))}};
 const out=await loadRouteDraft(db,ctx);assert.equal(queries,1);assert.ok(requested.includes('ai-0'));assert.ok(requested.includes('replacement'));assert.ok(requested.includes('cover-ai'));assert.equal(out.cover.previewUrl,'url:replacement');assert.equal(out.draft.spreads.length,pages/2);assert.equal(out.draft.spreads[0].layoutRanking.rank,0);assert.equal(out.draft.spreads[0].imageFit,'contain');
});
for(const wrongPet of [false,true])test('actual Preview route preserves RLS-shared reader and canonical-pet deny: '+wrongPet,async()=>{
 const calls=[];let delivered=0;
 const db={auth:{getUser:async()=>({data:{user:{id:'member'}},error:null})},from(table){calls.push(table);const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){const row=table==='albums'?{...album,owner_user_id:'different-owner'}:{id:'primary',name:'Pet'};return {data:filters.every(([k,v])=>row[k]===v)?row:null,error:null}}};return q}};
 const route=await moduleAt('app/(app)/pets/[petId]/album/[albumId]/page.tsx',{
 '*':()=>({}), 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 'next/navigation':{notFound(){throw Error('not-found')},redirect(){throw Error('redirect')}},
 '@/lib/supabase/server':{createClient:async()=>db},
 '@/lib/album-persistence/route-read-context':{createRouteReadContext},
 '@/lib/album-persistence/load-route-draft':{loadRouteDraft:async(_db,ctx)=>{assert.equal(ctx.userId,'member');assert.equal(ctx.album.owner_user_id,'different-owner');delivered++;return {draft:{versionId:'v'},cover:{photoId:'cover'}}}},
 '@/lib/album-analytics-server':{recordAlbumAnalyticsEvent:async()=>{}},
 '@/lib/entitlements-server':{loadUserEntitlements(){throw Error('unnecessary prelude')}}
 });
 const run=()=>route.default({params:Promise.resolve({petId:wrongPet?'outside':'primary',albumId:'album'}),searchParams:Promise.resolve({view:'preview'})});
 if(wrongPet){await assert.rejects(run,/not-found/);assert.equal(delivered,0)}else{const out=await run();assert.equal(out.props.draft.versionId,'v');assert.equal(delivered,1);assert.deepEqual(calls,['albums','pets'])}
});

test('concurrent metadata requests share in-flight photo IDs',async()=>{const f=dbFixture(),ctx=createRouteReadContext(f.db,'owner',album);const [a,b]=await Promise.all([ctx.photoRecords(['a','b']),ctx.photoRecords(['b'])]);assert.equal(a.length,2);assert.equal(b.length,1);assert.equal(f.calls.filter(x=>x==='photos').length,1)});
