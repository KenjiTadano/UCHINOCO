import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "jpeg-js";
import {
  clearPhotoIntelligenceCache,
  getPhotoIntelligenceCache,
  photoIntelligenceCacheKey,
  setPhotoIntelligenceCache,
} from "../lib/photo-intelligence/cache.ts";
import { PHOTO_INTELLIGENCE_CONFIG, PHOTO_INTELLIGENCE_VERSION } from "../lib/photo-intelligence/config.ts";
import { scorePhotoComposition } from "../lib/photo-intelligence/composition.ts";
import { buildPhotoIntelligence, computeOverallScore } from "../lib/photo-intelligence/score.ts";
import {
  isExtremeBlur,
  measureTechnicalQuality,
  scoreSharpnessFromLaplacian,
  statsFromRgba,
  technicalResultFromSignals,
} from "../lib/photo-intelligence/technical.ts";
import { scorePetVisibility } from "../lib/photo-intelligence/visibility.ts";
import {
  collectVisionTags,
  parsePhotoIntelligenceVision,
} from "../lib/photo-intelligence/vision-parse.ts";

function analysis(pets, extra = {}) {
  return {
    width: 1600,
    height: 1200,
    orientation: "landscape",
    focalPoint: { x: 0.48, y: 0.42 },
    pets,
    analysisConfidence: { petDetection: 0.9 },
    ...extra,
  };
}

const fullBody = analysis([
  {
    bbox: { x: 0.22, y: 0.18, width: 0.5, height: 0.62 },
    face: { x: 0.36, y: 0.2, width: 0.16, height: 0.14 },
    confidence: 0.92,
  },
]);

const closeup = analysis(
  [
    {
      bbox: { x: 0.12, y: 0.08, width: 0.76, height: 0.84 },
      face: { x: 0.22, y: 0.12, width: 0.5, height: 0.42 },
      confidence: 0.95,
    },
  ],
  { focalPoint: { x: 0.48, y: 0.32 }, orientation: "portrait", width: 1200, height: 1600 },
);

const corner = analysis(
  [
    {
      bbox: { x: 0.02, y: 0.55, width: 0.22, height: 0.28 },
      face: { x: 0.04, y: 0.56, width: 0.08, height: 0.08 },
      confidence: 0.8,
    },
  ],
  { focalPoint: { x: 0.08, y: 0.62 } },
);

function vision(overrides = {}) {
  return {
    expressionScore: 90,
    uniquenessScore: 70,
    memoryValueScore: 88,
    confidence: 0.86,
    scene: "home",
    petActivity: "sleeping",
    expressionTags: ["sleepy", "relaxed"],
    memoryTags: ["everyday_moment", "sleeping_face"],
    moment: "calm",
    season: "unknown",
    petPresent: true,
    peoplePresent: false,
    eyesVisible: true,
    reason: "寝顔がやわらかく、日常の印象的な瞬間に見えます。",
    ...overrides,
  };
}

function sharpSignals(lapVar = 0.01) {
  return technicalResultFromSignals({
    width: 2000,
    height: 1500,
    readable: true,
    pixelsKnown: true,
    meanLuma: 0.46,
    lumaStd: 0.18,
    laplacianVar: lapVar,
    neighborDiff: 0.06,
  });
}

