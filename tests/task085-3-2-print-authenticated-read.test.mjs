import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requestModules } from './helpers/album-request-modules.mjs';
const file='app/(app)/pets/[petId]/album/[albumId]/print/actions.ts';
const source=fs.readFileSync(file,'utf8')+'\n'+fs.readFileSync('lib/album-print/inspection.ts','utf8');
const pet='10000000-0000-4000-8000-000000000001', album='20000000-0000-4000-8000-000000000001';
function fixture({noUser=false,noAlbum=false,denied=false}={}) {
 const downloads=[],filters=[],qualityInputs=[];
 let adminCalls=0;
 const photos=[{id:'primary-photo',storage_path:'owner/primary/photo.jpg'},{id:'secondary-photo',storage_path:'owner/secondary/photo.jpg'}];
 const db={auth:{getUser:async()=>({data:{user:noUser?null:{id:'owner'}}})},storage:{from(bucket){assert.equal(bucket,'pet-photos');return {async download(path){downloads.push(path);return denied?{error:{message:'denied'},data:null}:{error:null,data:{arrayBuffer:async()=>new Uint8Array([1,2]).buffer}};}}}},from(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},in(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:table==='albums'?(noAlbum?null:{id:album,status:'draft',period_to:null,period_from:null}):null}),then(resolve){return Promise.resolve({data:table==='photos'?photos:[]}).then(resolve)}};return q}};
 const frames=photos.map(p=>({aiPhotoId:p.id,userPhotoId:null}));
 const view={versionId:'version',revision:6,spreads:[{source:{},sourceFrames:frames,texts:[],decorations:[],elements:[],backgrounds:[]}],compositionPlan:null};
 const snapshot={spreads:[{frames,texts:[],elements:[]}],cover:null,fingerprint:'synthetic-fingerprint',compositionPlan:null};
 const overrides=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]));
 delete overrides["@/lib/album-print/inspection"];
 Object.assign(overrides,{
  "@/lib/auth-performance":{traceAuthStage:async(_phase,work)=>work()},
  '@/lib/supabase/server':{createClient:async()=>db},
  '@/lib/supabase/admin':{createAdminClient(){adminCalls++;throw Error('admin must not be used by GET inspection')}},
  '@/app/(app)/album-draft-service':{loadActiveDraft:async()=>({view})},
  '@/lib/album-print/source':{selectPrintSource:()=> 'draft'},
  '@/lib/album-print/snapshot':{buildAlbumPrintSnapshot:()=>snapshot,draftPrintIsStale:()=>false},
  '@/lib/album-print/images':{acceptOriginalPath:p=>p,probeRaster:()=>({width:1200,height:900,orientation:1})},
  '@/lib/album-print/crop':{orientedPixelSize:(width,height)=>({width,height})},
  '@/lib/album-print/fonts':{loadPrintFont:async()=>({bytes:new Uint8Array([1])})},
  '@/lib/album-print/quality':{assessPrintQuality:(snap,facts)=>{qualityInputs.push(facts);return []}}
 });
 return {action:requestModules(overrides)(file).inspectAlbumPrint,downloads,filters,qualityInputs,get adminCalls(){return adminCalls}};
}
test('print GET inspection reads primary and secondary originals with authenticated Storage; no service role needed',async()=>{
 const f=fixture();const result=await f.action(pet,album);assert.equal(result.ok,true);assert.equal(f.adminCalls,0);assert.deepEqual(f.downloads,['owner/primary/photo.jpg','owner/secondary/photo.jpg']);assert.equal(f.qualityInputs[0]['secondary-photo'].width,1200);assert.ok(f.filters.some(x=>x[0]==='albums'&&x[1]==='owner_user_id'&&x[2]==='owner'));
});
test('unauthenticated and wrong-owner print inspection cannot read Storage',async()=>{
 for(const options of [{noUser:true},{noAlbum:true}]){const f=fixture(options);assert.equal((await f.action(pet,album)).ok,false);assert.equal(f.downloads.length,0);assert.equal(f.adminCalls,0);}
});
test('Storage RLS rejection stays unavailable in quality facts, without admin retry',async()=>{
 const f=fixture({denied:true});await f.action(pet,album);assert.equal(f.qualityInputs[0]['primary-photo'],null);assert.equal(f.qualityInputs[0]['secondary-photo'],null);assert.equal(f.adminCalls,0);
});
test('all image inspection callers reuse owned client; privileged PDF writes are unchanged',()=>{
 assert.equal((source.match(/imageFacts\(built.input!?, owned.supabase\)/g)||[]).length,2);assert.match(source,/imageFacts\(input, supabase\)/);assert.match(source,/const admin = createAdminClient\(\);\s*const persisted = await persistPrintPdf/);assert.match(source,/await admin.storage.from\("print-files"\).upload/);
});
