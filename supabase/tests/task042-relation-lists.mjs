// Isolated PostgreSQL tests. Set PGLITE_MODULE as for task042-photo-pets.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db=new PGlite();
const sql=name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,other,coco,momo,riri,foreign]=[1,2,11,12,13,21].map(id);
const [a,b,c,d,e]=[101,102,103,104,201].map(id);
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;`);
await db.exec(await sql('20260821080304_create_initial_mvp_schema.sql'));
await db.exec((await sql('20260826150000_create_pet_photos_album.sql')).split('insert into storage.buckets')[0]);
await db.exec(await sql('20260828120000_create_photo_ai_analyses.sql'));
await db.exec(await sql('20260906150000_add_photo_pagination.sql'));
// Storage is not emulated; apply the real column and all real list RPCs.
const thumbnails=await sql('20260907120000_add_photo_thumbnails.sql');
await db.exec(thumbnails.split('insert into storage.buckets')[0]);
await db.exec(thumbnails.slice(thumbnails.indexOf('drop function')));
await db.exec(await sql('20260915130000_add_badge_search.sql'));
for(const migration of ['20260915140000_add_photo_pets.sql','20260915150000_protect_related_pet_photos.sql','20260916120000_relation_memories_search.sql'])
  await db.exec(`begin;${await sql(migration)}commit;`);
await db.exec(`insert into auth.users(id) values('${owner}'),('${other}');
insert into public.pets(id,owner_user_id,name,species) values
('${coco}','${owner}','ココ','dog'),('${momo}','${owner}','モモ','cat'),('${riri}','${owner}','リリ','cat'),('${foreign}','${other}','秘密','cat');
insert into public.photos(id,pet_id,uploader_user_id,storage_path,thumbnail_path,caption,favorite,created_at) values
('${a}','${coco}','${owner}','original/a',null,'日常',false,'2026-09-15'),
('${b}','${momo}','${owner}','original/b','thumb/b','公園',true,'2026-09-15'),
('${c}','${momo}','${owner}','original/c',null,'未確認',false,'2026-09-15'),
('${d}','${riri}','${owner}','original/d',null,'確認済AI',false,'2026-09-15'),
('${e}','${foreign}','${other}','private/e',null,'秘密',true,'2026-09-15');
insert into public.photo_pets(photo_id,pet_id,source,confirmed_by_user) values
('${b}','${coco}','user',true),('${b}','${riri}','user',true),('${c}','${coco}','ai',false),('${d}','${coco}','ai',true);
insert into public.photo_ai_analyses(photo_id,status,tags,description,activity,scene,emotion) values
('${a}','completed',array['日常'],'日常','睡眠','室内','眠そう'),
('${b}','completed',array['散歩','散歩'],'公園で散歩','散歩','公園','楽しそう'),
('${d}','pending',array['未完了タグ'],'未完了説明',null,null,null),
('${e}','completed',array['秘密タグ'],'秘密',null,null,null);`);
const rows=async q=>(await db.query(q)).rows;
const value=async q=>Object.values((await rows(q))[0])[0];
const memories=pet=>rows(`select * from public.get_pet_memories_page('${pet}',61)`);
const facets=pet=>value(`select public.get_search_facets(${pet?`'${pet}'`:'null'})`);
const search=args=>value(`select public.search_photos_page(${args??''})`);
const ids=list=>list.map(p=>p.id);
let passed=0;
async function test(name,fn,actor=owner){
 await db.exec('begin');
 try {await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.exec('set local role authenticated');await fn();console.log(`PASS ${name}`);passed++;}
 finally{await db.exec('rollback');}
}
await test('A/B/C/D: primary + confirmed user/AI, one row each, unconfirmed AI excluded',async()=>{
 assert.deepEqual(ids(await memories(coco)),[d,b,a]);
 assert.deepEqual(ids(await memories(momo)),[c,b]);
 assert.deepEqual(ids(await memories(riri)),[d,b]);
});
await test('E/P: remove and re-add change secondary lists, primary remains',async()=>{
 await db.exec(`select public.remove_photo_pet('${b}','${coco}')`);
 assert.deepEqual(ids(await memories(coco)),[d,a]);assert.deepEqual(ids(await memories(momo)),[c,b]);
 assert.equal((await facets(coco)).total,2);
 await db.exec(`select public.add_photo_pet('${b}','${coco}')`);
 assert.deepEqual(ids(await memories(coco)),[d,b,a]);
});
await test('F: favorite belongs to photo and is shared across pet lists',async()=>{
 assert.deepEqual(ids(await rows(`select * from public.get_pet_memories_page('${coco}',61,null,null,true)`)),[b]);
 await db.exec(`update public.photos set favorite=false where id='${b}'`);
 assert.deepEqual(ids(await rows(`select * from public.get_pet_memories_page('${coco}',61,null,null,true)`)),[]);
});
await test('G/K/O: search includes related photos and returns original primary, paths and fallback',async()=>{
 const result=await search(`p_pet_id=>'${coco}'`);assert.equal(result.total,3);assert.deepEqual(ids(result.photos),[d,b,a]);
 const shared=result.photos.find(p=>p.id===b);assert.equal(shared.pet_id,momo);assert.equal(shared.pet_name,'モモ');assert.equal(shared.thumbnail_path,'thumb/b');
 assert.equal(result.photos.find(p=>p.id===a).thumbnail_path,null);
 assert.equal(result.photos.find(p=>p.id===a).storage_path,'original/a');
});
await test('H: global unique count, overlapping pet counts, completed words only, no repeated-tag inflation',async()=>{
 const all=await facets();assert.equal(all.total,4);assert.equal(all.favorites,1);
 assert.deepEqual(Object.fromEntries(all.pets.map(p=>[p.id,p.count])),{[coco]:3,[momo]:2,[riri]:2});
 const scoped=await facets(coco);assert.equal(scoped.total,3);assert.equal(scoped.completed,2);
 assert.equal(scoped.words.find(w=>w.kind==='tag'&&w.value==='散歩').count,1);
 assert.ok(!scoped.words.some(w=>w.value==='未完了タグ'||w.value==='秘密タグ'));
});
await test('I: free query, badge, favorite and dates combine with related pet by AND',async()=>{
 assert.equal((await search(`p_pet_id=>'${coco}',p_query=>'公園',p_favorite_only=>true,p_kind=>'tag',p_value=>'散歩',p_from=>'2026-09-15',p_to=>'2026-09-16'`)).total,1);
 for(const extra of ["p_query=>'ない言葉'","p_kind=>'scene',p_value=>'海'","p_from=>'2026-09-16'","p_to=>'2026-09-15'","p_query=>'未完了説明'","p_query=>'%'", "p_kind=>'tag',p_value=>'秘密タグ'"])
   assert.equal((await search(`p_pet_id=>'${coco}',${extra}`)).total,0);
});
await test('M: Album original RPC remains primary-only',async()=>{
 assert.deepEqual(ids(await rows(`select * from public.get_pet_photos_page('${coco}')`)),[a]);
});
await test('L: detail-style primary equality still rejects a secondary route',async()=>{
 assert.deepEqual(await rows(`select id from public.photos where id='${b}' and pet_id='${coco}' and uploader_user_id=auth.uid()`),[]);
});
await test('N: other actor cannot see our photos, relations, words or counts',async()=>{
 assert.deepEqual(await memories(coco),[]);assert.equal((await search(`p_pet_id=>'${coco}'`)).total,0);
 const all=await facets();assert.equal(all.total,1);assert.deepEqual(all.pets.map(p=>p.id),[foreign]);
 assert.ok(all.words.every(w=>w.value==='秘密タグ'));
 const filtered=await facets(coco);assert.equal(filtered.total,0);assert.deepEqual(filtered.words,[]);
},other);
await test('N: own actor cannot see foreign pet filters or private terms',async()=>{
 assert.deepEqual(await memories(foreign),[]);assert.equal((await search(`p_pet_id=>'${foreign}'`)).total,0);
 assert.equal((await search("p_query=>'秘密'")).total,0);
 assert.ok(!(await facets()).pets.some(p=>p.id===foreign));
});
await test('J: keyset pages, same timestamps, limit+1, count independent of cursor',async()=>{
 await db.exec('reset role');
 await db.exec(`insert into public.photos(id,pet_id,uploader_user_id,storage_path,created_at)
 select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${momo}','${owner}','bulk/'||i,'2026-09-15' from generate_series(1000,1129)i;
 insert into public.photo_pets(photo_id,pet_id,source,confirmed_by_user)
 select id,'${coco}','user',true from public.photos where storage_path like 'bulk/%';`);
 await db.exec('set local role authenticated');
 const expected=ids(await rows(`select * from public.get_pet_memories_page('${coco}',61)`));assert.equal(expected.length,61);
 for(const mode of ['memories','search']){
   const seen=[];let at=null,last=null;
   for(let i=0;i<10;i++){
     const args=at?`'${at}','${last}'`:'null,null';
     const result=mode==='memories'?{photos:await rows(`select * from public.get_pet_memories_page('${coco}',31,${args})`)}:
       await search(`p_pet_id=>'${coco}',p_limit=>30,p_cursor_at=>${at?`'${at}'`:'null'},p_cursor_id=>${last?`'${last}'`:'null'}`);
     if(mode==='search')assert.equal(result.total,133);
     const page=result.photos.slice(0,30);seen.push(...ids(page));
     if(result.photos.length<=30)break;
     at=new Date(page.at(-1).timeline_at).toISOString();last=page.at(-1).id;
   }
   assert.equal(seen.length,133);assert.equal(new Set(seen).size,133);
   assert.deepEqual(seen,[...seen].sort().reverse());
 }
});
// Check a real planner run on a larger fixture; never force an index choice.
await db.exec('begin');
await db.exec(`insert into public.photos(id,pet_id,uploader_user_id,storage_path,created_at)
 select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${momo}','${owner}','plan/'||i,'2026-09-15' from generate_series(2000,2999)i;
 insert into public.photo_pets(photo_id,pet_id,source,confirmed_by_user)
 select id,'${coco}','user',true from public.photos where storage_path like 'plan/%' and right(storage_path,1)='0';
 analyze public.photos; analyze public.photo_pets; analyze public.pets;`);
await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await db.exec('set local role authenticated');
const plan=await rows(`explain (analyze,buffers,format json) select * from public.get_pet_memories_page('${coco}',31)`);
const definition=await sql('20260916120000_relation_memories_search.sql');
const body=definition.split('as $$')[1].split('$$;')[0]
 .replace(/\bp_pet_id\b/g,`'${coco}'::uuid`).replace(/\bp_limit\b/g,'31')
 .replace(/\bp_cursor_at\b/g,'null::timestamptz').replace(/\bp_cursor_id\b/g,'null::uuid')
 .replace(/\bp_favorite_only\b/g,'false');
const innerPlan=await rows(`explain (analyze,buffers,format json) ${body}`);
const indexes=[...new Set(JSON.stringify(innerPlan).match(/"Index Name":"[^"]+"/g))];
assert.ok(indexes.some(name=>name.includes('photo_pets_')),'Expected existing relation index in inner query plan');
console.log('Inner query planner index evidence:',indexes.join(', '));
console.log('Planner execution ms:',plan[0]['QUERY PLAN'][0]['Execution Time']);
await db.exec('rollback');await db.close();console.log(`${passed} relation-list PostgreSQL tests passed`);
