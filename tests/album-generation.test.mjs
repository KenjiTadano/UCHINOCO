import assert from "node:assert/strict";
import { test } from "node:test";
import { assessAlbumGeneration } from "../lib/album-generation/gate.ts";
import { ALBUM_GENERATION_VERSION } from "../lib/album-generation/config.ts";

const period = {
  type: "monthly",
  start: "2023-06-30T15:00:00.000Z",
  end: "2023-07-31T14:59:59.999Z",
};

function safety(score = 90) {
  return {
    faceSafety: score,
    headSafety: score,
    earSafety: score,
    bodySafety: score,
    subjectScale: score,
    maskSafety: score,
  };
}

function draft(partial) {
  const photos = partial.photos;
  return {
    spreadId: partial.id,
    storySpreadId: partial.storyId ?? partial.id,
    layoutId: partial.layoutId,
    layoutScore: partial.score ?? 90,
    engineScore: partial.score ?? 90,
    assignments: photos.map((photo, index) => ({
      frameId: `${partial.layoutId}-${index}`,
      role: photo.role,
      photoId: photo.id,
      frameMatchScore: 90,
      crop: { x: 0.5, y: 0.4, scale: 1.05 },
      cropQuality: photo.crop ?? 90,
      safety: safety(photo.safety ?? 90),
      matchTier: photo.tier ?? "STRICT",
      warnings: photo.warnings ?? [],
      placement: {
        side: photo.side,
        rect: { x: 0, y: 0, w: photo.w ?? 300, h: photo.h ?? 500 },
        norm: { x: 0, y: 0, w: 0.3, h: 0.4 },
        gutterClearance: 22,
        crossesGutter: false,
      },
      cropFrame: { id: "frame", mask: "rect" },
      previewUrl: photo.preview ?? `https://example.com/${photo.id}.jpg`,
    })),
    quality: { cropSafety: 90, hierarchy: 90, balance: 80, storyFit: 80, overall: partial.quality ?? 90 },
    alternatives: partial.alternatives ?? [],
    status: partial.status ?? "ready",
    warnings: partial.warnings ?? [],
    analysisVersion: "album-draft-v1",
    print: {
      canvas: { width: 1076, height: 1264 },
      bleed: 18,
      gutter: { x: 529, width: 19 },
      safeArea: { left: { x: 0, y: 0, w: 1, h: 1 }, right: { x: 0, y: 0, w: 1, h: 1 } },
    },
    story: {
      storyType: partial.storyType ?? "single",
      recommendedDensity: partial.density ?? "light",
      importance: partial.importance ?? 80,
      coherenceScore: partial.coherence ?? 90,
      primaryPhotoIds: photos.filter((photo) => photo.story !== "secondary").map((photo) => photo.id),
      secondaryPhotoIds: photos.filter((photo) => photo.story === "secondary").map((photo) => photo.id),
      startedAt: partial.startedAt ?? "2023-07-01T08:15:00.000Z",
    },
  };
}

