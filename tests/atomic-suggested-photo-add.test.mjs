import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261004140000_atomic_suggested_photo_add.sql", import.meta.url), "utf8");
const action = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/new-photos/actions.ts", import.meta.url), "utf8");

test("suggested add is a single transaction RPC from the Server Action", () => {
  assert.match(action, /rpc\("add_suggested_album_photos"/);
  assert.doesNotMatch(action, /from\("album_photos"\).*upsert/s);
  assert.match(migration, /create or replace function public\.add_suggested_album_photos/);
  assert.match(migration, /begin;[\s\S]*commit;/);
});

test("album lock serializes concurrent position allocation", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('album-suggestion:' \|\| p_album_id::text, 0\)\)/);
  assert.match(migration, /coalesce\(max\(position\), -1\) \+ 1/);
  assert.match(migration, /v_position := v_position \+ 1/);
});

test("owner, multi-pet scope, and unrelated photos are checked inside the RPC", () => {
  assert.match(migration, /owner_user_id = v_user_id/);
  assert.match(migration, /public\.album_pets/);
  assert.match(migration, /p\.pet_id = any\(v_pet_ids\)/);
  assert.match(migration, /p\.uploader_user_id = v_user_id/);
  assert.match(migration, /p_selected_photo_ids <@ v_candidate_ids/);
});

test("accepted, locked, ordered, finalized, stale version and fingerprint are protected", () => {
  assert.match(migration, /v_album\.status <> 'draft'/);
  assert.match(migration, /v_version\.status = 'locked'/);
  assert.match(migration, /event_type = 'album_accepted'/);
  assert.match(migration, /status in \('pending', 'paid'\)/);
  assert.match(migration, /finalized_at is not null/);
  assert.match(migration, /id = p_expected_draft_version_id[\s\S]*and is_active/);
  assert.match(migration, /v_expected <> p_expected_fingerprint/);
});

test("duplicate photos are skipped without position changes or fake analytics", () => {
  assert.match(migration, /if not exists \(select 1 from public\.album_photos/);
  assert.match(migration, /if cardinality\(v_inserted_ids\) > 0 then/);
  assert.match(migration, /jsonb_build_object\('photo_count', cardinality\(v_inserted_ids\)\)/);
  assert.match(migration, /on conflict do nothing/);
});

test("analytics and photos are written by the same function and contain aggregate data only", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.add_suggested_album_photos"), migration.indexOf("create or replace function public.dismiss_suggested_album_photos"));
  assert.match(fn, /insert into public\.album_photos/);
  assert.match(fn, /insert into public\.album_analytics_events/);
  assert.doesNotMatch(fn, /storage_path|caption|signed_url/);
  assert.match(fn, /extensions\.digest/);
});

test("existing draft edits, spreads, frames and cover remain untouched", () => {
  assert.doesNotMatch(migration, /update public\.album_draft_(?:versions|spreads|frames|covers)/);
  assert.doesNotMatch(migration, /delete from public\.album_draft_(?:versions|spreads|frames|covers)/);
  assert.doesNotMatch(migration, /cover_photo_id\s*=/);
});

test("dismiss uses its own validated atomic RPC", () => {
  assert.match(action, /rpc\("dismiss_suggested_album_photos"/);
  assert.match(migration, /create or replace function public\.dismiss_suggested_album_photos/);
  assert.match(migration, /event_type, event_key, event_data[\s\S]*'new_photos_dismissed'/);
});
