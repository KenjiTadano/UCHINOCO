import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20261004120000_atomic_passive_album_materialization.sql";

test("successful materialize uses one transaction RPC for every persistent row", async () => {
  const action = await source("app/(app)/pets/[petId]/album/candidate/actions.ts");
  assert.match(action, /\.rpc\("materialize_passive_album_candidate"/);
  assert.doesNotMatch(action, /\.from\("albums"\)\.(insert|update|upsert)/);
  assert.doesNotMatch(action, /\.from\("album_photos"\)\.(insert|update|upsert)/);
  assert.doesNotMatch(action, /loadCoverEditor/);
});

test("duplicate and concurrent open converge under fingerprint lock", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /passive_candidate_fingerprint/);
  assert.match(sql, /'reused', true/);
  assert.match(sql, /v_expected_album_id/);
});

test("album, photo, draft and cover failure probes all raise inside the transaction", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /^begin;/m);
  for (const stage of ["after_album", "after_photos", "after_draft", "after_cover"]) {
    assert.match(sql, new RegExp(`v_fail_stage = '${stage}'.*raise exception`));
  }
  assert.match(sql, /^commit;/m);
  assert.doesNotMatch(sql, /delete from public\.(albums|album_photos|album_draft_versions|album_draft_covers)/);
});

test("owner and stale fingerprint are checked again inside Postgres", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /p\.owner_user_id = v_user_id/);
  assert.match(sql, /p\.uploader_user_id = v_user_id/);
  assert.match(sql, /raise exception 'stale candidate'/);
  assert.match(sql, /candidate metadata mismatch/);
});

test("edited, accepted, ready, ordered and finalized state is protected", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /a\.status in \('ready', 'ordered'\)/);
  assert.match(sql, /d\.status = 'editing'/);
  assert.match(sql, /album_accepted/);
  assert.match(sql, /album_edit_started/);
  assert.match(sql, /finalized_at is not null/);
});

test("metadata round-trip keeps Task063 identity, photo set, period and layout payload", async () => {
  const action = await source("app/(app)/pets/[petId]/album/candidate/actions.ts");
  const sql = await source(migrationPath);
  for (const key of ["passive_candidate_version", "passive_candidate_fingerprint", "passive_candidate_photo_ids", "passive_candidate_period", "materialized_on_open"]) {
    assert.match(action, new RegExp(key));
    assert.match(sql, new RegExp(key));
  }
  assert.match(action, /candidate\.composition/);
  assert.match(sql, /save_album_draft_version\(p_album_id, p_payload\)/);
});

test("migration exposes only the authenticated atomic entry point", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /security invoker/);
  assert.match(sql, /revoke all on function public\.materialize_passive_album_candidate/);
  assert.match(sql, /grant execute.*to authenticated/);
  assert.doesNotMatch(sql, /security definer/i);
});
