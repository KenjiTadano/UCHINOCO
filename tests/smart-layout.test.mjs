import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLayout } from "../lib/smart-layout/assign.ts";
import { ALBUM_LAYOUTS, layoutsForPhotoCount } from "../lib/smart-layout/layouts.ts";
import { findBestLayoutForPhotos } from "../lib/smart-layout/select.ts";

function photo(id, analysis) {
  return {
    photoId: id,
    imageUrl: `https://example.com/${id}.jpg`,
    previewUrl: `https://example.com/${id}-thumb.jpg`,
    analysis,
  };
}

function withHeroSignals(source, { overallScore = 60, composition = overallScore, technicalQuality = overallScore, petVisibility = overallScore, expression = overallScore, role = "alternate", bestShotScore = overallScore, sceneRepresentativeness = 50, confidence = 0.8 } = {}) {
  return {
    ...source,
    photoIntelligence: {
      overallScore,
      composition,
      technicalQuality,
      petVisibility,
      expression,
      memoryValue: overallScore,
      status: "ok",
    },
    bestShot: {
      candidate: {
        role,
        scores: {
          overall: bestShotScore,
          sceneRepresentativeness,
        },
      },
      confidence,
    },
  };
}

const landscapeBody = photo("A", {
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

const portraitFace = photo("B", {
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

const faceCloseup = photo("C", {
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

const multiPet = photo("D", {
  width: 1800,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.5, y: 0.42 },
  pets: [
    {
      bbox: { x: 0.08, y: 0.28, width: 0.32, height: 0.5 },
      face: { x: 0.12, y: 0.3, width: 0.16, height: 0.16 },
      confidence: 0.9,
    },
    {
      bbox: { x: 0.55, y: 0.26, width: 0.34, height: 0.52 },
      face: { x: 0.62, y: 0.28, width: 0.16, height: 0.16 },
      confidence: 0.86,
    },
  ],
  analysisConfidence: { petDetection: 0.88 },
});

const landscape2 = photo("E", {
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

const portrait2 = photo("F", {
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

test("layoutsForPhotoCount filters correctly", () => {
  assert.ok(layoutsForPhotoCount(1).every((l) => l.photoCount === 1));
  assert.ok(layoutsForPhotoCount(3).length >= 3);
  assert.ok(layoutsForPhotoCount(4).some((l) => l.id === "L07"));
  assert.deepEqual(layoutsForPhotoCount(5).map((layout) => layout.id), ["L13", "L14", "L15", "L16", "L17", "L18", "L19", "L20"]);
});

test("every five-photo layout has five unique, populated assignments", () => {
  const photos = [photo("five-a", landscapeBody.analysis), photo("five-b", landscape2.analysis), photo("five-c", portraitFace.analysis), photo("five-d", portrait2.analysis), photo("five-e", faceCloseup.analysis)];
  for (const layout of layoutsForPhotoCount(5)) {
    assert.equal(layout.frames.length, 5, layout.id);
    assert.equal(new Set(layout.frames.map((frame) => frame.id)).size, 5, layout.id);
    const result = evaluateLayout(layout, photos);
    assert.equal(result.assignments.length, 5, layout.id);
    assert.equal(new Set(result.assignments.map((item) => item.photoId)).size, 5, layout.id);
  }
});

test("A: five landscape photos produce a valid five-photo layout", () => {
  const photos = ["A5-1", "A5-2", "A5-3", "A5-4", "A5-5"].map((id) => photo(id, landscapeBody.analysis));
  const { best, ranking } = findBestLayoutForPhotos(photos);
  assert.ok(best);
  assert.notEqual(best.tier, "unusable");
  assert.equal(best.assignments.length, 5);
  assert.ok(ranking.every((result) => result.layout.photoCount === 5));
});

test("B: five portrait photos produce a valid five-photo layout", () => {
  const photos = ["B5-1", "B5-2", "B5-3", "B5-4", "B5-5"].map((id) => photo(id, portraitFace.analysis));
  const { best } = findBestLayoutForPhotos(photos);
  assert.ok(best);
  assert.notEqual(best.tier, "unusable");
  assert.equal(best.assignments.length, 5);
});

test("C: mixed orientation five-photo set produces a valid layout", () => {
  const photos = [photo("C5-1", landscapeBody.analysis), photo("C5-2", portraitFace.analysis), photo("C5-3", faceCloseup.analysis), photo("C5-4", landscape2.analysis), photo("C5-5", portrait2.analysis)];
  const { best } = findBestLayoutForPhotos(photos);
  assert.ok(best);
  assert.notEqual(best.tier, "unusable");
  assert.equal(new Set(best.assignments.map((assignment) => assignment.photoId)).size, 5);
});

test("D: a clear Hero candidate uses the Task050.2 leader in L13", () => {
  const photos = [withHeroSignals(photo("HERO5", faceCloseup.analysis), { overallScore: 98, role: "primary", bestShotScore: 98, sceneRepresentativeness: 95 }), ...["SUPPORT5-1", "SUPPORT5-2", "SUPPORT5-3", "SUPPORT5-4"].map((id) => withHeroSignals(photo(id, faceCloseup.analysis), { overallScore: 68, bestShotScore: 68 }))];
  const { ranking } = findBestLayoutForPhotos(photos);
  const hero = ranking.find((result) => result.layoutId === "L13");
  assert.ok(hero);
  assert.notEqual(hero.tier, "unusable");
  assert.equal(hero.assignments.find((assignment) => assignment.slotRole === "hero")?.photoId, "HERO5");
  assert.ok(hero.heroConfidence >= 0.9);
});

test("E: near-equal five-photo quality prefers the balanced grid", () => {
  const photos = ["EQ5-1", "EQ5-2", "EQ5-3", "EQ5-4", "EQ5-5"].map((id) => photo(id, faceCloseup.analysis));
  const { best } = findBestLayoutForPhotos(photos);
  assert.equal(best?.layoutId, "L14");
  assert.equal(best.layout.purpose, "collage");
  assert.ok(best.assignments.every((assignment) => assignment.slotRole === "primary"));
});

test("F: a weak fifth photo is not forced into the Hero slot", () => {
  const weak = photo("WEAK5", { width: 1200, height: 800, orientation: "landscape", focalPoint: { x: 0.5, y: 0.5 }, pets: [] });
  const strong = ["STRONG5-1", "STRONG5-2", "STRONG5-3", "STRONG5-4"].map((id) => photo(id, faceCloseup.analysis));
  const { best, ranking } = findBestLayoutForPhotos([...strong, weak]);
  assert.ok(best);
  const hero = ranking.find((result) => result.layoutId === "L13")?.assignments.find((assignment) => assignment.slotRole === "hero");
  if (best.layoutId === "L13") assert.notEqual(hero?.photoId, "WEAK5");
  else assert.equal(best.layoutId, "L14");
});

test("single hero photo prefers a 1-up layout", () => {
  const { best, ranking } = findBestLayoutForPhotos([portraitFace]);
  assert.ok(best);
  assert.equal(best.layout.photoCount, 1);
  assert.notEqual(best.tier, "unusable");
  assert.ok(ranking.length >= 1);
});

test("3 mixed photos produce ranking with alternatives", () => {
  const { best, alternatives, ranking } = findBestLayoutForPhotos([landscapeBody, portraitFace, faceCloseup]);
  assert.ok(best);
  assert.ok(best.assignments.length === 3);
  assert.ok(alternatives.length >= 1);
  assert.ok(ranking.every((r) => r.layout.photoCount === 3));
  // Unique photo assignment
  const ids = best.assignments.map((a) => a.photoId);
  assert.equal(new Set(ids).size, 3);
});

test("UNUSABLE layouts are never best", () => {
  const { best, ranking } = findBestLayoutForPhotos([landscapeBody, landscape2, faceCloseup]);
  if (best) assert.notEqual(best.tier, "unusable");
  for (const r of ranking) {
    if (r.tier === "unusable") {
      assert.ok(!best || best.layoutId !== r.layoutId);
    }
  }
});

test("STRICT preferred over FALLBACK when both exist", () => {
  const { best, ranking } = findBestLayoutForPhotos([portraitFace, faceCloseup, landscapeBody]);
  const hasStrict = ranking.some((r) => r.tier === "strict");
  if (hasStrict && best) {
    assert.equal(best.tier, "strict");
  }
});

test("multi-pet set can pick story/hero layouts", () => {
  const { best } = findBestLayoutForPhotos([multiPet, landscapeBody, faceCloseup]);
  assert.ok(best);
  assert.ok(["story", "collage", "detail", "sequence"].includes(best.layout.purpose));
});

test("4-photo set uses 4-count layouts only", () => {
  const { ranking, best } = findBestLayoutForPhotos([landscapeBody, landscape2, portraitFace, faceCloseup]);
  assert.ok(ranking.every((r) => r.layout.photoCount === 4));
  assert.ok(best);
  assert.equal(best.assignments.length, 4);
});

test("evaluateLayout rejects wrong photo count", () => {
  const layout = ALBUM_LAYOUTS.find((l) => l.id === "L04");
  assert.ok(layout);
  const res = evaluateLayout(layout, [landscapeBody]);
  assert.equal(res.tier, "unusable");
  assert.ok(res.warnings.includes("PHOTO_COUNT_MISMATCH"));
});

test("best layout varies across photo sets", () => {
  const sets = [[portraitFace], [landscapeBody, landscape2], [landscapeBody, portraitFace, faceCloseup], [multiPet, landscapeBody, portrait2], [portraitFace, portrait2], [faceCloseup, portraitFace, landscapeBody]];
  const bestIds = new Set(sets.map((s) => findBestLayoutForPhotos(s).best?.layoutId ?? "none"));
  assert.ok(bestIds.size >= 2, `got ${[...bestIds].join(",")}`);
});

test("catalog has 8+ layouts", () => {
  assert.ok(ALBUM_LAYOUTS.length >= 8);
});

test("050.1 landscape pair prefers horizontal over square pair", () => {
  const { ranking, best } = findBestLayoutForPhotos([landscapeBody, landscape2]);
  assert.equal(best?.layoutId, "L03");
  const l03 = ranking.find((r) => r.layoutId === "L03");
  const l10 = ranking.find((r) => r.layoutId === "L10");
  assert.ok(l03 && l10);
  assert.ok(l03.scores.orientationAffinity > l10.scores.orientationAffinity, `orient L03=${l03.scores.orientationAffinity} L10=${l10.scores.orientationAffinity}`);
  // Among usable, L03 should rank at least as well as L10 on overall when both strict/fallback same tier
  if (l03.tier === l10.tier) {
    assert.ok(l03.scores.overall >= l10.scores.overall - 2, `overall L03=${l03.scores.overall} L10=${l10.scores.overall}`);
  }
});

test("050.1 portrait pair prefers vertical over square pair", () => {
  const { ranking, best } = findBestLayoutForPhotos([portraitFace, portrait2]);
  assert.equal(best?.layoutId, "L02");
  const l02 = ranking.find((r) => r.layoutId === "L02");
  const l10 = ranking.find((r) => r.layoutId === "L10");
  assert.ok(l02 && l10);
  assert.ok(l02.scores.orientationAffinity > l10.scores.orientationAffinity, `orient L02=${l02.scores.orientationAffinity} L10=${l10.scores.orientationAffinity}`);
});

test("050.1 quality gap raises hierarchyNeed and favors hero over equal", () => {
  // Strong closeup + two weaker landscape bodies → hierarchy need
  const strong = photo("STRONG", {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.4 },
    pets: [
      {
        bbox: { x: 0.2, y: 0.15, width: 0.6, height: 0.72 },
        face: { x: 0.28, y: 0.2, width: 0.44, height: 0.4 },
        confidence: 0.97,
      },
    ],
  });
  const weakA = photo("WEAK_A", {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.5, y: 0.55 },
    pets: [
      {
        bbox: { x: 0.15, y: 0.4, width: 0.7, height: 0.45 },
        face: { x: 0.2, y: 0.42, width: 0.1, height: 0.1 },
        confidence: 0.7,
      },
    ],
  });
  const weakB = photo("WEAK_B", {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.4, y: 0.5 },
    pets: [
      {
        bbox: { x: 0.2, y: 0.38, width: 0.6, height: 0.48 },
        face: { x: 0.25, y: 0.4, width: 0.12, height: 0.12 },
        confidence: 0.72,
      },
    ],
  });
  const { ranking, best } = findBestLayoutForPhotos([strong, weakA, weakB]);
  assert.ok(best);
  assert.equal(best.layoutId, "L04");
  const l04 = ranking.find((r) => r.layoutId === "L04");
  const l05 = ranking.find((r) => r.layoutId === "L05");
  assert.ok(l04 && l05);
  assert.ok(l04.scores.hierarchyNeed >= 40, `need ${l04.scores.hierarchyNeed}`);
  assert.ok(l04.scores.hierarchyFit >= l05.scores.hierarchyFit, `hierFit L04=${l04.scores.hierarchyFit} L05=${l05.scores.hierarchyFit}`);
});

test("050.1 similar quality keeps equal layout competitive", () => {
  const a = photo("EQ1", faceCloseup.analysis);
  const b = photo("EQ2", {
    ...faceCloseup.analysis,
    focalPoint: { x: 0.48, y: 0.42 },
  });
  const c = photo("EQ3", {
    ...faceCloseup.analysis,
    focalPoint: { x: 0.52, y: 0.38 },
  });
  const { ranking, best } = findBestLayoutForPhotos([a, b, c]);
  assert.equal(best?.layoutId, "L05");
  const l05 = ranking.find((r) => r.layoutId === "L05");
  assert.ok(l05);
  assert.ok(l05.scores.hierarchyNeed <= 45, `need ${l05.scores.hierarchyNeed}`);
  assert.ok(l05.scores.hierarchyFit >= 60, `hierFit ${l05.scores.hierarchyFit}`);
});

test("050.1 weak photo avoids hero slot when dispersion high", () => {
  const strong = photo("H1", portraitFace.analysis);
  const mid = photo("H2", faceCloseup.analysis);
  const weak = photo("H3", {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.5, y: 0.6 },
    pets: [
      {
        bbox: { x: 0.1, y: 0.45, width: 0.8, height: 0.4 },
        face: { x: 0.15, y: 0.48, width: 0.08, height: 0.08 },
        confidence: 0.6,
      },
    ],
  });
  const { best } = findBestLayoutForPhotos([strong, mid, weak]);
  assert.ok(best);
  const hero = best.assignments.find((a) => a.slotRole === "hero" || a.importance >= 0.95);
  if (hero) {
    assert.notEqual(hero.photoId, "H3");
  }
});

test("050.1 scores expose orientation and hierarchy fields", () => {
  const { best } = findBestLayoutForPhotos([landscapeBody, landscape2]);
  assert.ok(best);
  assert.equal(typeof best.scores.orientationAffinity, "number");
  assert.equal(typeof best.scores.hierarchyFit, "number");
  assert.equal(typeof best.scores.hierarchyNeed, "number");
});

test("050.1 assignment integrity: frame count matches", () => {
  const { best } = findBestLayoutForPhotos([landscapeBody, portraitFace, faceCloseup]);
  assert.ok(best);
  assert.equal(best.assignments.length, best.layout.frames.length);
  assert.equal(best.invalid, false);
});

test("050.1 mixed orientation softens orientation affinity", () => {
  const { ranking } = findBestLayoutForPhotos([landscapeBody, portraitFace]);
  const l03 = ranking.find((r) => r.layoutId === "L03");
  const l02 = ranking.find((r) => r.layoutId === "L02");
  const l10 = ranking.find((r) => r.layoutId === "L10");
  assert.ok(l03 && l02 && l10);
  // Mixed: no strong all-landscape / all-portrait boost; gap stays modest
  const gap = Math.abs(l03.scores.orientationAffinity - l02.scores.orientationAffinity);
  assert.ok(gap <= 20, `mixed orient gap ${gap}`);
  assert.ok(l10.scores.orientationAffinity >= 50, `square still usable ${l10.scores.orientationAffinity}`);
});

test("050.1 photo count mismatch marks layout invalid", () => {
  const layout = ALBUM_LAYOUTS.find((l) => l.id === "L04");
  assert.ok(layout);
  const result = evaluateLayout(layout, [landscapeBody, portraitFace]);
  assert.equal(result.invalid, true);
  assert.equal(result.tier, "unusable");
  assert.ok(result.warnings.includes("PHOTO_COUNT_MISMATCH"));
});

test("050.1 hierarchyNeed is layout-independent for same photo set", () => {
  const strong = photo("S", faceCloseup.analysis);
  const weak = photo("W", {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.5, y: 0.55 },
    pets: [
      {
        bbox: { x: 0.15, y: 0.4, width: 0.7, height: 0.45 },
        face: { x: 0.2, y: 0.42, width: 0.1, height: 0.1 },
        confidence: 0.65,
      },
    ],
  });
  const mid = photo("M", landscape2.analysis);
  const { ranking } = findBestLayoutForPhotos([strong, mid, weak]);
  const needs = ranking.filter((r) => !r.invalid).map((r) => r.scores.hierarchyNeed);
  assert.ok(needs.length >= 2);
  assert.ok(
    needs.every((n) => n === needs[0]),
    `hierarchyNeed varies: ${needs.join(",")}`,
  );
});

test("050.2 PI/Best Shot primary is assigned to a STRICT hero slot", () => {
  const heroLayout = {
    id: "PI-HERO",
    name: "PI hero",
    photoCount: 3,
    purpose: "hero",
    balanceProfile: { heroWeight: 0.8, symmetry: 0.4, variety: 0.5 },
    frames: [
      { id: "hero", cropShapeId: "square", slotRole: "hero", importance: 1, rect: { x: 0, y: 0, w: 0.6, h: 1 } },
      { id: "secondary-a", cropShapeId: "square", slotRole: "secondary", importance: 0.6, rect: { x: 0.6, y: 0, w: 0.2, h: 1 } },
      { id: "secondary-b", cropShapeId: "square", slotRole: "secondary", importance: 0.6, rect: { x: 0.8, y: 0, w: 0.2, h: 1 } },
    ],
  };
  const photos = [
    withHeroSignals(photo("PI_PRIMARY", faceCloseup.analysis), {
      overallScore: 98,
      role: "primary",
      bestShotScore: 98,
      sceneRepresentativeness: 95,
    }),
    withHeroSignals(photo("PI_OTHER_A", faceCloseup.analysis)),
    withHeroSignals(photo("PI_OTHER_B", faceCloseup.analysis)),
  ];
  const result = evaluateLayout(heroLayout, photos);
  const hero = result.assignments.find((a) => a.slotRole === "hero");

  assert.equal(result.tier, "strict");
  assert.equal(hero?.photoId, "PI_PRIMARY");
  assert.ok((hero?.heroSuitability ?? 0) > 90);
  assert.equal(typeof result.heroConfidence, "number");
  assert.equal(hero?.photoIntelligence?.overallScore, 98);
  assert.equal(hero?.bestShot?.candidate.scores.overall, 98);
  assert.equal(hero?.bestShot?.confidence, 0.8);
  assert.equal(hero?.bestShot?.candidate.scores.sceneRepresentativeness, 95);
});

test("050.2 a FALLBACK PI leader cannot displace a STRICT hero candidate", () => {
  const circleHeroLayout = {
    id: "STRICT-HERO",
    name: "Strict hero",
    photoCount: 2,
    purpose: "hero",
    balanceProfile: { heroWeight: 0.8, symmetry: 0.3, variety: 0.5 },
    frames: [
      { id: "hero", cropShapeId: "circle", slotRole: "hero", importance: 1, rect: { x: 0, y: 0, w: 0.7, h: 1 } },
      { id: "other", cropShapeId: "square", slotRole: "secondary", importance: 0.6, rect: { x: 0.7, y: 0, w: 0.3, h: 1 } },
    ],
  };
  const fallbackAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [],
  };
  const strictAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.4 },
    pets: [
      {
        bbox: { x: 0.26, y: 0.26, width: 0.48, height: 0.48 },
        face: { x: 0.38, y: 0.38, width: 0.24, height: 0.24 },
        confidence: 0.98,
      },
    ],
  };
  const fallbackLeader = withHeroSignals(photo("PI_FALLBACK", fallbackAnalysis), {
    overallScore: 99,
    role: "primary",
    bestShotScore: 99,
    sceneRepresentativeness: 100,
  });
  const strictCandidate = withHeroSignals(photo("STRICT_CANDIDATE", strictAnalysis), {
    overallScore: 60,
  });
  const result = evaluateLayout(circleHeroLayout, [fallbackLeader, strictCandidate]);
  const hero = result.assignments.find((a) => a.slotRole === "hero");

  assert.ok(fallbackLeader.photoIntelligence.overallScore > strictCandidate.photoIntelligence.overallScore);
  assert.equal(result.tier, "strict");
  assert.equal(hero?.photoId, "STRICT_CANDIDATE");
  assert.equal(hero?.frameMatch.matchTier, "strict");
});

test("050.2 hero confidence is low for near-equal scores and high for a clear gap", () => {
  const nearEqual = [withHeroSignals(photo("NEAR_A", faceCloseup.analysis), { overallScore: 80 }), withHeroSignals(photo("NEAR_B", faceCloseup.analysis), { overallScore: 79 })];
  const clearGap = [
    withHeroSignals(photo("CLEAR_A", faceCloseup.analysis), {
      overallScore: 98,
      role: "primary",
    }),
    withHeroSignals(photo("CLEAR_B", faceCloseup.analysis), { overallScore: 55 }),
  ];
  const nearResult = evaluateLayout(
    ALBUM_LAYOUTS.find((l) => l.id === "L10"),
    nearEqual,
  );
  const clearResult = evaluateLayout(
    ALBUM_LAYOUTS.find((l) => l.id === "L10"),
    clearGap,
  );

  assert.ok(nearResult.heroConfidence < 0.5, `${nearResult.heroConfidence}`);
  assert.ok(clearResult.heroConfidence >= 0.9, `${clearResult.heroConfidence}`);
});

test("050.2 absent PI/Best Shot preserves Task050.1 selection behavior", () => {
  const result = findBestLayoutForPhotos([landscapeBody, landscape2]);
  assert.equal(result.best?.layoutId, "L03");
  assert.ok(result.best?.assignments.every((a) => a.photoIntelligence === undefined));
  assert.ok(result.best?.assignments.every((a) => a.bestShot === undefined));
});

test("050.2 UNUSABLE layouts cannot produce a Hero assignment", () => {
  const unusable = evaluateLayout(
    ALBUM_LAYOUTS.find((l) => l.id === "L04"),
    [landscapeBody],
  );
  const { best } = findBestLayoutForPhotos([landscapeBody, landscape2, faceCloseup]);

  assert.equal(unusable.tier, "unusable");
  assert.equal(unusable.assignments.length, 0);
  assert.ok(best);
  assert.notEqual(best.tier, "unusable");
  assert.ok(best.assignments.filter((a) => a.slotRole === "hero" || a.importance >= 0.95).every((a) => a.frameMatch.matchTier !== "unusable"));
});
