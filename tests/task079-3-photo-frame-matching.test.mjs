import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_HIERARCHY_LAYOUTS } from "../lib/album-draft/layouts.ts";
import { evaluateLayout } from "../lib/smart-layout/assign.ts";
import { scorePhotoFrameCompatibility } from "../lib/smart-layout/compatibility.ts";
import { planEditorialAlbum, buildEditorialDraft } from "../lib/album-draft/editorial.ts";
import { analyzePhotoLayoutSuitability } from "../lib/smart-layout/suitability.ts";

const analysis = {
  width: 1200,
  height: 1600,
  orientation: "portrait",
  focalPoint: { x: 0.5, y: 0.4 },
  pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }],
  analysisConfidence: { petDetection: 0.95 },
};

function photo(photoId, layoutSuitability) {
  return {
    photoId,
    petId: "pet-1",
    imageUrl: "https://example.test/original.jpg",
    previewUrl: "https://example.test/preview.jpg",
    analysis: { ...analysis, layoutSuitability },
  };
}

const leadSuitability = {
  version: 1,
  sourceOrientation: "portrait",
  sourceAspectRatio: 0.75,
  portraitScore: 88,
  landscapeScore: 42,
  squareScore: 72,
  heroScore: 8,
  fullBleedScore: 64,
  portraitCropSafe: true,
  landscapeCropSafe: false,
  squareCropSafe: true,
  sourceSubjectClipped: false,
  subjectSafeArea: { x: 0.28, y: 0.18, width: 0.44, height: 0.62 },
  subjectAnchor: "center",
  analyzedAt: "2026-10-13T00:00:00.000Z",
};
const heroSuitability = {
  ...leadSuitability,
  portraitScore: 88,
  heroScore: 100,
  landscapeCropSafe: true,
};

test("photo-frame compatibility is normalized, explainable, and safety remains separate", () => {
  const layout = DRAFT_HIERARCHY_LAYOUTS.find((candidate) => candidate.id === "L12");
  const result = scorePhotoFrameCompatibility(heroSuitability, {
    layoutId: layout.id,
    frameId: layout.frames[0].id,
    orientation: "portrait",
    aspectRatio: 0.7,
    role: "hero",
    placement: "center",
    pageSide: "left",
    gutterRisk: "low",
    fullBleed: false,
    allowContain: true,
    recoveryOnly: false,
    userSelectable: true,
  });
  assert.ok(result.score >= 0 && result.score <= 1);
  assert.ok(result.cropSafetyPreference > 0.9);
  assert.equal(scorePhotoFrameCompatibility(null, { orientation: "portrait" }), null);

  const unsafe = photo("unsafe", { ...heroSuitability, sourceSubjectClipped: true });
  const safeTier = evaluateLayout(layout, [photo("safe-a", leadSuitability), photo("safe-b", heroSuitability)]).tier;
  const unsafeTier = evaluateLayout(layout, [unsafe, photo("safe-b", heroSuitability)]).tier;
  assert.equal(unsafeTier, safeTier);
  assert.ok(["strict", "fallback"].includes(safeTier));
});

test("legacy photos without suitability retain old scoring while suitability optimizes hero-frame permutation", () => {
  const layout = DRAFT_HIERARCHY_LAYOUTS.find((candidate) => candidate.id === "L12");
  const legacy = evaluateLayout(layout, [photo("photo-a", undefined), photo("photo-b", undefined)]);
  const matched = evaluateLayout(layout, [photo("photo-a", leadSuitability), photo("photo-b", heroSuitability)]);
  const heroFrameId = layout.frames.find((frame) => frame.slotRole === "hero").id;
  const legacyHero = legacy.assignments.find((assignment) => assignment.frameId === heroFrameId);
  const matchedHero = matched.assignments.find((assignment) => assignment.frameId === heroFrameId);
  assert.equal(legacy.scores.suitabilityFit, 0);
  assert.equal(legacy.photoFrameCompatibility.matchedPairCount, 0);
  assert.equal(legacyHero.photoId, "photo-a");
  assert.ok(matched.scores.suitabilityFit > 0);
  assert.equal(matched.photoFrameCompatibility.comparedPairCount, 4);
  assert.equal(matched.photoFrameCompatibility.matchedPairCount, 4);
  assert.equal(matched.photoFrameCompatibility.suitabilityPhotoCount, 2);
  assert.ok(matched.photoFrameCompatibility.averageScore > 0 && matched.photoFrameCompatibility.averageScore <= 1);
  assert.equal(matchedHero.photoId, "photo-b");
  assert.equal(matched.tier, legacy.tier);
});

