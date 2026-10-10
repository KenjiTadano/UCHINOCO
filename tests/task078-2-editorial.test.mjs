import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseAlbumSetup } from "../lib/album-setup.ts";
import { planEditorialAlbum, buildEditorialDraft, auditAlbumRhythm, editorialPageText, reflowAdjacentSpread, canDropUnsafePhoto, candidateDrafts, classifyLayoutRecoveryFailures, createSpreadLayoutRecoveryDiagnostic, evaluateSpreadLayoutCandidates, recordSpreadLayoutCandidates } from "../lib/album-draft/editorial.ts";
import { buildSpreadDraft } from "../lib/album-draft/draft.ts";
import { EDITORIAL_TEMPLATES, EDITORIAL_LIBRARY_SIZE, SAFE_FALLBACK_TEMPLATES } from "../lib/smart-layout/editorial-library.ts";
import { placeFrames } from "../lib/album-draft/pages.ts";
import { findDraftLayout, toPreviewSpread } from "../lib/album-persistence/preview.ts";
import { polishForLayout } from "../lib/album-polish/catalog.ts";

function ranked(count, pets = 2) {
  return Array.from({ length: count }, (_, i) => ({
    photoId: `p${i}`,
    petId: `pet${i % pets}`,
    groupId: `g${i}`,
    timeline: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
    confidence: 90,
    candidate: { photoId: `p${i}`, rank: 1, role: "primary", scores: { overall: 95 - (i % 20), technical: 90, photoIntelligence: 90, expression: 90, petVisibility: 90, composition: 90, memoryValue: 80, relativeUniqueness: 80, sharpness: 90, duplicationPenalty: 0, sceneRepresentativeness: 90 } },
  }));
}
function layoutPhotos(input) {
  return input.map((p) => ({
    photoId: p.photoId,
    petId: p.petId,
    imageUrl: "https://example.com/original",
    previewUrl: "https://example.com/preview",
    bestShot: { candidate: p.candidate, confidence: 90 },
    analysis: { width: 1200, height: 1600, orientation: "portrait", focalPoint: { x: 0.5, y: 0.4 }, pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }], analysisConfidence: { petDetection: 0.95 } },
  }));
}
test("setup defaults to all pets and 48 body pages; subsets and Japan custom dates are validated", () => {
  const form = new FormData();
  const now = new Date("2026-10-09T10:00:00Z");
  assert.deepEqual(parseAlbumSetup(form, ["pet0", "pet1"], now).petIds, ["pet0", "pet1"]);
  assert.equal(parseAlbumSetup(form, ["pet0"], now).pageCount, 48);
  form.set("petSelection", "selected");
  form.append("petIds", "pet1");
  form.set("period", "custom");
  form.set("periodFrom", "2026-09-01");
  form.set("periodTo", "2026-09-02");
  const setup = parseAlbumSetup(form, ["pet0", "pet1"], now);
  assert.deepEqual(setup.petIds, ["pet1"]);
  assert.equal(setup.from.toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(setup.to.toISOString(), "2026-09-02T14:59:59.999Z");
  form.append("petIds", "foreign");
  assert.throws(() => parseAlbumSetup(form, ["pet1"]));
  form.delete("petIds");
  form.append("petIds", "pet1");
  form.set("periodTo", "2026-02-30");
  assert.throws(() => parseAlbumSetup(form, ["pet1"]));
  form.set("period", "3months");
  form.set("pageCount", "36");
  assert.throws(() => parseAlbumSetup(form, ["pet1"]));
});
test("editorial and mirrored safe-fallback designs are registered; body slots retain geometry and do not cross the binding", () => {
  assert.equal(EDITORIAL_LIBRARY_SIZE, 54);
  assert.equal(new Set(EDITORIAL_TEMPLATES.map((t) => t.id)).size, 48);
  assert.deepEqual([...new Set(SAFE_FALLBACK_TEMPLATES.map((t) => t.photoCount))], [1, 2, 3, 4, 5, 6]);
  assert.ok(SAFE_FALLBACK_TEMPLATES.every((t) => SAFE_FALLBACK_TEMPLATES.filter((candidate) => candidate.photoCount === t.photoCount).length >= 2));
  assert.ok(SAFE_FALLBACK_TEMPLATES.some((t) => t.id === "E_SAFE_FALLBACK_1_LANDSCAPE"));
  assert.ok(SAFE_FALLBACK_TEMPLATES.every((t) => t.printSafe && t.cropSafety === "strict"));
  for (const t of EDITORIAL_TEMPLATES) {
    assert.equal(findDraftLayout(t.id)?.id, t.id);
    assert.equal(t.frames.length, t.photoCount);
    assert.ok(t.similarGroup && t.cropSafety && t.avoidAfter.length);
    const slots = placeFrames(t.frames, new Map());
    assert.equal(slots.length, t.photoCount);
    for (const a of slots) {
      assert.equal(a.crossesGutter, false);
      assert.ok(a.rect.w > 0 && a.rect.h > 0);
      assert.ok(a.gutterClearance > 0);
    }
    if (t.photoCount > 1) assert.deepEqual(new Set(slots.map((s) => s.side)), new Set(["left", "right"]));
    else assert.equal(polishForLayout(t.id).text.length, 1);
  }
});
for (const pages of [24, 48, 72])
  test(`${pages}P budget yields exact nonempty spreads and unique ranked photos`, () => {
    const input = ranked(110);
    const plan = planEditorialAlbum(input, pages);
    assert.equal(plan.spreads.length * 2, pages);
    assert.ok(new Set(plan.spreads.map((s) => s.photoIds.length)).size > 2);
    const ids = plan.spreads.flatMap((s) => s.photoIds);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids.length, plan.selected.length);
    assert.ok(plan.selected.some((p) => p.petId === "pet0") && plan.selected.some((p) => p.petId === "pet1"));
    assert.ok(plan.spreads.every((s) => s.photoIds.length >= 1 && s.photoIds.length <= 6));
  });
