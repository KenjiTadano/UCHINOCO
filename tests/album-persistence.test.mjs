import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DRAFT_GENERATION_METADATA } from "../lib/album-persistence/config.ts";
import { buildDraftSavePayload, draftSignature, parseLayoutRankings, toPersistableSpread } from "../lib/album-persistence/payload.ts";
import { decideWrite, resolveEffectiveFrame, resolveEffectiveSpread } from "../lib/album-persistence/resolve.ts";
import { parseAlbumCompositionPlan } from "../lib/album-draft/composition.ts";

const migration = await readFile("./supabase/migrations/20260927120000_album_draft_persistence.sql", "utf8");
const paidSnapshot = await readFile("./supabase/migrations/20260918140000_order_snapshot_print_jobs.sql", "utf8");
const readDraftSource = await readFile("./lib/album-persistence/read-draft.ts", "utf8");

const july = [
  {
    storySpreadId: "s1",
    layoutId: "L02",
    warnings: [],
    story: { storyType: "same_day", recommendedDensity: "light", importance: 75, coherenceScore: 77 },
    assignments: [
      { frameId: "L02-a", role: "primary", photoId: "6e407fca-d18b-4e40-bd6b-f374c7b882f4", crop: { x: 0.42, y: 0.31, scale: 1.08 }, cropQuality: 100, matchTier: "STRICT", warnings: [] },
      { frameId: "L02-b", role: "primary", photoId: "8f3ac783-2907-42e1-a2bf-ec03af1153e8", crop: { x: 0.55, y: 0.4, scale: 1.02 }, cropQuality: 100, matchTier: "STRICT", warnings: [] },
    ],
  },
  {
    storySpreadId: "s2",
    layoutId: "L12",
    warnings: [],
    story: { storyType: "single", recommendedDensity: "light", importance: 74, coherenceScore: 100 },
    assignments: [
      { frameId: "L12-lead", role: "hero", photoId: "4c8d611f-8026-4c36-b91f-2a632bf1c213", crop: { x: 0.4, y: 0.35, scale: 1.05 }, cropQuality: 100, matchTier: "STRICT", warnings: [] },
      { frameId: "L12-support", role: "secondary", photoId: "736ba321-71b5-4737-a3ff-401615b12118", crop: { x: 0.48, y: 0.42, scale: 1.1 }, cropQuality: 100, matchTier: "STRICT", warnings: [] },
    ],
  },
  {
    storySpreadId: "s3",
    layoutId: "L01b",
    warnings: ["EMPTY_OPPOSITE_PAGE"],
    story: { storyType: "single", recommendedDensity: "light", importance: 72, coherenceScore: 100 },
    assignments: [{ frameId: "L01b-hero", role: "hero", photoId: "518333d3-a2f5-450a-a2db-aaa771d2b112", crop: { x: 0.48, y: 0.46, scale: 1 }, cropQuality: 100, matchTier: "STRICT", warnings: [] }],
  },
];

const frame = {
  aiPhotoId: "736ba321-71b5-4737-a3ff-401615b12118",
  userPhotoId: null,
  aiCropX: 0.48,
  aiCropY: 0.42,
  aiCropScale: 1.1,
  userCropX: null,
  userCropY: null,
  userCropScale: null,
};

test("1. initial AI save keeps user overrides empty and stores five frames", () => {
  const payload = buildDraftSavePayload(july, ["EMPTY_OPPOSITE_PAGE"]);
  assert.equal(payload.spreads.length, 3);
  assert.equal(
    payload.spreads.reduce((sum, spread) => sum + spread.frames.length, 0),
    5,
  );
  assert.equal(payload.spreads[0].aiLayoutId, "L02");
  assert.equal(payload.spreads[1].aiLayoutId, "L12");
  assert.equal(payload.spreads[2].aiLayoutId, "L01b");
  assert.equal(JSON.stringify(payload).includes("userLayoutId"), false);
  assert.equal(JSON.stringify(payload).includes("userPhotoId"), false);
  assert.equal(migration.includes("user_layout_id text"), true);
  assert.equal(migration.includes("null, null, null, null"), true);
});

test("generated spreads preserve Task055 layout rankings, assignments, and crop in the save payload", () => {
  const selectedLayout = {
    layoutId: "L12",
    score: 84,
    layoutScore: 84,
    finalScore: 82,
    tier: "STRICT",
    matchTier: "STRICT",
    composition: "hero",
    orientationFit: 3,
    heroFit: 3,
    captionFit: 0,
    storyFit: 2,
    debugReasons: ["HERO_MATCH"],
  };
  const generated = {
    ...july[1],
    spreadId: "generated-spread",
    selectedLayout,
    alternatives: [{ ...selectedLayout, layoutId: "L11", score: 80 }],
  };
  const payload = buildDraftSavePayload([toPersistableSpread(generated)]);
  const savedSpread = payload.spreads[0];

  assert.equal(savedSpread.aiLayoutId, "L12");
  assert.equal(savedSpread.frames[0].aiPhotoId, "4c8d611f-8026-4c36-b91f-2a632bf1c213");
  assert.equal(savedSpread.frames[0].aiCropScale, 1.05);
  assert.equal(savedSpread.frames[0].role, "hero");
  assert.equal(parseLayoutRankings(payload.metadata.layoutRankings).s2.selectedLayout.layoutId, "L12");
  assert.equal(parseLayoutRankings(payload.metadata.layoutRankings).s2.alternatives[0].layoutId, "L11");
});

