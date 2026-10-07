import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { placementFingerprint, rankPhotoPlacements, spreadHasManualEdits } from "../lib/album-photo-placement.ts";

const photo = { id: "p", petId: "pet-a", takenAt: "2026-10-04T03:00:00Z", orientation: "portrait", bestShotScore: 82, crop: { x: .42, y: .38, scale: 1.1 } };
const spread = (overrides = {}) => ({ id: "s", position: 0, role: "STORY", density: "MEDIUM", storyStartedAt: "2026-10-04T01:00:00Z", frameCount: 3, edited: false, ...overrides });

test("same-story date proximity and empty capacity rank first", () => {
  const plans = rankPhotoPlacements(photo, [spread(), spread({ id: "later", position: 1, storyStartedAt: "2026-09-01T00:00:00Z", frameCount: 3 })]);
  assert.equal(plans[0].anchorSpreadId, "s");
  assert.equal(plans[0].kind, "EXISTING_SPREAD");
  assert.equal(plans[0].layoutId, "L06");
  assert.match(plans[0].reason, /同じ日/);
});

test("manual edited spread becomes INSERT_AFTER rather than EXISTING_SPREAD", () => {
  const plans = rankPhotoPlacements(photo, [spread({ id: "edited", edited: true }), spread({ id: "hero", role: "HERO" }), spread({ id: "quiet", role: "QUIET" }), spread({ id: "full", frameCount: 4 })]);
  assert.equal(plans[0].kind, "INSERT_AFTER");
  assert.equal(plans[0].anchorSpreadId, "edited");
  assert.equal(plans.at(-1).kind, "APPEND");
});

test("three-photo spread exposes 3-to-4 conversion and adjacent alternative at the same anchor", () => {
  const plans = rankPhotoPlacements(photo, [spread({ id: "story-3", position: 2 })]);
  assert.deepEqual(plans.map((plan) => plan.kind), ["EXISTING_SPREAD", "INSERT_AFTER", "APPEND"]);
  assert.equal(plans[0].anchorSpreadId, "story-3");
  assert.equal(plans[1].anchorSpreadId, "story-3");
  assert.equal(plans[0].insertPosition, 2);
  assert.equal(plans[1].insertPosition, 3);
});

test("new spread fallback preserves stored crop and orientation layout", () => {
  const plan = rankPhotoPlacements(photo, [])[0];
  assert.equal(plan.kind, "APPEND");
  assert.equal(plan.layoutId, "L01b");
  assert.deepEqual(plan.crop, photo.crop);
});

test("manual layout, crop, photo, text, decoration, element and background protect a spread", () => {
  const base = { userLayoutId: null, frames: [{ userPhotoId: null, userCrop: null }], texts: [], decorations: [], elements: [], backgrounds: { left: { backgroundId: null }, right: { backgroundId: null } } };
  assert.equal(spreadHasManualEdits(base), false);
  assert.equal(spreadHasManualEdits({ ...base, userLayoutId: "L02" }), true);
  assert.equal(spreadHasManualEdits({ ...base, frames: [{ userPhotoId: null, userCrop: { x: .5 } }] }), true);
  assert.equal(spreadHasManualEdits({ ...base, texts: [{ overrideMode: "replace" }] }), true);
  assert.equal(spreadHasManualEdits({ ...base, decorations: [{ overrideMode: "replace" }] }), true);
  assert.equal(spreadHasManualEdits({ ...base, elements: [{}] }), true);
  assert.equal(spreadHasManualEdits({ ...base, backgrounds: { left: { backgroundId: "paper" } } }), true);
});

test("preview is read-only and apply is explicit", async () => {
  const page = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/new-photos/placement/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Previewではまだアルバムを変更しません/);
  assert.match(page, /この配置を使う/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(/);
});

