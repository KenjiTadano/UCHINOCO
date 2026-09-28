import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpreadDraft } from "../lib/album-draft/draft.ts";
import { albumDraftCacheKey } from "../lib/album-draft/cache.ts";
import { ALBUM_DRAFT_VERSION } from "../lib/album-draft/config.ts";
import { evaluateLayout } from "../lib/smart-layout/assign.ts";
import { ALBUM_LAYOUTS } from "../lib/smart-layout/layouts.ts";

function photo(id, analysis) {
  return {
    photoId: id,
    imageUrl: `https://example.com/${id}.jpg`,
    previewUrl: `https://example.com/${id}-thumb.jpg`,
    analysis,
  };
}

function spread(partial) {
  return {
    id: partial.id,
    sceneIds: partial.sceneIds ?? [partial.id],
    photoIds: partial.photoIds,
    primaryPhotoIds: partial.primaryPhotoIds,
    secondaryPhotoIds: partial.secondaryPhotoIds ?? [],
    startedAt: partial.startedAt ?? "2023-07-01T08:15:00.000Z",
    endedAt: partial.endedAt ?? partial.startedAt ?? "2023-07-01T08:15:00.000Z",
    storyType: partial.storyType ?? "single",
    theme: {},
    coherenceScore: partial.coherenceScore ?? 100,
    importance: partial.importance ?? 80,
    recommendedDensity: partial.recommendedDensity ?? "light",
    warnings: [],
    analysisVersion: "album-story-v1",
  };
}

const portrait = photo("portrait", {
  width: 900,
  height: 1400,
  orientation: "portrait",
  focalPoint: { x: 0.5, y: 0.35 },
  pets: [
    {
      bbox: { x: 0.28, y: 0.15, width: 0.44, height: 0.65 },
      face: { x: 0.34, y: 0.18, width: 0.3, height: 0.26 },
      confidence: 0.93,
    },
  ],
  analysisConfidence: { petDetection: 0.93 },
});

const landscape = photo("landscape", {
  width: 1600,
  height: 900,
  orientation: "landscape",
  focalPoint: { x: 0.45, y: 0.5 },
  pets: [
    {
      bbox: { x: 0.2, y: 0.35, width: 0.55, height: 0.45 },
      face: { x: 0.28, y: 0.38, width: 0.14, height: 0.16 },
      confidence: 0.9,
    },
  ],
  analysisConfidence: { petDetection: 0.9 },
});

const portraitB = photo("portrait-b", {
  width: 1000,
  height: 1500,
  orientation: "portrait",
  focalPoint: { x: 0.48, y: 0.4 },
  pets: [
    {
      bbox: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
      face: { x: 0.32, y: 0.22, width: 0.32, height: 0.28 },
      confidence: 0.91,
    },
  ],
});

const landscapeB = photo("landscape-b", {
  width: 1600,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.55, y: 0.48 },
  pets: [
    {
      bbox: { x: 0.3, y: 0.3, width: 0.45, height: 0.5 },
      face: { x: 0.4, y: 0.32, width: 0.18, height: 0.18 },
      confidence: 0.88,
    },
  ],
});

const squareFace = photo("square", {
  width: 1000,
  height: 1000,
  orientation: "square",
  focalPoint: { x: 0.5, y: 0.4 },
  pets: [
    {
      bbox: { x: 0.22, y: 0.18, width: 0.56, height: 0.7 },
      face: { x: 0.3, y: 0.22, width: 0.4, height: 0.38 },
      confidence: 0.95,
    },
  ],
  analysisConfidence: { petDetection: 0.95 },
});

const edgeFace = photo("edge", {
  width: 1600,
  height: 900,
  orientation: "landscape",
  focalPoint: { x: 0.08, y: 0.2 },
  pets: [
    {
      bbox: { x: 0.0, y: 0.0, width: 0.22, height: 0.28 },
      face: { x: 0.0, y: 0.0, width: 0.08, height: 0.1 },
      confidence: 0.4,
    },
  ],
  analysisConfidence: { petDetection: 0.4 },
});

function areas(draft) {
  return draft.assignments.map((assignment) => assignment.placement.rect.w * assignment.placement.rect.h);
}

test("A: one portrait becomes a large single-page hero", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "a",
      photoIds: ["portrait"],
      primaryPhotoIds: ["portrait"],
      recommendedDensity: "hero",
      importance: 94,
      storyType: "single",
    }),
    [portrait],
  );
  assert.equal(draft.assignments.length, 1);
  assert.notEqual(draft.status, "unusable");
  assert.ok(["L01", "L01b"].includes(draft.layoutId));
  assert.equal(draft.assignments[0].placement.crossesGutter, false);
  assert.ok(draft.quality.cropSafety >= 50);
  assert.ok(draft.alternatives.length >= 1);
});

test("B: one landscape stays on one page", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "b",
      photoIds: ["landscape"],
      primaryPhotoIds: ["landscape"],
      storyType: "single",
      recommendedDensity: "light",
    }),
    [landscape],
  );
  assert.notEqual(draft.status, "unusable");
  assert.equal(draft.assignments[0].placement.crossesGutter, false);
  assert.equal(draft.assignments.length, 1);
});

