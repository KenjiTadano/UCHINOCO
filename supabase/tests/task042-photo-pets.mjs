// Isolated PostgreSQL/PGlite tests; never connects to a Supabase project.
// Install @electric-sql/pglite outside the app, then set PGLITE_MODULE to its
// dist/index.js absolute path and run: node supabase/tests/task042-photo-pets.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the isolated PGlite module');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const sql = async (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const migration = await sql('20260915140000_add_photo_pets.sql');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [owner, other, primary, secondary, foreignPet, photo, foreignPhoto, missing] = [1,2,11,12,21,101,201,999].map(id);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  alter default privileges grant execute on functions to service_role;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
await db.exec(await sql('20260821080304_create_initial_mvp_schema.sql'));
await db.exec((await sql('20260826150000_create_pet_photos_album.sql')).split('insert into storage.buckets')[0]);
await db.exec(await sql('20260913120000_add_photo_content_hash.sql'));
await db.exec(`
  insert into auth.users(id) values ('${owner}'), ('${other}');
  insert into public.pets(id, owner_user_id, name, species) values
  ('${primary}', '${owner}', 'Coco', 'dog'),
  ('${secondary}', '${owner}', 'Momo', 'cat'),
  ('${foreignPet}', '${other}', 'Private', 'cat');
  insert into public.photos(id, pet_id, uploader_user_id, storage_path) values
  ('${photo}', '${primary}', '${owner}', 'fixture/a'),
  ('${foreignPhoto}', '${foreignPet}', '${other}', 'fixture/b');
`);
const scalar = async q => Object.values((await db.query(q)).rows[0])[0];
let passed = 0;
const test = async (name, run) => {
  await db.exec('begin');
  try { await run(); passed++; console.log(`PASS ${name}`); }
  finally { await db.exec('rollback'); }
};
const asUser = async (actor = owner, role = 'authenticated') => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor]);
  await db.exec(`set local role ${role}`);
};
const denied = async (q, code = '42501') => {
  await db.exec('savepoint denied');
  let error;
  try { await db.exec(q); } catch (e) { error = e; }
  await db.exec('rollback to savepoint denied');
  assert.ok(error, `Unexpected success: ${q}`);
  assert.equal(error.code, code);
  return error.message;
};
const add = (p = photo, pet = secondary) => `select public.add_photo_pet('${p}', '${pet}')`;
const remove = (p = photo, pet = secondary) => `select public.remove_photo_pet('${p}', '${pet}')`;

await test('Inconsistent existing ownership aborts migration atomically', async () => {
  await db.exec(`update public.photos set uploader_user_id = '${other}' where id = '${photo}'`);
  await denied(migration, 'P0001');
  assert.equal(await scalar("select to_regclass('public.photo_pets')"), null);
});
await db.exec(`begin; ${migration} commit;`);

await test('Backfill creates unconfirmed primary rows', async () => {
  assert.equal(await scalar("select count(*)::int from public.photo_pets where source = 'primary' and not confirmed_by_user and confidence is null"), 2);
});
await test('A: own photo + own pet; repeat is idempotent', async () => {
  await asUser(); await db.exec(add()); await db.exec(add());
  const rows = (await db.query(`select * from public.get_photo_pets('${photo}')`)).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], {pet_id: secondary, pet_name: 'Momo', source: 'user', confidence: null, confirmed_by_user: true});
});
await test('B/C/D and missing IDs produce the same denial', async () => {
  await asUser();
  const queries = [add(photo, foreignPet), add(foreignPhoto, secondary), add(foreignPhoto, foreignPet), add(missing), add(photo, missing), remove(foreignPhoto), remove(photo, foreignPet), remove(missing), remove(photo, missing)];
  const messages = [];
  for (const q of queries) messages.push(await denied(q));
  assert.equal(new Set(messages).size, 1);
});
await test('E: primary removal and manual primary conversion denied', async () => {
  await asUser(); await denied(remove(photo, primary)); await denied(add(photo, primary));
  assert.equal(await scalar(`select confirmed_by_user from public.photo_pets where photo_id = '${photo}'`), false);
});
await test('F: secondary removal is idempotent', async () => {
  await asUser(); await db.exec(add()); await db.exec(remove()); await db.exec(remove());
  assert.equal(await scalar(`select count(*)::int from public.get_photo_pets('${photo}')`), 1);
});
await test('G/H: source and confidence cannot be supplied to RPC', async () => {
  await asUser();
  await denied(`select public.add_photo_pet('${photo}', '${secondary}', 'ai')`, '42883');
  await denied(`select public.add_photo_pet('${photo}', '${secondary}', 0.9)`, '42883');
});
for (const [name, q] of [
  ['I: direct INSERT', `insert into public.photo_pets(photo_id, pet_id, source) values ('${photo}', '${secondary}', 'ai')`],
  ['J: direct UPDATE', `update public.photo_pets set pet_id = '${secondary}' where photo_id = '${photo}'`],
  ['K: direct DELETE', `delete from public.photo_pets where photo_id = '${photo}'`],
]) await test(name, async () => { await asUser(); await denied(q); });

