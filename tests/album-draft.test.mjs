import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAlbumDraft, buildSpreadDraft, integratedScore, rankSpreadLayouts } from "../lib/album-draft/draft.ts";
import { albumDraftCacheKey } from "../lib/album-draft/cache.ts";
import { ALBUM_DRAFT_VERSION } from "../lib/album-draft/config.ts";
import { evaluateLayout } from "../lib/smart-layout/assign.ts";
import { ALBUM_LAYOUTS } from "../lib/smart-layout/layouts.ts";
import { layoutFamily, rhythmAdjustment } from "../lib/album-draft/rhythm.ts";
import { buildAlbumCompositionPlan, parseAlbumCompositionPlan } from "../lib/album-draft/composition.ts";

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
  assert.notEqual(draft.status, "unusable", `${draft.layoutId}: ${draft.warnings.join(",")}`);
  assert.ok(["L01", "L01b"].includes(draft.layoutId));
  assert.equal(draft.assignments[0].placement.crossesGutter, false);
  assert.ok(draft.quality.cropSafety >= 50);
  assert.ok(draft.alternatives.length >= 1);
  assert.equal(draft.selectedLayout?.layoutId, draft.layoutId);
  assert.equal(draft.selectedLayout?.score, draft.layoutScore);
  assert.equal(draft.selectedLayout?.matchTier, "STRICT");
  assert.equal(typeof draft.selectedLayout?.composition, "string");
  assert.equal(typeof draft.selectedLayout?.finalScore, "number");
  for (const key of ["orientationFit", "heroFit", "captionFit", "storyFit"]) {
    assert.equal(typeof draft.alternatives[0][key], "number");
  }
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
  assert.equal(
    draft.assignments.some((assignment) => assignment.placement.crossesGutter),
    false,
  );
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
  assert.equal(
    draft.assignments.every((assignment) => assignment.placement.crossesGutter),
    false,
  );
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
  const draft = buildSpreadDraft(spread({ id: "j", photoIds: ["portrait"], primaryPhotoIds: ["portrait"], storyType: "single" }), [portrait]);
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

test("five-photo draft uses a valid layout and exposes rhythm without context", () => {
  const ids = ["landscape", "landscape-b", "portrait", "portrait-b", "square"];
  const draft = buildSpreadDraft(spread({ id: "five-no-context", photoIds: ids, primaryPhotoIds: ids, storyType: "everyday", recommendedDensity: "dense" }), [landscape, landscapeB, portrait, portraitB, squareFace]);
  assert.ok(["L13", "L14"].includes(draft.layoutId));
  assert.equal(draft.assignments.length, 5);
  assert.notEqual(draft.status, "unusable");
  assert.ok(draft.rhythm);
  assert.equal(draft.rhythm.repeatStreak, 0);
  assert.equal(draft.rhythm.recentFamilies.length, 0);
});

test("six-photo unsupported spread returns a diagnostic without throwing", () => {
  const ids = ["landscape", "landscape-b", "portrait", "portrait-b", "square", "sixth"];
  const photos = [landscape, landscapeB, portrait, portraitB, squareFace, photo("sixth", squareFace.analysis)];
  const draft = buildSpreadDraft(spread({ id: "six-unsupported", photoIds: ids, primaryPhotoIds: ids, storyType: "everyday", recommendedDensity: "dense" }), photos);
  assert.equal(draft.layoutId, "");
  assert.ok(draft.warnings.includes("NO_LAYOUT_FOR_COUNT"));
  assert.equal(draft.status, "unusable");
});

test("5-photo families map into existing rhythm families", () => {
  const hero = evaluateLayout(
    ALBUM_LAYOUTS.find((layout) => layout.id === "L13"),
    [landscape, landscapeB, portrait, portraitB, squareFace],
  );
  const grid = evaluateLayout(
    ALBUM_LAYOUTS.find((layout) => layout.id === "L14"),
    [landscape, landscapeB, portrait, portraitB, squareFace],
  );
  assert.equal(layoutFamily(hero), "story");
  assert.equal(layoutFamily(grid), "grid");
});