test("2. saving the same draft twice is the same signature", () => {
  assert.equal(draftSignature(july), draftSignature(july));
  assert.match(migration, /generation_metadata->>'signature' = v_sig/);
  assert.match(migration, /if v_existing is not null then/);
  assert.match(migration, /unique \(draft_version_id, story_spread_id\)/);
  assert.match(migration, /unique \(draft_spread_id, frame_id\)/);
});

test("3. load uses the effective resolver, which starts as the AI values", () => {
  assert.equal(resolveEffectiveSpread({ aiLayoutId: "L01b", userLayoutId: null }).layoutId, "L01b");
  const shown = resolveEffectiveFrame(frame);
  assert.equal(shown.photoId, frame.aiPhotoId);
  assert.deepEqual(shown.crop, { x: 0.48, y: 0.42, scale: 1.1 });
});

test("4. layout override changes only the user layout", () => {
  const shown = resolveEffectiveSpread({ aiLayoutId: "L01b", userLayoutId: "L01" });
  assert.equal(shown.layoutId, "L01");
  assert.equal(shown.layoutOverridden, true);
});

test("5. reset layout falls back to the AI layout", () => {
  const shown = resolveEffectiveSpread({ aiLayoutId: "L01b", userLayoutId: null });
  assert.equal(shown.layoutId, "L01b");
  assert.equal(shown.layoutOverridden, false);
  assert.match(migration, /when p_reset then null else p_user_layout_id/);
});

test("6. crop override keeps the AI crop and shows the user crop", () => {
  const shown = resolveEffectiveFrame({ ...frame, userCropX: 0.62, userCropY: 0.4, userCropScale: 1.28 });
  assert.equal(frame.aiCropX, 0.48);
  assert.deepEqual(shown.crop, { x: 0.62, y: 0.4, scale: 1.28 });
  assert.equal(shown.cropOverridden, true);
});

test("7. reset crop returns the AI crop", () => {
  const shown = resolveEffectiveFrame({ ...frame, userCropX: null, userCropY: null, userCropScale: null });
  assert.deepEqual(shown.crop, { x: frame.aiCropX, y: frame.aiCropY, scale: frame.aiCropScale });
  assert.match(migration, /when p_clear_crop then null/);
});

test("8. photo override replaces only the shown photo", () => {
  const other = "8f3ac783-2907-42e1-a2bf-ec03af1153e8";
  const shown = resolveEffectiveFrame({ ...frame, userPhotoId: other });
  assert.equal(shown.photoId, other);
  assert.equal(frame.aiPhotoId.startsWith("736ba321"), true);
  assert.match(migration, /この写真はこのアルバムに使えません/);
});

test("9. a later crop wins when an older save finishes last", () => {
  assert.equal(decideWrite({ storedRevision: 2, storedSeq: 3, expectedRevision: 1, clientSeq: 1 }), "stale");
  assert.equal(decideWrite({ storedRevision: 1, storedSeq: 0, expectedRevision: 1, clientSeq: 3 }), "applied");
  assert.match(migration, /client_seq < p_client_seq/);
  assert.match(migration, /'stale'/);
});

test("10. the same sequence with a different revision is a conflict", () => {
  assert.equal(decideWrite({ storedRevision: 4, storedSeq: 2, expectedRevision: 3, clientSeq: 2 }), "conflict");
  assert.match(migration, /'conflict'/);
});

test("11. the owner can read a draft", () => {
  assert.match(migration, /album_draft_versions: owner select/);
  assert.match(migration, /a\.owner_user_id = \(select auth\.uid\(\)\)/);
});

test("12. another user is not granted select, update, or insert", () => {
  assert.equal(migration.includes("for select\n  using (true)"), false);
  assert.match(migration, /album_draft_versions: owner update/);
  assert.match(migration, /album_draft_frames: owner insert/);
  assert.match(migration, /revoke all on public\.album_draft_versions from anon/);
  assert.equal(migration.includes("enable row level security"), true);
});

test("13. an ordered album rejects draft edits in the database", () => {
  assert.match(migration, /このアルバムは注文済みのため変更できません/);
  assert.match(migration, /if v_album_status = 'ordered' then/);
  assert.match(migration, /if v_status = 'ordered' then/);
  assert.match(migration, /albums_lock_drafts_when_ordered/);
});