test("weights sum to 1", () => {
  const sum = Object.values(PHOTO_INTELLIGENCE_CONFIG.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("a slightly rough great moment outranks a clean ordinary portrait", () => {
  const moment = computeOverallScore({
    technicalQuality: 68,
    petVisibility: 90,
    expression: 98,
    composition: 72,
    uniqueness: 75,
    memoryValue: 93,
  });
  const ordinary = computeOverallScore({
    technicalQuality: 95,
    petVisibility: 88,
    expression: 60,
    composition: 82,
    uniqueness: 48,
    memoryValue: 58,
  });
  assert.ok(moment >= 85, `moment ${moment}`);
  assert.ok(ordinary >= 70 && ordinary <= 82, `ordinary ${ordinary}`);
  assert.ok(moment > ordinary);

  const veryRough = computeOverallScore({
    technicalQuality: 30,
    petVisibility: 80,
    expression: 98,
    composition: 60,
    uniqueness: 70,
    memoryValue: 95,
  });
  const cleanQuiet = computeOverallScore({
    technicalQuality: 95,
    petVisibility: 85,
    expression: 60,
    composition: 80,
    uniqueness: 40,
    memoryValue: 55,
  });
  assert.ok(veryRough > cleanQuiet, `${veryRough} vs ${cleanQuiet}`);
});

test("slight blur is not an extreme-blur reject", () => {
  assert.equal(isExtremeBlur(0.0016, 1600), false);
  assert.equal(scoreSharpnessFromLaplacian(0.0016) >= 60, true);
  assert.equal(isExtremeBlur(0.00005, 1600), true);
});

test("black frame is low quality without throwing", () => {
  const technical = technicalResultFromSignals({
    width: 1200,
    height: 900,
    readable: true,
    pixelsKnown: true,
    meanLuma: 0.01,
    lumaStd: 0.005,
    laplacianVar: 0.00001,
    neighborDiff: 0.002,
  });
  assert.ok(technical.flags.includes("BLACK_IMAGE"));
  const result = buildPhotoIntelligence({
    photoId: "black-1",
    analysis: analysis([]),
    technical,
    vision: null,
    visionFailed: false,
  });
  assert.equal(result.status, "low_quality");
  assert.equal(result.photoId, "black-1");
  assert.equal(result.analysisVersion, PHOTO_INTELLIGENCE_VERSION);
  assert.ok(Number.isFinite(result.overallScore));
  assert.ok(result.overallScore < 40);
  assert.ok(result.warnings.includes("VISION_SKIPPED_UNUSABLE_IMAGE"));
});

test("vision failure falls back and does not invent a great score", () => {
  const result = buildPhotoIntelligence({
    photoId: "fallback-1",
    analysis: fullBody,
    technical: sharpSignals(),
    vision: null,
    visionFailed: true,
  });
  assert.ok(result.warnings.includes("VISION_ANALYSIS_FAILED"));
  assert.equal(result.expression, PHOTO_INTELLIGENCE_CONFIG.fallback.expression);
  assert.ok(result.overallScore < 80);
  assert.equal(result.status, "ok");
  assert.ok(result.reasons.some((reason) => reason.includes("暫定")));
});

test("sleeping vision tags and scores are kept on the photo id", () => {
  const parsed = parsePhotoIntelligenceVision(
    JSON.stringify({
      expression_score: 910,
      uniqueness_score: 64,
      memory_value_score: 86,
      confidence: 2,
      scene: "home",
      pet_activity: "sleeping",
      expression_tags: ["Sleepy", "not a tag!!", "ok"],
      memory_tags: ["everyday_moment"],
      moment: "calm",
      season: "winter",
      pet_present: true,
      people_present: false,
      eyes_visible: true,
      reason: "静かな寝顔です。",
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed.expressionScore, 100);
  assert.equal(parsed.confidence, 1);
  assert.deepEqual(parsed.expressionTags, ["sleepy", "not_a_tag", "ok"]);
  const result = buildPhotoIntelligence({
    photoId: "sleep-1",
    analysis: fullBody,
    technical: sharpSignals(0.004),
    vision: parsed,
    visionFailed: false,
  });
  assert.equal(result.photoId, "sleep-1");
  assert.equal(result.expression, 100);
  assert.ok(result.tags.includes("sleeping"));
  assert.ok(result.tags.includes("calm"));
  assert.ok(result.tags.includes("everyday_moment"));
  assert.ok(result.overallScore >= 80);
  assert.equal(collectVisionTags(parsed).includes("winter"), true);
});

test("closeup visibility does not dwarf a clear full-body photo", () => {
  const faceUp = scorePetVisibility(closeup, { eyesVisible: true, activity: "looking_camera", petPresent: true });
  const body = scorePetVisibility(fullBody, { eyesVisible: true, activity: "looking_camera", petPresent: true });
  assert.ok(body.score >= 80, `body ${body.score}`);
  assert.ok(faceUp.score - body.score < 12, `closeup ${faceUp.score} body ${body.score}`);
});

test("corner placement scores below a balanced subject", () => {
  const balanced = scorePhotoComposition(fullBody);
  const edged = scorePhotoComposition(corner);
  assert.ok(balanced.score > edged.score, `${balanced.score} vs ${edged.score}`);
});

test("no subject agreed by vision is low quality and is not deleted", () => {
  const result = buildPhotoIntelligence({
    photoId: "empty-1",
    analysis: analysis([]),
    technical: sharpSignals(),
    vision: vision({
      petPresent: false,
      petActivity: "none",
      expressionScore: 20,
      memoryValueScore: 15,
      uniquenessScore: 10,
      reason: "ペットが見えません。",
    }),
    visionFailed: false,
  });
  assert.equal(result.status, "low_quality");
  assert.ok(result.warnings.includes("NO_SUBJECT"));
  assert.equal(result.photoId, "empty-1");
});

test("invalid vision json is rejected", () => {
  assert.equal(parsePhotoIntelligenceVision("not-json"), null);
  assert.equal(parsePhotoIntelligenceVision("[]"), null);
});

test("jpeg roundtrip exposes resolution and finite technical score", () => {
  const width = 48;
  const height = 36;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      data[i] = on ? 240 : 30;
      data[i + 1] = on ? 200 : 40;
      data[i + 2] = on ? 160 : 50;
      data[i + 3] = 255;
    }
  }
  const encoded = encode({ data, width, height }, 80);
  const measured = measureTechnicalQuality(encoded.data, "image/jpeg");
  assert.equal(measured.signals.readable, true);
  assert.equal(measured.signals.pixelsKnown, true);
  assert.ok(measured.technicalQuality > 0);
  assert.ok(Number.isFinite(measured.technicalQuality));
  const flat = statsFromRgba(new Uint8Array(32 * 32 * 4), 32, 32);
  assert.ok(flat.laplacianVar < 0.00012);
});

test("cache key is photoId plus version, not list index", () => {
  clearPhotoIntelligenceCache();
  const keyA = photoIntelligenceCacheKey("photo-a", "pets/a.jpg", PHOTO_INTELLIGENCE_VERSION, "src1|pets/a.jpg|none|t");
  const keyB = photoIntelligenceCacheKey("photo-b", "pets/a.jpg", PHOTO_INTELLIGENCE_VERSION, "src1|pets/a.jpg|none|t");
  assert.notEqual(keyA, keyB);
  assert.match(keyA, new RegExp(PHOTO_INTELLIGENCE_VERSION));
  setPhotoIntelligenceCache(
    keyA,
    {
      intelligence: buildPhotoIntelligence({
        photoId: "photo-a",
        analysis: fullBody,
        technical: sharpSignals(),
        vision: vision(),
        visionFailed: false,
      }),
      parts: sharpSignals().parts,
      signals: {
        width: 2000,
        height: 1500,
        pixelsKnown: true,
        meanLuma: 0.4,
        lumaStd: 0.1,
        laplacianVar: 0.01,
      },
    },
    1000,
  );
  assert.equal(getPhotoIntelligenceCache(keyA)?.intelligence.photoId, "photo-a");
  assert.equal(getPhotoIntelligenceCache(keyB), null);
  clearPhotoIntelligenceCache();
});