test("C: two equal primaries stay similar in size", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "c",
      photoIds: ["portrait", "portrait-b"],
      primaryPhotoIds: ["portrait", "portrait-b"],
      storyType: "same_day",
      recommendedDensity: "light",
    }),
    [portrait, portraitB],
  );
  assert.ok(["L02", "L03", "L10"].includes(draft.layoutId), draft.layoutId);
  const [first, second] = areas(draft);
  const ratio = Math.min(first, second) / Math.max(first, second);
  assert.ok(ratio >= 0.72, String(ratio));
  assert.equal(draft.assignments.some((assignment) => assignment.placement.crossesGutter), false);
});

test("D: secondary does not outgrow the primary", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "d",
      photoIds: ["portrait", "portrait-b"],
      primaryPhotoIds: ["portrait"],
      secondaryPhotoIds: ["portrait-b"],
      storyType: "single",
      recommendedDensity: "light",
    }),
    [portrait, portraitB],
  );
  const primary = draft.assignments.find((assignment) => assignment.photoId === "portrait");
  const secondary = draft.assignments.find((assignment) => assignment.photoId === "portrait-b");
  const primaryArea = primary.placement.rect.w * primary.placement.rect.h;
  const secondaryArea = secondary.placement.rect.w * secondary.placement.rect.h;
  assert.ok(primaryArea >= secondaryArea * 0.95);
  assert.equal(new Set(draft.assignments.map((assignment) => assignment.photoId)).size, 2);
});

test("E: three photos keep a hero and two supports", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "e",
      photoIds: ["landscape", "portrait", "square"],
      primaryPhotoIds: ["landscape"],
      secondaryPhotoIds: ["portrait", "square"],
      storyType: "event",
      recommendedDensity: "medium",
    }),
    [landscape, portrait, squareFace],
  );
  assert.equal(draft.assignments.length, 3);
  assert.notEqual(draft.status, "unusable");
  assert.equal(new Set(draft.assignments.map((assignment) => assignment.photoId)).size, 3);
});

test("F: four photos can use a grid layout candidate", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "f",
      photoIds: ["landscape", "landscape-b", "portrait", "square"],
      primaryPhotoIds: ["landscape", "landscape-b", "portrait", "square"],
      storyType: "everyday",
      recommendedDensity: "dense",
    }),
    [landscape, landscapeB, portrait, squareFace],
  );
  assert.equal(draft.assignments.length, 4);
  assert.ok(["L06", "L07"].includes(draft.layoutId), draft.layoutId);
  assert.notEqual(draft.status, "unusable");
});

test("G: portrait-heavy pair prefers portrait frames when strict", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "g",
      photoIds: ["portrait", "portrait-b"],
      primaryPhotoIds: ["portrait", "portrait-b"],
      storyType: "sequence",
    }),
    [portrait, portraitB],
  );
  assert.notEqual(draft.status, "unusable");
  if (draft.status === "ready") {
    assert.ok(draft.assignments.every((assignment) => assignment.matchTier === "STRICT"));
  }
});

test("H: landscape-heavy pair does not cross the gutter", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "h",
      photoIds: ["landscape", "landscape-b"],
      primaryPhotoIds: ["landscape", "landscape-b"],
      storyType: "sequence",
    }),
    [landscape, landscapeB],
  );
  assert.notEqual(draft.status, "unusable");
  assert.equal(draft.assignments.every((assignment) => assignment.placement.crossesGutter), false);
});

test("I: a circle-unsafe photo is not the chosen strict circle slot", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "i",
      photoIds: ["edge", "portrait", "square"],
      primaryPhotoIds: ["portrait"],
      secondaryPhotoIds: ["edge", "square"],
      storyType: "everyday",
      recommendedDensity: "medium",
    }),
    [edgeFace, portrait, squareFace],
  );
  const edge = draft.assignments.find((assignment) => assignment.photoId === "edge");
  if (edge && draft.status !== "unusable") {
    assert.notEqual(edge.cropFrame.mask, "circle");
  }
  assert.ok(draft.assignments.every((assignment) => assignment.matchTier !== "UNUSABLE"));
});

test("J: a strict layout outranks a higher-scoring fallback", () => {
  const layouts = ALBUM_LAYOUTS.filter((layout) => layout.photoCount === 1);
  const ranked = layouts.map((layout) => evaluateLayout(layout, [portrait]));
  assert.ok(ranked.some((result) => result.tier === "strict"));
  const draft = buildSpreadDraft(
    spread({ id: "j", photoIds: ["portrait"], primaryPhotoIds: ["portrait"], storyType: "single" }),
    [portrait],
  );
  assert.equal(draft.assignments[0].matchTier, "STRICT");
  assert.notEqual(draft.status, "unusable");
});

test("K: hero-unsafe edge photo can still use a non-hero page", () => {
  const draft = buildSpreadDraft(
    spread({
      id: "k",
      photoIds: ["edge"],
      primaryPhotoIds: ["edge"],
      recommendedDensity: "hero",
      importance: 96,
      storyType: "single",
    }),
    [edgeFace],
  );
  assert.equal(draft.assignments.length, 1);
  assert.equal(draft.assignments[0].placement.crossesGutter, false);
  if (draft.assignments[0].matchTier === "UNUSABLE") {
    assert.equal(draft.status, "unusable");
  }
});

test("cache key includes version, spreads, and photos", () => {
  const a = albumDraftCacheKey(["s2", "s1"], ["p2", "p1"], "fp");
  const b = albumDraftCacheKey(["s1", "s2"], ["p1", "p2"], "fp");
  assert.equal(a, b);
  assert.ok(a.startsWith(`${ALBUM_DRAFT_VERSION}::`));
});