test("apply clones a new draft, places locally, is atomic, and does not call Vision", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261004150000_smart_added_photo_placement.sql", import.meta.url), "utf8");
  assert.match(migration, /apply_added_photo_placement/);
  assert.match(migration, /undo_added_photo_placement/);
  assert.match(migration, /redo_added_photo_placement/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insert into public\.album_draft_versions/);
  assert.match(migration, /placement_parent_version_id/);
  assert.match(migration, /p_mode='EXISTING_SPREAD'/);
  assert.match(migration, /p_mode='INSERT_AFTER'/);
  assert.match(migration, /p_mode='APPEND'/);
  assert.match(migration, /event_type='album_accepted'/);
  assert.match(migration, /status in \('pending','paid'\)/);
  assert.match(migration, /finalized_at is not null/);
  assert.doesNotMatch(migration, /update public\.album_draft_spreads|update public\.album_draft_frames|OPENAI_API_KEY|responses\.create/i);
  assert.match(migration, /from public\.album_draft_text_elements/);
  assert.match(migration, /from public\.album_draft_decorations/);
  assert.match(migration, /from public\.album_draft_spread_backgrounds/);
  assert.match(migration, /from public\.album_draft_covers/);
  assert.match(migration, /v_spread\.position>v_anchor_position then 1/);
  assert.match(migration, /order by position loop/);
  assert.match(migration, /v_frame\.user_crop_x,v_frame\.user_crop_y,v_frame\.user_crop_scale/);
  assert.match(migration, /ai_text,user_text,ai_style_id,user_style_id,override_mode/);
  assert.match(migration, /user_decoration_id/);
  assert.match(migration, /background_id,revision,client_seq/);
});

test("alternatives are capped at three and deterministic", () => {
  const plans = rankPhotoPlacements(photo, [spread({ id: "a" }), spread({ id: "b", position: 1 }), spread({ id: "c", position: 2 })]);
  assert.equal(plans.length, 3);
  assert.deepEqual(plans, rankPhotoPlacements(photo, [spread({ id: "a" }), spread({ id: "b", position: 1 }), spread({ id: "c", position: 2 })]));
});

test("placement fingerprint binds mode, anchor, layout and active version", () => {
  const plan = rankPhotoPlacements(photo, [spread()])[0];
  const first = placementFingerprint("album", "version-a", "photo", plan);
  assert.equal(first.length, 64);
  assert.notEqual(first, placementFingerprint("album", "version-b", "photo", plan));
  assert.notEqual(first, placementFingerprint("album", "version-a", "photo", { ...plan, kind: "INSERT_AFTER" }));
});

test("version switch provides one-step undo and redo without deleting either version", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261004150000_smart_added_photo_placement.sql", import.meta.url), "utf8");
  assert.match(migration, /set is_active=false where id=p_placement_version_id/);
  assert.match(migration, /set is_active=true where id=p_parent_version_id/);
  assert.match(migration, /set is_active=false where id=p_parent_version_id/);
  assert.match(migration, /set is_active=true where id=p_placement_version_id/);
  assert.doesNotMatch(migration, /delete from public\.album_draft/);
});

test("atomic RPC rechecks races and a raised exception rolls back its single transaction", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261004150000_smart_added_photo_placement.sql", import.meta.url), "utf8");
  assert.match(migration, /v_current\.id <> p_expected_draft_version_id/);
  assert.match(migration, /v_current\.status = 'locked'/);
  assert.match(migration, /event_type='album_accepted'/);
  assert.match(migration, /status in \('pending','paid'\)/);
  assert.match(migration, /finalized_at is not null/);
  assert.match(migration, /stale placement candidate/);
  assert.match(migration, /begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(migration, /exception[\s\S]*delete from public\.album_draft/);
});

test("preview exposes all local modes and remains non-persistent", async () => {
  const page = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/new-photos/placement/page.tsx", import.meta.url), "utf8");
  assert.match(page, /このページに追加/);
  assert.match(page, /このページの後に追加/);
  assert.match(page, /最後に追加/);
  assert.match(page, /ALBUM_LAYOUTS/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(/);
});
