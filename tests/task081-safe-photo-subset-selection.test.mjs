import assert from "node:assert/strict";
import test from "node:test";
import { planEditorialAlbum, buildEditorialDraft } from "../lib/album-draft/editorial.ts";
import {
  planEditorialAlbumWithSubset,
  identifyUnsafeSpreadRemovals,
  scorePhotoQualityAndSuitability,
} from "../lib/album-draft/selection.ts";

function candidate(id, rank, score, technical = 90) {
  return {
    photoId: id,
    rank,
    role: "primary",
    scores: {
      overall: score,
      technical,
      photoIntelligence: 80,
      expression: 80,
      petVisibility: 80,
      composition: 80,
      memoryValue: 80,
      relativeUniqueness: 80,
      sharpness: 80,
      duplicationPenalty: 0,
      sceneRepresentativeness: 80,
    },
  };
}

function photo(id, index, score, petId = "pet-0") {
  return {
    photoId: id,
    petId,
    groupId: `scene-${Math.floor(index / 2)}`,
    timeline: new Date(Date.UTC(2026, 7, index + 1, 10, 0, 0)).toISOString(),
    candidate: candidate(id, 1, score),
    confidence: 90,
    scene: "living_room",
    activity: "resting",
  };
}

function layoutPhoto(p, analysisOverride) {
  return {
    photoId: p.photoId,
    petId: p.petId,
    timeline: p.timeline,
    groupId: p.groupId,
    scene: p.scene,
    activity: p.activity,
    imageUrl: "https://example.com/orig",
    previewUrl: "https://example.com/prev",
    bestShot: { candidate: p.candidate, confidence: 90 },
    analysis: {
      width: 1200,
      height: 1600,
      orientation: "portrait",
      focalPoint: { x: 0.5, y: 0.4 },
      pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }],
      analysisConfidence: { petDetection: 0.95 },
      ...analysisOverride,
    },
  };
}

test("scorePhotoQualityAndSuitability penalizes source clipping and unsafe layoutSuitability", () => {
  const p = photo("p-1", 1, 90);
  const safeAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [{ bbox: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, confidence: 0.9 }],
    analysisConfidence: { petDetection: 0.9 },
  };
  const clippedAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [{ bbox: { x: 0.001, y: 0.001, width: 0.5, height: 0.5 }, confidence: 0.9 }],
    analysisConfidence: { petDetection: 0.9 },
  };

  const mapSafe = new Map([["p-1", safeAnalysis]]);
  const mapClipped = new Map([["p-1", clippedAnalysis]]);

  const scoreSafe = scorePhotoQualityAndSuitability(p, mapSafe);
  const scoreClipped = scorePhotoQualityAndSuitability(p, mapClipped);

  assert.ok(scoreSafe > scoreClipped, "Safe photo must score higher than clipped photo");
  assert.equal(scoreSafe - scoreClipped, 35, "Clipped photo receives a 35-point penalty");
});

test("identifyUnsafeSpreadRemovals identifies lowest suitability photo in a multi-photo spread", () => {
  const p1 = photo("p-good", 1, 95);
  const p2 = photo("p-bad", 2, 70);
  const story = {
    id: "story-1",
    sceneIds: ["s1"],
    photoIds: [p1.photoId, p2.photoId],
    primaryPhotoIds: [p1.photoId],
    secondaryPhotoIds: [p2.photoId],
    startedAt: p1.timeline,
    endedAt: p2.timeline,
    storyType: "sequence",
    coherenceScore: 90,
    importance: 90,
    recommendedDensity: "medium",
    warnings: [],
    analysisVersion: "1.0",
  };

  const photoMap = new Map([[p1.photoId, p1], [p2.photoId, p2]]);
  const removable = identifyUnsafeSpreadRemovals(story, photoMap);
  assert.equal(removable.length, 2);
  assert.equal(removable[0].photoId, "p-bad", "Lowest score photo must be first removal candidate");
});