test("5-photo strict candidates stay ahead of fallback candidates", () => {
  const current = spread({ id: "five-tier", photoIds: ["landscape", "landscape-b", "portrait", "portrait-b", "square"], primaryPhotoIds: ["landscape", "landscape-b", "portrait", "portrait-b", "square"], recommendedDensity: "dense" });
  const strict = evaluateLayout(
    ALBUM_LAYOUTS.find((layout) => layout.id === "L14"),
    [landscape, landscapeB, portrait, portraitB, squareFace],
  );
  const fallback = evaluateLayout(
    ALBUM_LAYOUTS.find((layout) => layout.id === "L13"),
    [landscape, landscapeB, portrait, portraitB, squareFace],
  );
  strict.tier = "strict";
  strict.scores.overall = 20;
  fallback.tier = "fallback";
  fallback.scores.overall = 99;
  const ranked = rankSpreadLayouts([fallback, strict], current);
  assert.equal(ranked[0].result.tier, "strict");
});

test("cache key includes version, spreads, and photos", () => {
  const a = albumDraftCacheKey(["s2", "s1"], ["p2", "p1"], "fp");
  const b = albumDraftCacheKey(["s1", "s2"], ["p1", "p2"], "fp");
  assert.equal(a, b);
  assert.ok(a.startsWith(`${ALBUM_DRAFT_VERSION}::`));
});

function candidates(spread) {
  return ALBUM_LAYOUTS.filter((layout) => layout.photoCount === spread.photoIds.length).map((layout) =>
    evaluateLayout(
      layout,
      spread.photoIds.map((id) => ({
        ...(id === "portrait" ? portrait : id === "portrait-b" ? portraitB : id === "square" ? squareFace : id === "landscape-b" ? landscapeB : landscape),
        photoId: id,
      })),
    ),
  );
}

function rankedFixture(layoutId, score, tier = "strict") {
  return {
    layout: ALBUM_LAYOUTS.find((layout) => layout.id === layoutId),
    layoutId,
    assignments: [],
    scores: { overall: score, balance: score, frameMatching: score, roleFit: score, variety: score, cropQuality: score, orientationAffinity: score, hierarchyFit: score, hierarchyNeed: 0 },
    tier,
    invalid: false,
    heroConfidence: 0.8,
    needsAdjustment: false,
    warnings: [],
  };
}

test("G: rhythm is soft and does not change context-free ranking", () => {
  const current = spread({ id: "rhythm-a", photoIds: ["portrait"], primaryPhotoIds: ["portrait"] });
  const ranked = rankSpreadLayouts(candidates(current), current);
  assert.equal(ranked[0].score, integratedScore(ranked[0].result, current));
});

test("C: same layout id is penalized more than same family", () => {
  const current = candidates(spread({ id: "rhythm-b", photoIds: ["portrait", "portrait-b"], primaryPhotoIds: ["portrait", "portrait-b"] }))[0];
  const sameId = rhythmAdjustment(current, "light", {
    recent: [{ layoutId: current.layoutId, family: "equal", density: "light", heroStrength: 0.3, orientation: "portrait" }],
  });
  const sameFamily = rhythmAdjustment(current, "light", {
    recent: [{ layoutId: "other", family: "equal", density: "light", heroStrength: 0.3, orientation: "portrait" }],
  });
  assert.ok(sameId.adjustment < sameFamily.adjustment);
});

test("A: a close repeated layout escapes on the fourth spread", () => {
  const current = spread({ id: "rhythm-escape", photoIds: ["portrait", "portrait-b"], primaryPhotoIds: ["portrait", "portrait-b"] });
  const closeCandidates = [rankedFixture("L05", 82), rankedFixture("L08", 80)];
  const base = rankSpreadLayouts(closeCandidates, current);
  assert.ok(base[0].score - base[1].score <= 3, `${base[0].score} vs ${base[1].score}`);
  const withRhythm = rankSpreadLayouts(closeCandidates, current, {
    recent: Array.from({ length: 3 }, () => ({ layoutId: base[0].result.layoutId, family: "equal", density: "light", heroStrength: 0.3, orientation: "portrait" })),
  });
  assert.notEqual(withRhythm[0].result.layoutId, base[0].result.layoutId);
});