function julyInput(overrides = {}) {
  const library = ["look", "toy", "walk", "crouch", "meal", "out"];
  return {
    petId: "pet",
    period,
    libraryPhotoIds: [...library, "april"],
    periodPhotoIds: library,
    groups: [
      { groupId: "g1", photoIds: ["look"], warnings: [], startedAt: "2023-07-01T08:15:00.000Z" },
      { groupId: "g2", photoIds: ["toy"], warnings: [], startedAt: "2023-07-01T08:15:00.000Z" },
      { groupId: "g3", photoIds: ["walk", "crouch"], warnings: ["AMBIGUOUS_GROUP"], startedAt: "2023-07-01T23:01:00.000Z" },
      { groupId: "g4", photoIds: ["meal"], warnings: [], startedAt: "2023-07-02T03:13:00.000Z" },
      { groupId: "g5", photoIds: ["out"], warnings: [], startedAt: "2023-07-01T23:00:00.000Z" },
    ],
    bestShots: [
      { groupId: "g1", primaryPhotoId: "look", confidence: 1, warnings: [] },
      { groupId: "g2", primaryPhotoId: "toy", confidence: 1, warnings: [] },
      { groupId: "g3", primaryPhotoId: "walk", secondaryPhotoId: "crouch", confidence: 0.8, warnings: [] },
      { groupId: "g4", primaryPhotoId: "meal", confidence: 1, warnings: [] },
    ],
    candidates: [
      { groupId: "g1", primaryPhotoId: "look", startedAt: "2023-07-01T08:15:00.000Z", sceneScore: 86, selectionConfidence: 1, warnings: [] },
      { groupId: "g2", primaryPhotoId: "toy", startedAt: "2023-07-01T08:15:00.000Z", sceneScore: 82, selectionConfidence: 1, warnings: [] },
      {
        groupId: "g3",
        primaryPhotoId: "walk",
        secondaryPhotoId: "crouch",
        startedAt: "2023-07-01T23:01:00.000Z",
        sceneScore: 80,
        selectionConfidence: 0.8,
        activity: "playing",
        warnings: [],
      },
      { groupId: "g4", primaryPhotoId: "meal", startedAt: "2023-07-02T03:13:00.000Z", sceneScore: 83, selectionConfidence: 1, activity: "eating", warnings: [] },
    ],
    chronology: 100,
    storySpreads: [
      {
        id: "s1",
        photoIds: ["look", "toy"],
        primaryPhotoIds: ["look", "toy"],
        secondaryPhotoIds: [],
        storyType: "same_day",
        recommendedDensity: "light",
        coherenceScore: 77,
        importance: 75,
        startedAt: "2023-07-01T08:15:00.000Z",
      },
      {
        id: "s2",
        photoIds: ["walk", "crouch"],
        primaryPhotoIds: ["walk"],
        secondaryPhotoIds: ["crouch"],
        storyType: "single",
        recommendedDensity: "light",
        coherenceScore: 100,
        importance: 74,
        startedAt: "2023-07-01T23:01:00.000Z",
        activity: "playing",
      },
      {
        id: "s3",
        photoIds: ["meal"],
        primaryPhotoIds: ["meal"],
        secondaryPhotoIds: [],
        storyType: "single",
        recommendedDensity: "light",
        coherenceScore: 100,
        importance: 72,
        startedAt: "2023-07-02T03:13:00.000Z",
        activity: "eating",
      },
    ],
    drafts: [
      draft({
        id: "d1",
        storyId: "s1",
        layoutId: "L02",
        storyType: "same_day",
        photos: [
          { id: "look", role: "primary", side: "left" },
          { id: "toy", role: "primary", side: "right" },
        ],
      }),
      draft({
        id: "d2",
        storyId: "s2",
        layoutId: "L12",
        photos: [
          { id: "walk", role: "hero", side: "left", w: 360, h: 640 },
          { id: "crouch", role: "secondary", side: "right", story: "secondary", w: 180, h: 220 },
        ],
      }),
      draft({
        id: "d3",
        storyId: "s3",
        layoutId: "L01",
        importance: 72,
        photos: [{ id: "meal", role: "hero", side: "left" }],
      }),
    ],
    ...overrides,
  };
}

test("July-shaped album keeps photos, roles, and the blank page warning", () => {
  const result = assessAlbumGeneration(julyInput());
  assert.equal(result.analysisVersion, ALBUM_GENERATION_VERSION);
  assert.equal(result.quality.blockingIssues.length, 0);
  assert.ok(result.quality.nonBlockingIssues.includes("EMPTY_OPPOSITE_PAGE"));
  assert.ok(result.quality.nonBlockingIssues.includes("SUGGEST_LARGER_SINGLE"));
  assert.ok(result.quality.nonBlockingIssues.includes("GROUP_AMBIGUOUS"));
  assert.equal(result.counts.library, 7);
  assert.equal(result.counts.period, 6);
  assert.equal(result.counts.selectedScenes, 4);
  assert.equal(result.counts.selectedPhotos, 5);
  assert.equal(result.counts.storySpreads, 3);
  assert.equal(result.counts.draftPhotos, 5);
  assert.equal(result.album.spreads.map((spread) => spread.layoutId).join(","), "L02,L12,L01");
  assert.ok(!result.album.spreads.some((spread) => spread.assignments.some((item) => item.photoId === "april")));
  const play = result.primaryChains.find((chain) => chain.groupId === "g3");
  assert.equal(play.bestShotPhotoId, "walk");
  assert.equal(play.candidatePhotoId, "walk");
  assert.equal(play.draftPhotoId, "walk");
  assert.equal(play.draftRole, "hero");
  assert.equal(result.quality.grade, "GOOD");
});

test("the same audit input returns the same assignment signature", () => {
  const input = julyInput();
  const a = assessAlbumGeneration(input);
  const b = assessAlbumGeneration(input);
  const sign = (result) =>
    result.album.spreads.map((spread) => `${spread.layoutId}:${spread.assignments.map((item) => item.photoId).join("+")}`).join("|");
  assert.equal(sign(a), sign(b));
});

test("A: vision failure without a fallback blocks the album", () => {
  const result = assessAlbumGeneration(julyInput({ intelligence: { failed: true, usedFallback: false } }));
  assert.ok(result.quality.blockingIssues.includes("VISION_FAILED"));
  assert.equal(result.quality.grade, "BLOCKED");
  assert.equal(result.stages.photoIntelligence.status, "failed");
});