test("insufficient, duplicate, alternate and low quality photos cannot pad a book", () => {
  assert.throws(() => planEditorialAlbum(ranked(6), 24), /少なくとも12枚/);
  const input = ranked(12);
  input[11].candidate.role = "alternate";
  assert.throws(() => planEditorialAlbum(input, 24));
  input[11].candidate.role = "primary";
  input[11].candidate.scores.technical = 0;
  assert.throws(() => planEditorialAlbum(input, 24));
  assert.throws(() => planEditorialAlbum(Array(15).fill(ranked(1)[0]), 24));
});
test("48P from 36 photos has meaningful single-photo pages and no fabricated photos", () => {
  const plan = planEditorialAlbum(ranked(36), 48);
  assert.equal(plan.spreads.length, 24);
  assert.equal(plan.spreads.flatMap((s) => s.photoIds).length, 36);
});
test("production layout candidates are crop-safe, persistable and audited as a whole book", () => {
  const plan = planEditorialAlbum(ranked(38), 24);
  const texts = Object.fromEntries(plan.spreads.filter((s) => s.photoIds.length === 1).map((s) => [s.id, "2026年8月の思い出"]));
  const result = buildEditorialDraft(plan.spreads, layoutPhotos(plan.selected), texts);
  assert.equal(result.spreads.length, 12);
  assert.ok(!result.audit.issues.some((i) => i.blocking));
  assert.ok(result.audit.layoutCount >= 5);
  assert.ok(result.audit.score >= result.beforeAudit.score);
  assert.ok(!result.audit.issues.some((i) => ["REPEATED_TEMPLATE", "SIMILAR_TEMPLATE"].includes(i.code)));
  for (const spread of result.spreads) {
    const lead = spread.story.primaryPhotoIds[0];
    const leadArea = Math.max(...spread.assignments.filter((a) => a.photoId === lead).map((a) => a.placement.rect.w * a.placement.rect.h));
    assert.ok(spread.assignments.every((a) => a.placement.rect.w * a.placement.rect.h <= leadArea * 1.05));
  }
  const missingText = auditAlbumRhythm(result.spreads, {});
  assert.ok(missingText.issues.some((i) => i.code === "BLANK_PAGE"));
  const repeated = auditAlbumRhythm(Array(8).fill(result.spreads[1]), texts);
  assert.ok(repeated.issues.some((i) => i.code === "REPEATED_TEMPLATE"));
  // Saved draft reconstructs the exact geometry and crop aspect used during generation.
  for (const s of result.spreads) {
    const source = { id: s.spreadId, storySpreadId: s.storySpreadId, aiLayoutId: s.layoutId, userLayoutId: null, storyType: s.story.storyType, recommendedDensity: s.story.recommendedDensity, importance: s.story.importance, coherence: s.story.coherenceScore, warnings: [] };
    const frames = s.assignments.map((a, i) => ({ id: `f${i}`, position: i, frameId: a.frameId, role: a.role, aiPhotoId: a.photoId, userPhotoId: null, aiCropX: a.crop.x, aiCropY: a.crop.y, aiCropScale: a.crop.scale, userCropX: null, userCropY: null, userCropScale: null, matchTier: a.matchTier, cropQuality: a.cropQuality, warnings: [] }));
    const saved = toPreviewSpread(source, frames, new Map());
    assert.deepEqual(
      saved.assignments.map((a) => a.placement),
      s.assignments.map((a) => a.placement),
    );
    assert.deepEqual(
      saved.assignments.map((a) => a.cropFrame.aspectRatio),
      s.assignments.map((a) => a.cropFrame.aspectRatio),
    );
  }
});
test("safe fallback layout for every density remains registered and passes normal crop gates", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-safe", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const draft = buildEditorialDraft([story], layoutPhotos([photo]), { [story.id]: "2026年8月" });
  assert.equal(draft.spreads.length, 1);
  assert.equal(draft.recovery.unrecoveredCount, 0);
  assert.ok(draft.spreads[0].status !== "unusable");
  assert.deepEqual([...new Set(SAFE_FALLBACK_TEMPLATES.map((t) => t.photoCount))], [1, 2, 3, 4, 5, 6]);
  const fallback = buildSpreadDraft(story, layoutPhotos([photo]), undefined, ["E_SAFE_FALLBACK_1"]);
  assert.equal(fallback.layoutId, "E_SAFE_FALLBACK_1");
  assert.notEqual(fallback.status, "unusable");
});
test("bounded layout recovery tries ranked candidates then the safe fallback after initial candidates are unsafe", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-1", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const calls = [];
  const evaluate = (_story, _photos, _context, layoutIds) => {
    calls.push(layoutIds[0]);
    return { layoutId: layoutIds[0], status: layoutIds[0].startsWith("E_SAFE_FALLBACK_") ? "ready" : "unusable", warnings: [], assignments: [], story: { secondaryPhotoIds: [] }, selectedLayout: { tier: "FALLBACK" } };
  };
  const work = { cells: new Map(), cropDurationMs: 0, cropItemCount: 0, cropReusedCount: 0 };
  assert.equal(candidateDrafts(story, layoutPhotos([photo]), work, false, evaluate).length, 0);
  const recovered = candidateDrafts(story, layoutPhotos([photo]), work, true, evaluate);
  assert.ok(recovered.some((draft) => draft.layoutId === "E_SAFE_FALLBACK_1"));
  assert.ok(calls.length <= 16);
});
test("unrecoverable primary crop is replaced by a same-scene eligible Best Shot", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-1", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const unsafe = layoutPhotos([photo])[0];
  unsafe.analysis.focalPoint = { x: 0.98, y: 0.08 };
  unsafe.analysis.pets = [{ bbox: { x: 0.85, y: 0.01, width: 0.14, height: 0.98 }, face: { x: 0.9, y: 0.01, width: 0.1, height: 0.2 }, confidence: 0.95 }];
  const replacement = { ...ranked(1, 1)[0], photoId: "replacement", groupId: photo.groupId, candidate: { ...photo.candidate, photoId: "replacement" } };
  const replacementLayout = layoutPhotos([replacement])[0];
  const recovered = buildEditorialDraft([story], [unsafe, replacementLayout], { [story.id]: "2026年8月" }, undefined, { [story.id]: [replacement.photoId] });
  assert.equal(recovered.recovery.bestShotReplacementCount, 1);
  assert.equal(recovered.recovery.bestShotReplacementAttemptCount, 1);
  assert.equal(recovered.recovery.globalReplacementAttemptCount, 0);
  assert.equal(recovered.recovery.spreadDiagnostics[0].replacementCount, 1);
  assert.equal(recovered.recovery.spreadDiagnostics[0].finalPhotoCount, 1);
  assert.deepEqual(recovered.selectedPhotoIds, ["replacement"]);
  assert.ok(!recovered.audit.issues.some((issue) => issue.blocking));
  assert.equal(new Set(recovered.spreads.flatMap((spread) => spread.assignments.map((frame) => frame.photoId))).size, 1);
});
test("global Best Shot replacement is counted separately from same-scene recovery", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-global", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const unsafe = layoutPhotos([photo])[0];
  unsafe.analysis.focalPoint = { x: 0.98, y: 0.08 };
  unsafe.analysis.pets = [{ bbox: { x: 0.85, y: 0.01, width: 0.14, height: 0.98 }, face: { x: 0.9, y: 0.01, width: 0.1, height: 0.2 }, confidence: 0.95 }];
  const global = { ...ranked(1, 1)[0], photoId: "global", groupId: "another-scene", petId: "another-pet", candidate: { ...photo.candidate, photoId: "global" } };
  const replacement = layoutPhotos([global])[0];
  const result = buildEditorialDraft([story], [unsafe, replacement], { [story.id]: "2026年8月" }, undefined, { [story.id]: [global.photoId] }, { [global.photoId]: "global_replacement" }, 1, 2);
  assert.equal(result.recovery.globalReplacementAttemptCount, 1);
  assert.equal(result.recovery.globalReplacementSuccessCount, 1);
  assert.equal(result.recovery.usedPhotoCount, 1);
  assert.equal(result.recovery.unusedPhotoCount, 1);
  assert.deepEqual(result.selectedPhotoIds, [global.photoId]);
});
test("three-photo unsafe spread drops the persistent unsafe contributor and rebuilds safely above minimum unique count", () => {
  const input = layoutPhotos(ranked(3, 1));
  input[0].analysis.focalPoint = { x: 0.98, y: 0.08 };
  input[0].analysis.pets = [{ bbox: { x: 0.85, y: 0.01, width: 0.14, height: 0.98 }, face: { x: 0.9, y: 0.01, width: 0.1, height: 0.2 }, confidence: 0.95 }];
  const ids = input.map((photo) => photo.photoId);
  const story = { id: "editorial-drop", sceneIds: ["g0", "g1", "g2"], photoIds: ids, primaryPhotoIds: [ids[0]], secondaryPhotoIds: ids.slice(1), startedAt: "2026-08-01", endedAt: "2026-08-03", storyType: "sequence", theme: {}, coherenceScore: 90, importance: 90, recommendedDensity: "medium", warnings: [], analysisVersion: "fixture" };
  assert.equal(canDropUnsafePhoto([story], 0, ids[0], 1), true);
  const result = buildEditorialDraft([story], input, { [story.id]: "2026年8月" }, undefined, {}, {}, 1, 3);
  assert.equal(result.recovery.photoDropSuccessCount, 1);
  assert.equal(result.recovery.usedPhotoCount, 2);
  assert.equal(result.recovery.unusedPhotoCount, 1);
  assert.deepEqual(result.selectedPhotoIds.sort(), ids.slice(1).sort());
  assert.ok(!result.audit.issues.some((issue) => issue.blocking));
  assert.equal(new Set(result.spreads.flatMap((spread) => spread.assignments.map((frame) => frame.photoId))).size, 2);
});
test("minimum unique-photo guard refuses photo drop below the requested spread budget", () => {
  const makeSpread = (id, photoIds) => ({ id, sceneIds: [id], photoIds, primaryPhotoIds: [photoIds[0]], secondaryPhotoIds: photoIds.slice(1), startedAt: "2026-08-01", endedAt: "2026-08-01", storyType: "sequence", theme: {}, coherenceScore: 90, importance: 80, recommendedDensity: "medium", warnings: [], analysisVersion: "fixture" });
  const stories = [makeSpread("unsafe", ["a", "b"]), makeSpread("neighbor-a", ["c"]), makeSpread("neighbor-b", ["d"])];
  assert.equal(canDropUnsafePhoto(stories, 0, "a", 4), false);
  assert.equal(canDropUnsafePhoto(stories, 0, "a", 2), true);
});
test("photo drop preserves a pet's last Album photo when another same-pet eligible photo is available", () => {
  const makeSpread = (id, photoIds) => ({ id, sceneIds: [id], photoIds, primaryPhotoIds: [photoIds[0]], secondaryPhotoIds: photoIds.slice(1), startedAt: "2026-08-01", endedAt: "2026-08-01", storyType: "sequence", theme: {}, coherenceScore: 90, importance: 80, recommendedDensity: "medium", warnings: [], analysisVersion: "fixture" });
  const stories = [makeSpread("pet-a", ["a1", "b1"]), makeSpread("pet-b", ["b2"])];
  const photos = [
    { photoId: "a1", petId: "a" },
    { photoId: "b1", petId: "b" },
    { photoId: "b2", petId: "b" },
    { photoId: "a2", petId: "a" },
  ];
  assert.equal(canDropUnsafePhoto(stories, 0, "a1", 2, photos, { a: 2, b: 2 }), false);
  assert.equal(canDropUnsafePhoto(stories, 0, "b1", 2, photos, { a: 2, b: 2 }), true);
});
test("exhausted safety recovery returns generic actionable failure metadata without crop terminology", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-1", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const unsafe = layoutPhotos([photo])[0];
  unsafe.analysis.focalPoint = { x: 0.98, y: 0.08 };
  unsafe.analysis.pets = [{ bbox: { x: 0.85, y: 0.01, width: 0.14, height: 0.98 }, face: { x: 0.9, y: 0.01, width: 0.1, height: 0.2 }, confidence: 0.95 }];
  assert.throws(
    () => buildEditorialDraft([story], [unsafe], { [story.id]: "2026年8月" }),
    (error) => {
      assert.deepEqual(error.unrecoveredSpreadIndices, [0]);
      assert.match(error.message, /アルバムを完成できませんでした/);
      assert.doesNotMatch(error.message, /Crop|crop|Layout|template|配置|ページ数や対象期間/);
      const diagnostic = error.recoveryStats.spreadDiagnostics[0];
      assert.equal(diagnostic.spreadIndex, 0);
      assert.equal(diagnostic.photoCount, 1);
      assert.equal(diagnostic.initialCandidateCount, 6);
      assert.equal(diagnostic.safeFallbackCandidateCount, 3);
      assert.equal(diagnostic.replacementAvailable, false);
      assert.equal(diagnostic.outcome, "unrecovered");
      assert.equal(diagnostic.recoveryReached, "photo_drop");
      assert.deepEqual(diagnostic.recoveryStagesReached, ["initial", "template_fallback", "safe_fallback", "role_reassignment", "best_shot_replacement", "density_fallback", "photo_drop"]);
      assert.ok(diagnostic.strictCandidateCount + diagnostic.fallbackCandidateCount > 0);
      assert.ok(diagnostic.failureReasonCounts.cropUnsafe > 0);
      assert.ok(diagnostic.failureReasonCounts.sourceSubjectAlreadyClipped > 0);
      assert.equal(error.recoveryStats.templateFallbackAttemptCount, 2);
      assert.equal(error.recoveryStats.safeFallbackAttemptCount, 3);
      assert.equal(error.recoveryStats.templateFallbackCount, 0);
      assert.equal(error.recoveryStats.safeFallbackUsedCount, 0);
      assert.equal(error.recoveryStats.bestShotReplacementAttemptCount, 0);
      assert.equal(error.recoveryStats.adjacentReflowAttemptCount, 0);
      assert.equal(error.recoveryStats.failureReasonCounts.noReplacementCandidate, 1);
      assert.equal(error.recoveryStats.failureReasonCounts.reflowUnavailable, 1);
      assert.equal(error.recoveryStats.failureReasonCounts.noSafeFallback, 0);
      return true;
    },
  );
});
test("adjacent density fallback reflows 5+2 photos to 4+3 without duplicates or page loss", () => {
  const makeSpread = (id, count) => ({
    id,
    sceneIds: [id],
    photoIds: Array.from({ length: count }, (_, i) => `${id}-p${i}`),
    primaryPhotoIds: [`${id}-p0`],
    secondaryPhotoIds: Array.from({ length: count - 1 }, (_, i) => `${id}-p${i + 1}`),
    startedAt: "2026-08-01",
    endedAt: "2026-08-01",
    storyType: "sequence",
    theme: {},
    coherenceScore: 90,
    importance: 80,
    recommendedDensity: "dense",
    warnings: [],
    analysisVersion: "fixture",
  });
  const stories = [makeSpread("a", 5), makeSpread("b", 2)];
  const result = reflowAdjacentSpread(stories, 0, 1);
  assert.deepEqual(
    result.map((story) => story.photoIds.length),
    [4, 3],
  );
  const ids = result.flatMap((story) => story.photoIds);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  assert.equal(reflowAdjacentSpread([makeSpread("full", 5), makeSpread("at-cap", 6)], 0, 1), null);
});
test("layout recovery failures are classified into aggregate reasons without identifiers", () => {
  const counts = classifyLayoutRecoveryFailures({ warnings: ["EAR_UNSAFE", "GUTTER_CROSS", "UNUSABLE_FRAME", "SECONDARY_DOMINATES"], sourceSubjectAlreadyClipped: true, noReplacementCandidate: true, reflowUnavailable: true });
  assert.equal(counts.cropUnsafe, 1);
  assert.equal(counts.gutterViolation, 1);
  assert.equal(counts.frameInvalid, 1);
  assert.equal(counts.heroHierarchyViolation, 1);
  assert.equal(counts.sourceSubjectAlreadyClipped, 1);
  assert.equal(counts.noReplacementCandidate, 1);
  assert.equal(counts.reflowUnavailable, 1);
  assert.equal(counts.other, 0);
  assert.equal(classifyLayoutRecoveryFailures({ warnings: ["NO_LAYOUT_FOR_COUNT"] }).noMatchingTemplate, 1);
  assert.equal(
    Object.keys(counts).some((key) => /photo.?id|email|caption/i.test(key)),
    false,
  );
});
test("per-spread diagnostics distinguish evaluated rejected fallbacks from a missing fallback lookup", () => {
  const photo = ranked(1, 1)[0];
  const story = { id: "editorial-diag", sceneIds: [photo.groupId], photoIds: [photo.photoId], primaryPhotoIds: [photo.photoId], secondaryPhotoIds: [], startedAt: photo.timeline, endedAt: photo.timeline, storyType: "single", theme: {}, coherenceScore: 100, importance: 95, recommendedDensity: "hero", warnings: [], analysisVersion: "fixture" };
  const layout = SAFE_FALLBACK_TEMPLATES.find((item) => item.photoCount === 1);
  const work = { cells: new Map(), cropDurationMs: 0, cropItemCount: 0, cropReusedCount: 0 };
  const rejected = awaitCandidates(layout, work);
  const diagnostic = createSpreadLayoutRecoveryDiagnostic(2, story);
  recordSpreadLayoutCandidates(diagnostic, rejected.diagnostics, "safe_fallback");
  assert.equal(diagnostic.spreadIndex, 2);
  assert.equal(diagnostic.photoCount, 1);
  assert.equal(diagnostic.safeFallbackCandidateCount, 1);
  assert.equal(diagnostic.fallbackCandidateCount, 1);
  assert.equal(diagnostic.failureReasonCounts.cropUnsafe, 1);
  assert.equal(diagnostic.failureReasonCounts.noSafeFallback, 0);
  const absent = createSpreadLayoutRecoveryDiagnostic(2, story);
  const missing = evaluateSpreadLayoutCandidates(story, layoutPhotos([photo]), [], work, undefined, "safe_fallback");
  recordSpreadLayoutCandidates(absent, missing.diagnostics, "safe_fallback");
  assert.equal(absent.safeFallbackCandidateCount, 0);
  assert.equal(absent.failureReasonCounts.noSafeFallback, 1);
  assert.equal(absent.failureReasonCounts.noMatchingTemplate, 0);
  const noTemplate = createSpreadLayoutRecoveryDiagnostic(2, story);
  const missingTemplate = evaluateSpreadLayoutCandidates(story, layoutPhotos([photo]), [], work, undefined, "initial", false);
  recordSpreadLayoutCandidates(noTemplate, missingTemplate.diagnostics, "initial");
  assert.equal(noTemplate.failureReasonCounts.noMatchingTemplate, 1);
  assert.equal(
    Object.keys(diagnostic).some((key) => /photo.?id|email|caption/i.test(key)),
    false,
  );
  function awaitCandidates(candidateLayout, candidateWork) {
    return evaluateSpreadLayoutCandidates(story, layoutPhotos([photo]), [candidateLayout], candidateWork, (_story, _photos, _context, layoutIds) => ({ layoutId: layoutIds[0], status: "unusable", warnings: ["EAR_UNSAFE"], assignments: [], story: { secondaryPhotoIds: [] }, selectedLayout: { tier: "FALLBACK" } }), "safe_fallback");
  }
});
test("creation saves multi-pet drafts, all source IDs and preview-first; Best Shot batching remains intact", () => {
  const source = readFileSync(new URL("../app/(app)/pets/[petId]/album/new/actions.ts", import.meta.url), "utf8");
  const recoveryTypes = readFileSync(new URL("../lib/album-draft/editorial.ts", import.meta.url), "utf8");
  assert.match(source, /buildEditorialDraft/);
  assert.match(source, /requested_body_pages/);
  assert.match(source, /generation_photo_ids/);
  assert.match(source, /\?view=preview/);
  assert.doesNotMatch(source, /if \(selectedPets.length === 1\)/);
  assert.match(source, /story\.sceneIds\.includes\(photo\.groupId\)/);
  assert.match(source, /photo\.candidate\.role !== "alternate"/);
  assert.match(source, /photo\.candidate\.scores\.technical >= 25/);
  assert.match(source, /timing\.layoutRecovery\(/);
  assert.match(source, /function logAlbumLayoutRecovery\(/);
  assert.match(source, /console\.info\("albumLayoutRecovery", record\)/);
  assert.match(source, /timing\.layoutRecovery\(record\)/);
  for (const key of [
    "spreadCount",
    "spreadDiagnostics",
    "initialUnsafeSpreadCount",
    "templateFallbackAttemptCount",
    "templateFallbackCount",
    "safeFallbackAttemptCount",
    "photoReassignmentAttemptCount",
    "photoReassignmentCount",
    "bestShotReplacementAttemptCount",
    "bestShotReplacementCount",
    "densityFallbackAttemptCount",
    "densityFallbackCount",
    "adjacentReflowAttemptCount",
    "adjacentReflowCount",
    "safeFallbackUsedCount",
    "unrecoveredCount",
    "failureReasonCounts",
  ])
    assert.ok(recoveryTypes.includes(key));
  const shots = readFileSync(new URL("../app/(app)/dev/best-shot/actions.ts", import.meta.url), "utf8");
  assert.match(shots, /chunkPhotoIds\(photoIds\)/);
  assert.match(shots, /uniquePhotoIds\(grouped.groups/);
});

test("quiet-page copy meets SQL plain-text and 80-character constraints including emoji", () => {
  const text = editorialPageText("2026-08-01T10:00:00Z", "<script>" + "🐶".repeat(120));
  assert.ok(!/[<>]/.test(text));
  assert.equal(Array.from(text).length, 80);
  assert.match(text, /2026年8月1日/);
});