test("A/E/F: hero streak, density repetition, and orientation are soft adjustments", () => {
  const current = candidates(spread({ id: "rhythm-c", photoIds: ["portrait"], primaryPhotoIds: ["portrait"] }))[0];
  const debug = rhythmAdjustment(current, "hero", {
    recent: [
      { layoutId: "a", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait" },
      { layoutId: "b", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait" },
    ],
  });
  assert.ok(debug.adjustment >= -8 && debug.adjustment <= 4);
  assert.equal(debug.recentFamilies.length, 2);
});

test("progressive repetition penalty grows only after the streak length grows", () => {
  const current = candidates(spread({ id: "rhythm-progressive", photoIds: ["portrait"], primaryPhotoIds: ["portrait"] }))[0];
  const second = rhythmAdjustment(current, "light", {
    recent: [{ layoutId: current.layoutId, family: "hero", density: "light", heroStrength: 0.8, orientation: "portrait" }],
  });
  const third = rhythmAdjustment(current, "light", {
    recent: Array.from({ length: 2 }, () => ({ layoutId: current.layoutId, family: "hero", density: "light", heroStrength: 0.8, orientation: "portrait" })),
  });
  const fourth = rhythmAdjustment(
    current,
    "light",
    {
      recent: Array.from({ length: 3 }, () => ({ layoutId: current.layoutId, family: "hero", density: "light", heroStrength: 0.8, orientation: "portrait" })),
    },
    { repeatStreak: 3, candidateGap: 2, candidateIsBest: true },
  );
  assert.ok(third.adjustment <= second.adjustment);
  assert.ok(fourth.adjustment < third.adjustment);
});

test("B: a strong hero remains in the strict competition", () => {
  const current = spread({ id: "rhythm-strong", photoIds: ["portrait"], primaryPhotoIds: ["portrait"], recommendedDensity: "hero", importance: 98 });
  const ranked = rankSpreadLayouts(candidates(current), current, {
    recent: [
      { layoutId: "a", family: "hero", density: "hero", heroStrength: 0.95, orientation: "portrait" },
      { layoutId: "b", family: "hero", density: "hero", heroStrength: 0.95, orientation: "portrait" },
    ],
  });
  assert.equal(ranked[0].result.tier, "strict");
  assert.ok(ranked[0].score >= ranked[1].score - 8);
});

test("B: a strong 4-photo layout is not overturned by repetition escape", () => {
  const current = spread({
    id: "rhythm-strong-grid",
    photoIds: ["landscape", "landscape-b", "portrait", "square"],
    primaryPhotoIds: ["landscape", "landscape-b", "portrait", "square"],
    recommendedDensity: "dense",
  });
  const strongCandidates = [rankedFixture("L07", 95), rankedFixture("L06", 86)];
  const base = rankSpreadLayouts(strongCandidates, current);
  const withRhythm = rankSpreadLayouts(strongCandidates, current, {
    recent: Array.from({ length: 3 }, () => ({ layoutId: base[0].result.layoutId, family: "grid", density: "dense", heroStrength: 0.95, orientation: "mixed" })),
  });
  assert.ok(base[0].score - base[1].score >= 8, `${base[0].score} vs ${base[1].score}`);
  assert.equal(withRhythm[0].result.layoutId, base[0].result.layoutId);
});

test("D: a different layout in the same family gets a weaker penalty", () => {
  const current = candidates(spread({ id: "rhythm-family", photoIds: ["portrait", "portrait-b"], primaryPhotoIds: ["portrait", "portrait-b"] }))[0];
  const sameId = rhythmAdjustment(current, "light", {
    recent: [{ layoutId: current.layoutId, family: "equal", density: "light", heroStrength: 0.3, orientation: "portrait" }],
  });
  const otherFamily = rhythmAdjustment(current, "light", {
    recent: [{ layoutId: "other", family: "story", density: "light", heroStrength: 0.3, orientation: "portrait" }],
  });
  assert.ok(sameId.adjustment < otherFamily.adjustment);
});

test("H: rhythm never moves fallback above strict", () => {
  const current = spread({ id: "rhythm-tier", photoIds: ["portrait"], primaryPhotoIds: ["portrait"] });
  const ranked = rankSpreadLayouts(candidates(current), current, {
    recent: [
      { layoutId: "a", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait" },
      { layoutId: "b", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait" },
      { layoutId: "c", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait" },
    ],
  });
  const firstFallback = ranked.findIndex((item) => item.result.tier === "fallback");
  const lastStrict = ranked.map((item) => item.result.tier).lastIndexOf("strict");
  if (firstFallback >= 0 && lastStrict >= 0) assert.ok(lastStrict < firstFallback);
});

test("ten-spread album fixture is deterministic and records rhythm debug", () => {
  const fiveIds = ["landscape", "landscape-b", "portrait", "portrait-b", "square"];
  const fiveIndexes = new Set([1, 7]);
  const counts = [1, 5, 2, 5, 4, 5, 3, 5, 2, 1];
  const spreads = Array.from({ length: 10 }, (_, index) =>
    spread({
      id: `fixture-${index}`,
      photoIds: counts[index] === 1 ? ["landscape"] : counts[index] === 2 ? ["portrait", "portrait-b"] : counts[index] === 3 ? ["landscape", "portrait", "square"] : counts[index] === 4 ? ["landscape", "landscape-b", "portrait", "square"] : fiveIds,
      primaryPhotoIds: counts[index] === 5 && fiveIndexes.has(index) ? [fiveIds[0]] : counts[index] === 2 ? ["portrait", "portrait-b"] : counts[index] === 1 ? ["landscape"] : counts[index] === 5 ? fiveIds : counts[index] === 3 ? ["landscape"] : ["landscape", "landscape-b", "portrait", "square"],
      secondaryPhotoIds: counts[index] === 3 ? ["portrait", "square"] : counts[index] === 5 && fiveIndexes.has(index) ? fiveIds.slice(1) : [],
      storyType: index % 2 === 0 ? "event" : "same_day",
      recommendedDensity: counts[index] === 5 ? "dense" : ["hero", "light", "medium", "dense"][index % 4],
      startedAt: `2023-07-${String(index + 1).padStart(2, "0")}T08:15:00.000Z`,
    }),
  );
  const request = {
    period: { start: "2023-07-01T00:00:00.000Z", end: "2023-08-01T00:00:00.000Z" },
    spreads,
    photos: [landscape, landscapeB, portrait, portraitB, squareFace],
  };
  const first = buildAlbumDraft(request);
  const second = buildAlbumDraft(request);
  assert.deepEqual(
    first.spreads.map((item) => item.layoutId),
    second.spreads.map((item) => item.layoutId),
  );
  assert.equal(first.spreads.length, 10);
  assert.ok(first.spreads.every((item) => item.rhythm));
  assert.ok(first.spreads.every((item) => typeof item.heroConfidence === "number"));
  assert.ok(first.spreads.every((item) => !item.warnings.includes("NO_LAYOUT_FOR_COUNT")));
  assert.ok(first.spreads.filter((item) => item.assignments.length === 5).every((item) => item.status !== "unusable"));
  assert.ok(first.spreads.some((item) => item.layoutId === "L13"));
  assert.ok(
    first.spreads.some((item) => item.layoutId === "L14"),
    JSON.stringify(first.spreads.filter((item) => item.assignments.length === 5).map((item) => ({ id: item.storySpreadId, layout: item.layoutId, family: item.rhythm?.family, status: item.status, warnings: item.warnings }))),
  );
  const families = first.spreads.map((item) => item.rhythm.family);
  let maxSameLayout = 1;
  let run = 1;
  for (let index = 1; index < first.spreads.length; index++) {
    run = first.spreads[index].layoutId === first.spreads[index - 1].layoutId ? run + 1 : 1;
    maxSameLayout = Math.max(maxSameLayout, run);
  }
  assert.ok(new Set(families).size >= 2);
  assert.ok(maxSameLayout <= 3);
  assert.ok(first.spreads.some((item) => item.rhythm.recentFamilies.length === 3));
});

test("album composition adds a restrained title, role/density sequence, quiet page, and optional closing", () => {
  const spreads = [
    { storySpreadId: "intro", story: { startedAt: "2026-07-01", storyType: "single", recommendedDensity: "light", importance: 55 }, assignments: [{}], selectedLayout: { composition: "hero" } },
    { storySpreadId: "hero", story: { startedAt: "2026-07-02", storyType: "single", recommendedDensity: "hero", importance: 95 }, assignments: [{}], selectedLayout: { composition: "hero" } },
    { storySpreadId: "quiet", story: { startedAt: "2026-07-03", storyType: "everyday", recommendedDensity: "light", importance: 30 }, assignments: [{}], selectedLayout: { composition: "quiet" } },
    { storySpreadId: "grid", story: { startedAt: "2026-07-04", storyType: "everyday", recommendedDensity: "dense", importance: 45 }, assignments: [{}, {}, {}, {}], selectedLayout: { composition: "grid" } },
  ];
  const plan = buildAlbumCompositionPlan(spreads, {
    title: "わかとの毎日",
    petName: "わか",
    period: "2026.07",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    events: [
      { kind: "birthday", date: "2023-07-02" },
      { kind: "adoption", date: "2026-08-01" },
      { kind: "birthday", date: "2026-02-31" },
    ],
  });
  assert.equal(plan.coverRole, "COVER");
  assert.deepEqual(plan.items[0], { kind: "title", role: "TITLE", title: "わかとの毎日", petName: "わか", period: "2026.07" });
  assert.deepEqual(
    plan.items.filter((item) => item.kind === "event").map((item) => item.date),
    ["2026-07-02"],
  );
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "intro").role, "INTRO");
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "hero").role, "HERO");
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "quiet").role, "QUIET");
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "grid").density, "HIGH");
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "grid").role, "GRID");
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "grid").role === "CLOSING", false);
  assert.deepEqual(parseAlbumCompositionPlan(plan), plan);
  assert.equal(parseAlbumCompositionPlan(undefined), null);
});