await test('SELECT RLS and list RPC hide foreign and missing photos', async () => {
  await asUser();
  assert.equal(await scalar('select count(*)::int from public.photo_pets'), 1);
  for (const p of [foreignPhoto, missing]) assert.equal(await scalar(`select count(*)::int from public.get_photo_pets('${p}')`), 0);
});
await test('Anon and internal helper execution denied', async () => {
  await asUser('', 'anon'); await denied(add());
  await denied(`select * from public.get_photo_pets('${photo}')`);
  await db.exec('reset role'); await asUser();
  await denied(`select public.require_photo_pet_management('${photo}', '${secondary}')`);
});
await test('Authenticated without actor denied', async () => { await asUser(''); await denied(add()); });
await test('L: photo deletion cascades primary and secondary', async () => {
  await asUser(); await db.exec(add()); await db.exec(`delete from public.photos where id = '${photo}'`);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 0);
});
await test('M: secondary pet deletion leaves primary photo', async () => {
  await asUser(); await db.exec(add()); await db.exec(`delete from public.pets where id = '${secondary}'`);
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${photo}'`), 1);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 1);
});
await test('N: primary pet deletion still deletes photo and all its relations', async () => {
  await asUser(); await db.exec(add()); await db.exec(`delete from public.pets where id = '${primary}'`);
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${photo}'`), 0);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 0);
  assert.equal(await scalar(`select count(*)::int from public.pets where id = '${secondary}'`), 1);
});
await test('New photo uses actual ID and same transaction primary creation', async () => {
  await asUser();
  await db.exec(`insert into public.photos(id,pet_id,uploader_user_id,storage_path) values ('${id(102)}','${primary}','${owner}','fixture/new')`);
  assert.equal(await scalar(`select source from public.photo_pets where photo_id = '${id(102)}'`), 'primary');
});
await test('Primary trigger failure rolls back photo INSERT', async () => {
  await db.exec(`create function public.test_fail_relation() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end; $$;
    create trigger test_fail_relation before insert on public.photo_pets for each row execute function public.test_fail_relation();`);
  await asUser();
  await denied(`insert into public.photos(id,pet_id,uploader_user_id,storage_path) values ('${id(102)}','${primary}','${owner}','fixture/new')`, 'P0001');
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${id(102)}'`), 0);
});
await test('Anchor changes blocked; ordinary photo edits still work', async () => {
  await asUser();
  await denied(`update public.photos set pet_id = '${secondary}' where id = '${photo}'`, 'P0001');
  await db.exec(`update public.photos set caption = 'safe', favorite = true where id = '${photo}'`);
});
await test('Constraints reject invalid source/confidence and unconfirmed user', async () => {
  for (const values of ["'unknown',null,false", "'ai',-0.1,false", "'ai',1.1,false", "'ai','NaN',false", "'ai','Infinity',false", "'user',0.5,true", "'user',null,false"])
    await denied(`insert into public.photo_pets(photo_id,pet_id,source,confidence,confirmed_by_user) values ('${photo}','${secondary}',${values})`, '23514');
});
await test('Cross-table primary mismatch and relation identity mutation blocked', async () => {
  await denied(`insert into public.photo_pets(photo_id,pet_id,source) values ('${photo}','${secondary}','primary')`, 'P0001');
  await denied(`update public.photo_pets set pet_id = '${secondary}' where photo_id = '${photo}'`, 'P0001');
});
await test('Backfill rerun preserves confirmation and manual rows', async () => {
  await asUser(); await db.exec(add()); await db.exec('reset role');
  await db.exec(`update public.photo_pets set confirmed_by_user = true where photo_id = '${photo}' and source = 'primary'`);
  const backfill = migration.slice(migration.indexOf('insert into public.photo_pets(photo_id, pet_id, source, confidence, confirmed_by_user)\nselect id'), migration.indexOf('\ndo $$', migration.indexOf('-- Idempotent data operation')));
  const before = (await db.query('select * from public.photo_pets order by photo_id,pet_id')).rows;
  await db.exec(backfill); await db.exec(backfill);
  assert.deepEqual((await db.query('select * from public.photo_pets order by photo_id,pet_id')).rows, before);
});
await test('AI reserved rows are not overwritten by manual add', async () => {
  await db.exec(`insert into public.photo_pets(photo_id,pet_id,source,confidence) values ('${photo}','${secondary}','ai',0.7)`);
  await asUser(); await denied(add());
  assert.equal(await scalar(`select source from public.photo_pets where pet_id = '${secondary}'`), 'ai');
});
await test('All three ownership conditions required even with inconsistent legacy data', async () => {
  await db.exec(`update public.pets set owner_user_id = '${other}' where id = '${primary}'`);
  await asUser(); await denied(add()); await denied(remove());
  assert.equal(await scalar(`select count(*)::int from public.get_photo_pets('${photo}')`), 0);
});
await test('Public APIs granted only to authenticated; internal APIs not executable', async () => {
  for (const fn of ['get_photo_pets(uuid)', 'add_photo_pet(uuid,uuid)', 'remove_photo_pet(uuid,uuid)']) {
    assert.equal(await scalar(`select has_function_privilege('authenticated','public.${fn}','execute')`), true);
    for (const role of ['anon', 'service_role'])
      assert.equal(await scalar(`select has_function_privilege('${role}','public.${fn}','execute')`), false);
  }
  for (const fn of ['require_photo_pet_management(uuid,uuid)', 'guard_photo_pet_write()', 'guard_photo_relation_anchor()', 'create_primary_photo_pet()'])
    for (const role of ['authenticated','anon','service_role'])
      assert.equal(await scalar(`select has_function_privilege('${role}','public.${fn}','execute')`), false);
});
await test('DB-managed timestamps preserve creation time on update', async () => {
  const before = await scalar(`select created_at::text from public.photo_pets where photo_id = '${photo}'`);
  await db.exec(`update public.photo_pets set created_at = '2000-01-01', updated_at = '2000-01-01' where photo_id = '${photo}'`);
  assert.equal(await scalar(`select created_at::text from public.photo_pets where photo_id = '${photo}'`), before);
  assert.equal(await scalar(`select updated_at = now() from public.photo_pets where photo_id = '${photo}'`), true);
});
await test('Duplicate scope stays uploader + primary pet + hash', async () => {
  await asUser();
  await db.exec(`update public.photos set content_hash = repeat('a',64) where id = '${photo}'`);
  await db.exec(add());
  await denied(`insert into public.photos(pet_id,uploader_user_id,storage_path,content_hash) values ('${primary}','${owner}','fixture/duplicate',repeat('a',64))`, '23505');
  await db.exec(`insert into public.photos(pet_id,uploader_user_id,storage_path,content_hash) values ('${secondary}','${owner}','fixture/allowed',repeat('a',64))`);
});
await test('Original photo RLS still denies foreign deletion and reading', async () => {
  await asUser(); await db.exec(`delete from public.photos where id = '${foreignPhoto}'`);
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${foreignPhoto}'`), 0);
  await db.exec('reset role');
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${foreignPhoto}'`), 1);
});
await db.exec(`begin; ${await sql('20260915150000_protect_related_pet_photos.sql')} commit;`);
await test('Task042-2 L: primary pet deletion blocked; photo and relations survive', async () => {
  await asUser(); await db.exec(add());
  await denied(`delete from public.pets where id = '${primary}'`, 'P0422');
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${photo}'`), 1);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 2);
});
await test('Task042-2 M: primary pet without secondary relations can still be deleted', async () => {
  await asUser(); await db.exec(`delete from public.pets where id = '${primary}'`);
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${photo}'`), 0);
});
await test('Task042-2 K: deleting secondary pet keeps other primary photo', async () => {
  await asUser(); await db.exec(add()); await db.exec(`delete from public.pets where id = '${secondary}'`);
  assert.equal(await scalar(`select count(*)::int from public.photos where id = '${photo}'`), 1);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 1);
});
await test('Task042-2 J: explicit photo deletion still cascades all relations', async () => {
  await asUser(); await db.exec(add()); await db.exec(`delete from public.photos where id = '${photo}'`);
  assert.equal(await scalar(`select count(*)::int from public.photo_pets where photo_id = '${photo}'`), 0);
});
await test('Task042-2: removing secondary relation permits primary pet deletion', async () => {
  await asUser(); await db.exec(add()); await db.exec(remove());
  await db.exec(`delete from public.pets where id = '${primary}'`);
});
await test('Task042-2: unconfirmed AI relation also protects primary pet', async () => {
  await db.exec(`insert into public.photo_pets(photo_id,pet_id,source) values ('${photo}','${secondary}','ai')`);
  await asUser(); await denied(`delete from public.pets where id = '${primary}'`, 'P0422');
});
await db.close();
console.log(`${passed} isolated PostgreSQL security tests passed`);