test("14. frames and spreads cannot be moved to another parent", () => {
  assert.match(migration, /frameを別のspreadへ移せません/);
  assert.match(migration, /spreadを別のdraftへ移せません/);
  assert.match(migration, /draftを別のアルバムへ移せません/);
  assert.match(migration, /references public\.albums\(id\) on delete cascade/);
  assert.match(migration, /references public\.album_draft_versions\(id\) on delete cascade/);
  assert.match(migration, /references public\.album_draft_spreads\(id\) on delete cascade/);
});

test("15. paid order snapshots are not written by draft persistence", () => {
  assert.equal(/insert into public\.order_photos/i.test(migration), false);
  assert.equal(/update public\.order_photos/i.test(migration), false);
  assert.equal(/update public\.print_jobs/i.test(migration), false);
  assert.match(paidSnapshot, /insert into public\.order_photos/);
  assert.match(paidSnapshot, /from public\.album_photos ap/);
  assert.equal(paidSnapshot.includes("album_draft_frames"), false);
});

test("16. generation metadata records every analysis version", () => {
  const payload = buildDraftSavePayload(july);
  for (const [key, value] of Object.entries(DRAFT_GENERATION_METADATA)) {
    assert.equal(payload.metadata[key], value);
  }
  assert.equal(payload.metadata.photo_intelligence_version, "photo-intelligence-v1");
  assert.equal(payload.metadata.album_generation_version, "album-generation-v1");
  assert.match(migration, /generation_metadata jsonb not null/);
});

test("ranked layout alternatives round-trip through generation metadata without changing legacy payloads", () => {
  const selectedLayout = {
    layoutId: "L02",
    score: 84,
    layoutScore: 84,
    finalScore: 79,
    tier: "STRICT",
    matchTier: "STRICT",
    composition: "equal",
    orientationFit: 3,
    heroFit: 0,
    captionFit: 2,
    storyFit: 3,
    debugReasons: ["STORY_MATCH"],
  };
  const alternatives = [
    {
      ...selectedLayout,
      layoutId: "L03",
      score: 72,
      layoutScore: 72,
      finalScore: 70,
      composition: "story",
      orientationFit: 1,
    },
  ];
  const payload = buildDraftSavePayload([{ ...july[0], selectedLayout, alternatives }]);
  const restored = parseLayoutRankings(payload.metadata.layoutRankings);
  assert.deepEqual(restored.s1, { selectedLayout, alternatives });
  assert.deepEqual(parseLayoutRankings(buildDraftSavePayload(july).metadata.layoutRankings), {});
  assert.equal(draftSignature([{ ...july[0], selectedLayout, alternatives }]), draftSignature([july[0]]));
});

test("album composition metadata round-trips without changing legacy payloads", () => {
  const composition = {
    version: "album-rhythm-v2",
    coverRole: "COVER",
    items: [
      { kind: "title", role: "TITLE", title: "わかとの毎日", petName: "わか", period: "2026.07" },
      { kind: "spread", role: "INTRO", storySpreadId: "s1", density: "LOW" },
      { kind: "event", role: "EVENT", eventKind: "birthday", title: "誕生日", date: "2026-07-02", dateLabel: "2026年7月2日", afterStorySpreadId: "s1" },
    ],
  };
  const payload = buildDraftSavePayload(july, [], composition);
  assert.deepEqual(parseAlbumCompositionPlan(payload.metadata.composition), composition);
  assert.notEqual(draftSignature(july, composition), draftSignature(july));
  assert.notEqual(draftSignature(july, composition), draftSignature(july, { ...composition, items: composition.items.slice(0, 1) }));
  assert.equal(Object.hasOwn(buildDraftSavePayload(july).metadata, "composition"), false);
  assert.equal(parseAlbumCompositionPlan(undefined), null);
  assert.match(readDraftSource, /parseAlbumCompositionPlan\(metadata\.composition\)/);
});

test("AI columns are rejected when a user update tries to change them", () => {
  assert.match(migration, /AI Stateは変更できません/);
  assert.match(migration, /new\.ai_layout_id is distinct from old\.ai_layout_id/);
  assert.match(migration, /new\.ai_photo_id is distinct from old\.ai_photo_id/);
  assert.match(migration, /new\.ai_crop_scale is distinct from old\.ai_crop_scale/);
});

test("only one active draft version exists per album", () => {
  assert.match(migration, /album_draft_versions_one_active_idx/);
  assert.match(migration, /where is_active/);
});

test("readDraft batches independent spread detail reads", () => {
  const batchedReads = readDraftSource.match(/Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? "";
  for (const table of ["album_draft_frames", "album_draft_text_elements", "album_draft_decorations", "album_draft_page_elements", "album_draft_spread_backgrounds"]) {
    assert.match(batchedReads, new RegExp(`from\\("${table}"\\)`));
  }
});