test("closing is optional and can describe the final spread without adding a photo-free spread", () => {
  const spreads = [
    { storySpreadId: "intro", story: { startedAt: "2026-07-01", storyType: "single", recommendedDensity: "light", importance: 70 }, assignments: [{}], selectedLayout: { composition: "story" } },
    { storySpreadId: "middle", story: { startedAt: "2026-07-02", storyType: "everyday", recommendedDensity: "medium", importance: 70 }, assignments: [{}, {}], selectedLayout: { composition: "story" } },
    { storySpreadId: "quiet", story: { startedAt: "2026-07-03", storyType: "everyday", recommendedDensity: "light", importance: 20 }, assignments: [{}], selectedLayout: { composition: "quiet" } },
    { storySpreadId: "close", story: { startedAt: "2026-07-04", storyType: "everyday", recommendedDensity: "medium", importance: 70 }, assignments: [{}, {}], selectedLayout: { composition: "story" } },
  ];
  const plan = buildAlbumCompositionPlan(spreads, { title: "日々", petName: "わか", period: "2026.07", periodStart: "2026-07-01", periodEnd: "2026-07-31" });
  assert.equal(plan.items.find((item) => item.kind === "spread" && item.storySpreadId === "close").role, "CLOSING");
  assert.equal(plan.items.filter((item) => item.kind === "spread").length, spreads.length);
});