test("A2: vision failure with a fallback continues", () => {
  const result = assessAlbumGeneration(julyInput({ intelligence: { failed: true, usedFallback: true } }));
  assert.ok(result.quality.nonBlockingIssues.includes("VISION_FALLBACK"));
  assert.equal(result.quality.blockingIssues.includes("VISION_FAILED"), false);
});

test("B: a low quality photo is a warning", () => {
  const result = assessAlbumGeneration(julyInput({ intelligence: { failed: false, usedFallback: false, lowQualityPhotoIds: ["meal"] } }));
  assert.ok(result.quality.nonBlockingIssues.includes("LOW_QUALITY_PHOTO"));
  assert.equal(result.quality.grade === "BLOCKED", false);
});

test("C: ambiguous grouping is non-blocking", () => {
  const result = assessAlbumGeneration(julyInput());
  assert.equal(result.stages.grouping.warnings.includes("GROUP_AMBIGUOUS"), true);
});

test("D: fallback layouts stay reviewable", () => {
  const input = julyInput();
  input.drafts = input.drafts.map((item) => ({
    ...item,
    status: "needs_adjustment",
    assignments: item.assignments.map((assignment) => ({ ...assignment, matchTier: "FALLBACK" })),
  }));
  const result = assessAlbumGeneration(input);
  assert.ok(result.quality.nonBlockingIssues.includes("FALLBACK_CROP"));
  assert.equal(result.quality.blockingIssues.includes("UNUSABLE_FRAME"), false);
});

test("E: an unusable layout blocks the draft", () => {
  const input = julyInput();
  input.drafts[2] = { ...input.drafts[2], status: "unusable", layoutId: "" };
  const result = assessAlbumGeneration(input);
  assert.ok(result.quality.blockingIssues.includes("UNUSABLE_FRAME"));
  assert.equal(result.quality.grade, "BLOCKED");
});

test("F: a broken thumbnail blocks that photo", () => {
  const result = assessAlbumGeneration(julyInput({ brokenPhotoIds: ["meal"] }));
  assert.ok(result.quality.blockingIssues.includes("BROKEN_IMAGE"));
});

test("G: a photo outside the period cannot re-enter", () => {
  const input = julyInput();
  input.drafts[2].assignments[0].photoId = "april";
  const result = assessAlbumGeneration(input);
  assert.ok(result.quality.blockingIssues.includes("PERIOD_MISMATCH"));
});

test("H: the same photo in two spreads is a duplicate", () => {
  const input = julyInput();
  input.drafts[2].assignments[0].photoId = "look";
  const result = assessAlbumGeneration(input);
  assert.ok(result.quality.blockingIssues.includes("DUPLICATE_PHOTO_ASSIGNMENT"));
});

test("I: an empty library is blocked", () => {
  const result = assessAlbumGeneration(
    julyInput({
      libraryPhotoIds: [],
      periodPhotoIds: [],
      groups: [],
      bestShots: [],
      candidates: [],
      storySpreads: [],
      drafts: [],
    }),
  );
  assert.ok(result.quality.blockingIssues.includes("NO_PHOTOS"));
  assert.equal(result.quality.grade, "BLOCKED");
});

test("four identical layouts warn without blocking a small safe album", () => {
  const input = julyInput();
  input.storySpreads = Array.from({ length: 4 }, (_, index) => ({
    ...input.storySpreads[0],
    id: `s${index}`,
    photoIds: [`p${index}`],
    primaryPhotoIds: [`p${index}`],
    recommendedDensity: "light",
  }));
  input.candidates = input.storySpreads.map((spread, index) => ({
    groupId: `g${index}`,
    primaryPhotoId: `p${index}`,
    startedAt: "2023-07-01T08:15:00.000Z",
    sceneScore: 80,
    selectionConfidence: 1,
    warnings: [],
  }));
  input.bestShots = input.candidates.map((scene) => ({
    groupId: scene.groupId,
    primaryPhotoId: scene.primaryPhotoId,
    confidence: 1,
    warnings: [],
  }));
  input.periodPhotoIds = input.candidates.map((scene) => scene.primaryPhotoId);
  input.libraryPhotoIds = input.periodPhotoIds;
  input.drafts = input.storySpreads.map((spread) =>
    draft({
      id: spread.id,
      storyId: spread.id,
      layoutId: "L01",
      photos: [{ id: spread.photoIds[0], role: "hero", side: "left" }],
    }),
  );
  const result = assessAlbumGeneration(input);
  assert.ok(result.quality.nonBlockingIssues.includes("REPETITIVE_LAYOUT"));
  assert.equal(result.quality.blockingIssues.includes("UNUSABLE_FRAME"), false);
});
