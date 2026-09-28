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
});

test("single hero photo prefers a 1-up layout", () => {
  const { best, ranking } = findBestLayoutForPhotos([portraitFace]);
  assert.ok(best);
  assert.equal(best.layout.photoCount, 1);
  assert.notEqual(best.tier, "unusable");
  assert.ok(ranking.length >= 1);
});

test("3 mixed photos produce ranking with alternatives", () => {
  const { best, alternatives, ranking } = findBestLayoutForPhotos([
    landscapeBody,
    portraitFace,
    faceCloseup,
  ]);
  assert.ok(best);
  assert.ok(best.assignments.length === 3);
  assert.ok(alternatives.length >= 1);
  assert.ok(ranking.every((r) => r.layout.photoCount === 3));
  // Unique photo assignment
  const ids = best.assignments.map((a) => a.photoId);
  assert.equal(new Set(ids).size, 3);
});

test("UNUSABLE layouts are never best", () => {
  const { best, ranking } = findBestLayoutForPhotos([
    landscapeBody,
    landscape2,
    faceCloseup,
  ]);
  if (best) assert.notEqual(best.tier, "unusable");
  for (const r of ranking) {
    if (r.tier === "unusable") {
      assert.ok(!best || best.layoutId !== r.layoutId);
    }
  }
});

test("STRICT preferred over FALLBACK when both exist", () => {
  const { best, ranking } = findBestLayoutForPhotos([
    portraitFace,
    faceCloseup,
    landscapeBody,
  ]);
  const hasStrict = ranking.some((r) => r.tier === "strict");
  if (hasStrict && best) {
    assert.equal(best.tier, "strict");
  }
});

test("multi-pet set can pick story/hero layouts", () => {
  const { best } = findBestLayoutForPhotos([
    multiPet,
    landscapeBody,
    faceCloseup,
  ]);
  assert.ok(best);
  assert.ok(["story", "collage", "detail", "sequence"].includes(best.layout.purpose));
});

test("4-photo set uses 4-count layouts only", () => {
  const { ranking, best } = findBestLayoutForPhotos([
    landscapeBody,
    landscape2,
    portraitFace,
    faceCloseup,
  ]);
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
  const sets = [
    [portraitFace],
    [landscapeBody, landscape2],
    [landscapeBody, portraitFace, faceCloseup],
    [multiPet, landscapeBody, portrait2],
    [portraitFace, portrait2],
    [faceCloseup, portraitFace, landscapeBody],
  ];
  const bestIds = new Set(
    sets.map((s) => findBestLayoutForPhotos(s).best?.layoutId ?? "none"),
  );
  assert.ok(bestIds.size >= 2, `got ${[...bestIds].join(",")}`);
});

test("catalog has 8+ layouts", () => {
  assert.ok(ALBUM_LAYOUTS.length >= 8);
});