test("hero and dense repeat penalties grow while candidates remain in their match tier", () => {
  const hero = candidates(spread({ id: "rhythm-hero-repeat", photoIds: ["portrait"], primaryPhotoIds: ["portrait"] }))[0];
  const recentHero = { layoutId: "L01", family: "hero", density: "hero", heroStrength: 0.9, orientation: "portrait", templateDensity: "light" };
  const oneHero = rhythmAdjustment(hero, "hero", { recent: [recentHero] });
  const twoHeroes = rhythmAdjustment(hero, "hero", { recent: [recentHero, { ...recentHero, layoutId: "other" }] });
  assert.ok(twoHeroes.adjustment < oneHero.adjustment);

  const grid = candidates(spread({ id: "rhythm-dense-repeat", photoIds: ["landscape", "landscape-b", "portrait", "square"], primaryPhotoIds: ["landscape", "landscape-b", "portrait", "square"], recommendedDensity: "dense" }))[0];
  const recentDense = { layoutId: "L07", family: "grid", density: "dense", heroStrength: 0.2, orientation: "mixed", templateDensity: "dense" };
  const oneDense = rhythmAdjustment(grid, "dense", { recent: [recentDense] });
  const twoDense = rhythmAdjustment(grid, "dense", { recent: [recentDense, { ...recentDense, layoutId: "other" }] });
  assert.ok(twoDense.adjustment < oneDense.adjustment);
  const ranked = rankSpreadLayouts([rankedFixture("L07", 90, "fallback"), rankedFixture("L06", 75, "strict")], spread({ id: "rhythm-tiers", photoIds: ["landscape", "landscape-b", "portrait", "square"], primaryPhotoIds: ["landscape", "landscape-b", "portrait", "square"] }), { recent: Array.from({ length: 3 }, () => recentDense) });
  assert.equal(ranked[0].result.tier, "strict");
});