test("same 24P selected photos compare legacy ranking with suitability ranking and emit recovery metrics", () => {
  const input = Array.from({ length: 38 }, (_, index) => ({
    photoId: `ab-photo-${index}`,
    petId: `pet-${index % 2}`,
    groupId: `ab-group-${index}`,
    timeline: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
    confidence: 90,
    scene: index % 2 ? "home" : "outdoors",
    activity: "playing",
    candidate: { photoId: `ab-photo-${index}`, rank: 1, role: "primary", scores: { overall: 95 - index % 20, technical: 90, photoIntelligence: 90, expression: 90, petVisibility: 90, composition: 90, memoryValue: 80, relativeUniqueness: 80, sharpness: 90, duplicationPenalty: 0, sceneRepresentativeness: 90 } },
  }));
  const plan = planEditorialAlbum(input, 24);
  const legacyPhotos = plan.selected.map((photo, index) => ({
    photoId: photo.photoId,
    petId: photo.petId,
    imageUrl: "https://example.test/original.jpg",
    previewUrl: "https://example.test/preview.jpg",
    bestShot: { candidate: photo.candidate, confidence: photo.confidence },
    analysis: { width: 1200, height: 1600, orientation: "portrait", focalPoint: { x: 0.5, y: 0.4 }, pets: [{ bbox: { x: 0.3 + (index % 3) * 0.05, y: 0.25, width: 0.35, height: 0.45 }, face: { x: 0.37 + (index % 3) * 0.05, y: 0.27, width: 0.16, height: 0.16 }, confidence: 0.95 }], analysisConfidence: { petDetection: 0.95 } },
  }));
  const matchedPhotos = legacyPhotos.map((photo) => ({
    ...photo,
    analysis: { ...photo.analysis, layoutSuitability: analyzePhotoLayoutSuitability(photo.analysis, "2026-10-13T00:00:00.000Z") },
  }));
  const textByStory = Object.fromEntries(plan.spreads.map((story) => [story.id, "2026年8月の思い出"]));
  const legacy = buildEditorialDraft(plan.spreads, legacyPhotos, textByStory, undefined, {}, {}, 12, plan.selected.length);
  const matched = buildEditorialDraft(plan.spreads, matchedPhotos, textByStory, undefined, {}, {}, 12, plan.selected.length);
  const recoverySummary = (result) => ({
    spreadCount: result.spreads.length,
    initialUnsafeSpreadCount: result.recovery.initialUnsafeSpreadCount,
    templateFallbackAttemptCount: result.recovery.templateFallbackAttemptCount,
    safeFallbackAttemptCount: result.recovery.safeFallbackAttemptCount,
    photoReassignmentAttemptCount: result.recovery.photoReassignmentAttemptCount,
    bestShotReplacementAttemptCount: result.recovery.bestShotReplacementAttemptCount,
    densityFallbackAttemptCount: result.recovery.densityFallbackAttemptCount,
    adjacentReflowAttemptCount: result.recovery.adjacentReflowAttemptCount,
    photoDropAttemptCount: result.recovery.photoDropAttemptCount,
    adjacentRedistributionAttemptCount: result.recovery.adjacentRedistributionAttemptCount,
    globalReplacementAttemptCount: result.recovery.globalReplacementAttemptCount,
    finalSparseLayoutAttemptCount: result.recovery.finalSparseLayoutAttemptCount,
    noCropLayoutAttemptCount: result.recovery.noCropLayoutAttemptCount,
    unrecoveredCount: result.recovery.unrecoveredCount,
    failureReasonCounts: result.recovery.failureReasonCounts,
  });
  const baseline = recoverySummary(legacy);
  const matching = { ...recoverySummary(matched), photoFrameMatching: matched.recovery.photoFrameMatching };
  baseline.photoFrameMatching = legacy.recovery.photoFrameMatching;
  const changedAssignmentCount = baseline.spreadCount - legacy.spreads.filter((spread, index) => spread.assignments.map((assignment) => assignment.photoId).join("|") === matched.spreads[index].assignments.map((assignment) => assignment.photoId).join("|")).length;
  console.info("photoFrameMatchingComparison", { baseline, matching, changedAssignmentCount });
  assert.equal(baseline.spreadCount, 12);
  assert.equal(matching.spreadCount, baseline.spreadCount);
  assert.equal(matching.photoFrameMatching.initialUnsafeBeforeMatching, baseline.initialUnsafeSpreadCount);
  assert.equal(matching.photoFrameMatching.initialUnsafeAfterMatching, matching.initialUnsafeSpreadCount);
  assert.ok(matching.photoFrameMatching.spreadEvaluatedCount === 12);
  assert.ok(matching.photoFrameMatching.frameEvaluatedCount > 0);
  assert.ok(matching.photoFrameMatching.assignmentCandidateCount > 0);
  assert.ok(matching.photoFrameMatching.suitabilityPhotoCount > 0);
  assert.ok(matching.photoFrameMatching.optimizedAssignmentCount > 0);
  assert.equal(matching.photoFrameMatching.legacyFallbackCount, 0);
  assert.ok(baseline.spreadCount === matching.spreadCount);
  assert.ok(legacy.recovery.photoFrameMatching.legacyFallbackCount > 0);
  assert.ok(matching.unrecoveredCount <= baseline.unrecoveredCount);
  assert.ok(!matched.audit.issues.some((issue) => issue.blocking));
  assert.deepEqual(legacy.selectedPhotoIds, matched.selectedPhotoIds);
});