test("Case A: 24th photo introduces unsafe spread -> Safe subset selection excludes it -> unrecoveredCount = 0", () => {
  // Construct 23 safe photos for 24P (12 spreads)
  const safePhotos = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 10)));
  const plan23 = planEditorialAlbum(safePhotos, 24);
  assert.equal(plan23.spreads.length, 12);

  // Layout photos for 23 photos are all safe
  const layoutPhotos23 = safePhotos.map((p) => layoutPhoto(p));
  const textByStory23 = Object.fromEntries(plan23.spreads.map((s) => [s.id, "Caption"]));
  const draft23 = buildEditorialDraft(plan23.spreads, layoutPhotos23, textByStory23, undefined, {}, {}, 12, safePhotos.length);
  assert.equal(draft23.recovery.unrecoveredCount, 0, "23 photos must yield unrecoveredCount = 0");

  // 24th photo is added, but it has severe source clipping and causes an unsafe spread when included
  const badPhoto24 = photo("p-23-bad", 23, 75);
  const pool24 = [...safePhotos, badPhoto24];

  // If excludedPhotoIds has badPhoto24, subset planning reproduces a safe 23-photo subset
  const subsetPlan = planEditorialAlbumWithSubset(pool24, 24, new Set(["p-23-bad"]));
  assert.equal(subsetPlan.selected.length, 23);
  assert.ok(!subsetPlan.selected.some((p) => p.photoId === "p-23-bad"));

  const subsetLayouts = subsetPlan.selected.map((p) => layoutPhoto(p));
  const subsetTexts = Object.fromEntries(subsetPlan.spreads.map((s) => [s.id, "Caption"]));
  const subsetDraft = buildEditorialDraft(subsetPlan.spreads, subsetLayouts, subsetTexts, undefined, {}, {}, 12, subsetPlan.selected.length);
  assert.equal(subsetDraft.recovery.unrecoveredCount, 0, "Subset excluding bad photo must yield unrecoveredCount = 0");
});

test("Case B: 24th photo is beneficial/high-quality -> 24th photo is kept while a lower-quality photo is unused -> unrecoveredCount = 0", () => {
  const photos23 = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, i === 5 ? 30 : 80 + (i % 10)));
  const heroPhoto24 = photo("p-24-hero", 24, 99); // superior hero photo

  const pool24 = [...photos23, heroPhoto24];

  // Excluding the lowest quality photo ("p-5" score 30) instead of the new photo
  const lowQualityPhoto = pool24.find((p) => p.photoId === "p-5");
  assert.equal(lowQualityPhoto.candidate.scores.overall, 30);

  const subsetPlan = planEditorialAlbumWithSubset(pool24, 24, new Set([lowQualityPhoto.photoId]));
  assert.ok(subsetPlan.selected.some((p) => p.photoId === "p-24-hero"), "High quality 24th photo must be included in subset");
  assert.ok(!subsetPlan.selected.some((p) => p.photoId === "p-5"), "Low quality photo must be excluded into unused pool");

  const subsetLayouts = subsetPlan.selected.map((p) => layoutPhoto(p));
  const subsetTexts = Object.fromEntries(subsetPlan.spreads.map((s) => [s.id, "Caption"]));
  const subsetDraft = buildEditorialDraft(subsetPlan.spreads, subsetLayouts, subsetTexts, undefined, {}, {}, 12, subsetPlan.selected.length);
  assert.equal(subsetDraft.recovery.unrecoveredCount, 0, "Beneficial 24th photo selection must yield unrecoveredCount = 0");
});

test("planEditorialAlbumWithSubset is deterministic with identical inputs", () => {
  const pool = Array.from({ length: 28 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 15)));
  const excluded = new Set(["p-2", "p-7"]);

  const res1 = planEditorialAlbumWithSubset(pool, 24, excluded);
  const res2 = planEditorialAlbumWithSubset(pool, 24, excluded);

  assert.deepEqual(res1.selected.map((p) => p.photoId), res2.selected.map((p) => p.photoId));
  assert.deepEqual(res1.spreads.map((s) => s.photoIds), res2.spreads.map((s) => s.photoIds));
});
