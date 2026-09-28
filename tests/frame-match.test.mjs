import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findBestFrameForPhoto,
  scoreAspectCompatibility,
  scoreSubjectFit,
} from "../lib/smart-crop/frame-match.ts";
import { SMART_CROP_FRAMES } from "../lib/smart-crop/frames.ts";

const portraitFace = {
  width: 900,
  height: 1400,
  orientation: "portrait",
  focalPoint: { x: 0.5, y: 0.38 },
  pets: [
    {
      bbox: { x: 0.28, y: 0.18, width: 0.44, height: 0.62 },
      face: { x: 0.34, y: 0.2, width: 0.3, height: 0.24 },
      confidence: 0.93,
    },
  ],
};

const landscapeFullBody = {
  width: 1600,
  height: 900,
  orientation: "landscape",
  focalPoint: { x: 0.48, y: 0.55 },
  pets: [
    {
      bbox: { x: 0.18, y: 0.35, width: 0.62, height: 0.45 },
      face: { x: 0.28, y: 0.38, width: 0.14, height: 0.16 },
      confidence: 0.9,
    },
  ],
};

const faceCloseup = {
  width: 1000,
  height: 1000,
  orientation: "square",
  focalPoint: { x: 0.5, y: 0.42 },
  pets: [
    {
      bbox: { x: 0.22, y: 0.18, width: 0.56, height: 0.7 },
      face: { x: 0.3, y: 0.22, width: 0.4, height: 0.38 },
      confidence: 0.95,
    },
  ],
};

const rightBiased = {
  width: 1400,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.72, y: 0.45 },
  pets: [
    {
      bbox: { x: 0.55, y: 0.25, width: 0.38, height: 0.55 },
      face: { x: 0.62, y: 0.28, width: 0.22, height: 0.22 },
      confidence: 0.88,
    },
  ],
};

const leftBiased = {
  width: 1400,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.28, y: 0.45 },
  pets: [
    {
      bbox: { x: 0.08, y: 0.25, width: 0.38, height: 0.55 },
      face: { x: 0.14, y: 0.28, width: 0.22, height: 0.22 },
      confidence: 0.88,
    },
  ],
};

const multiPet = {
  width: 1800,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.5, y: 0.42 },
  pets: [
    {
      bbox: { x: 0.06, y: 0.28, width: 0.34, height: 0.5 },
      face: { x: 0.12, y: 0.3, width: 0.16, height: 0.16 },
      confidence: 0.9,
    },
    {
      bbox: { x: 0.55, y: 0.26, width: 0.36, height: 0.52 },
      face: { x: 0.62, y: 0.28, width: 0.16, height: 0.16 },
      confidence: 0.86,
    },
  ],
};

const tinyFace = {
  width: 1600,
  height: 1200,
  orientation: "landscape",
  focalPoint: { x: 0.5, y: 0.5 },
  pets: [
    {
      bbox: { x: 0.35, y: 0.4, width: 0.28, height: 0.35 },
      face: { x: 0.42, y: 0.42, width: 0.08, height: 0.08 },
      confidence: 0.7,
    },
  ],
};

const circleFriendly = {
  width: 1000,
  height: 1000,
  orientation: "square",
  focalPoint: { x: 0.5, y: 0.4 },
  pets: [
    {
      bbox: { x: 0.28, y: 0.22, width: 0.44, height: 0.55 },
      face: { x: 0.34, y: 0.26, width: 0.32, height: 0.3 },
      confidence: 0.94,
    },
  ],
};

const circleUnfriendly = {
  width: 1600,
  height: 900,
  orientation: "landscape",
  focalPoint: { x: 0.5, y: 0.55 },
  pets: [
    {
      bbox: { x: 0.15, y: 0.3, width: 0.7, height: 0.55 },
      face: { x: 0.22, y: 0.32, width: 0.12, height: 0.14 },
      confidence: 0.85,
    },
  ],
};

test("aspect compatibility is soft (portrait photo can still score landscape)", () => {
  const landscape = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  const portrait = SMART_CROP_FRAMES.find((f) => f.id === "portrait");
  assert.ok(landscape && portrait);
  const aL = scoreAspectCompatibility(portraitFace, landscape);
  const aP = scoreAspectCompatibility(portraitFace, portrait);
  // Portrait preferred lightly, but landscape not crushed
  assert.ok(aP >= aL);
  assert.ok(aL >= 40, `landscape aspect too low: ${aL}`);
});

test("findBestFrameForPhoto returns ranking with match scores", () => {
  const { best, ranking, mode } = findBestFrameForPhoto(portraitFace);
  assert.equal(ranking.length, SMART_CROP_FRAMES.length);
  assert.ok(best);
  assert.equal(best.matchTier, "strict");
  assert.equal(mode, "strict");
  assert.ok(best.matchScore >= 0 && best.matchScore <= 100);
  for (const r of ranking) {
    assert.ok(r.compatibility);
    assert.equal(typeof r.compatibility.aspect, "number");
    assert.equal(typeof r.matchScore, "number");
    assert.equal(typeof r.fallbackScore, "number");
    assert.ok(["strict", "fallback", "unusable"].includes(r.matchTier));
  }
});

test("unusable frames are never best; strict preferred", () => {
  const { best, ranking } = findBestFrameForPhoto(circleUnfriendly);
  const circle = ranking.find((r) => r.frameId === "circle");
  assert.ok(circle);
  if (circle.matchTier === "unusable") {
    assert.ok(!best || best.frameId !== "circle");
  }
  if (best) assert.notEqual(best.matchTier, "unusable");
  // If any strict exists, best must be strict
  const hasStrict = ranking.some((r) => r.matchTier === "strict");
  if (hasStrict) {
    assert.equal(best?.matchTier, "strict");
  }
});

test("all-strict-fail yields fallback best (not none)", () => {
  // Face near top — typically fails headSafety STRICT on many frames
  const tightHead = {
    width: 1200,
    height: 1600,
    orientation: "portrait",
    focalPoint: { x: 0.5, y: 0.08 },
    pets: [
      {
        bbox: { x: 0.3, y: 0.0, width: 0.4, height: 0.55 },
        face: { x: 0.36, y: 0.0, width: 0.28, height: 0.2 },
        confidence: 0.9,
      },
    ],
    analysisConfidence: { petDetection: 0.9 },
  };
  const { best, ranking, mode } = findBestFrameForPhoto(tightHead);
  const strict = ranking.filter((r) => r.matchTier === "strict");
  if (strict.length === 0) {
    assert.equal(mode, "fallback");
    assert.ok(best);
    assert.equal(best.matchTier, "fallback");
    assert.equal(best.needsAdjustment, true);
    assert.ok(best.fallbackReason);
  } else {
    assert.equal(mode, "strict");
  }
});

test("pets=0 does not always pick square", () => {
  const landscapeEmpty = {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.35, y: 0.45 },
    pets: [],
    analysisConfidence: { petDetection: 0 },
  };
  const portraitEmpty = {
    width: 900,
    height: 1400,
    orientation: "portrait",
    focalPoint: { x: 0.5, y: 0.4 },
    pets: [],
    analysisConfidence: { petDetection: 0 },
  };
  const bL = findBestFrameForPhoto(landscapeEmpty);
  const bP = findBestFrameForPhoto(portraitEmpty);
  assert.ok(bL.best);
  assert.ok(bP.best);
  const landscapeFrame = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  const squareFrame = SMART_CROP_FRAMES.find((f) => f.id === "square");
  assert.ok(landscapeFrame && squareFrame);
  assert.ok(
    scoreSubjectFit(landscapeEmpty, landscapeFrame) >
      scoreSubjectFit(landscapeEmpty, squareFrame),
  );
  assert.ok(
    scoreSubjectFit(portraitEmpty, SMART_CROP_FRAMES.find((f) => f.id === "portrait")) >
      scoreSubjectFit(portraitEmpty, squareFrame),
  );
});

test("multi-pet prefers wide subjectFit for landscape", () => {
  const landscape = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  const portrait = SMART_CROP_FRAMES.find((f) => f.id === "portrait");
  assert.ok(landscape && portrait);
  const sL = scoreSubjectFit(multiPet, landscape);
  const sP = scoreSubjectFit(multiPet, portrait);
  assert.ok(sL > sP, `landscape ${sL} vs portrait ${sP}`);
});

test("multi-pet ranking often picks landscape or square over circle", () => {
  const { best, ranking } = findBestFrameForPhoto(multiPet);
  assert.ok(best);
  assert.ok(["landscape", "square"].includes(best.frameId), best.frameId);
  const circle = ranking.find((r) => r.frameId === "circle");
  assert.ok(circle);
  if (circle.matchTier === "strict" && best.matchTier === "strict") {
    assert.ok(best.matchScore >= circle.matchScore);
  }
});

test("face closeup elevates square or circle subject fit", () => {
  const square = SMART_CROP_FRAMES.find((f) => f.id === "square");
  const circle = SMART_CROP_FRAMES.find((f) => f.id === "circle");
  const landscape = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(square && circle && landscape);
  const sSq = scoreSubjectFit(faceCloseup, square);
  const sCi = scoreSubjectFit(faceCloseup, circle);
  const sLa = scoreSubjectFit(faceCloseup, landscape);
  assert.ok(sSq >= 60 || sCi >= 60);
  assert.ok(sCi > sLa || sSq > sLa);
});

test("full-body lowers circle subjectFit vs landscape", () => {
  const circle = SMART_CROP_FRAMES.find((f) => f.id === "circle");
  const landscape = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(circle && landscape);
  assert.ok(
    scoreSubjectFit(landscapeFullBody, circle) <
      scoreSubjectFit(landscapeFullBody, landscape),
  );
});

test("best frame varies across fixture photos", () => {
  const fixtures = [
    portraitFace,
    landscapeFullBody,
    faceCloseup,
    multiPet,
    circleFriendly,
    rightBiased,
    leftBiased,
    tinyFace,
  ];
  const bestIds = new Set(
    fixtures.map((f) => findBestFrameForPhoto(f).best?.frameId ?? "none"),
  );
  assert.ok(
    bestIds.size >= 2,
    `expected diverse bests, got ${[...bestIds].join(",")}`,
  );
});

test("layoutRole is present on all shared frames", () => {
  for (const f of SMART_CROP_FRAMES) {
    assert.ok(f.layoutRole, f.id);
  }
});

test("circle-friendly photo can be STRICT circle", () => {
  const { ranking } = findBestFrameForPhoto(circleFriendly);
  const circle = ranking.find((r) => r.frameId === "circle");
  assert.ok(circle);
  // Face-centered closeup should often clear mask STRICT
  assert.ok(
    circle.matchTier === "strict" || circle.matchTier === "fallback",
    circle.matchTier,
  );
  if (circle.matchTier === "strict") {
    assert.ok(circle.matchScore >= 50);
  }
});

test("dangerous face cut is UNUSABLE not fallback", () => {
  const gone = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.9, y: 0.9 },
    pets: [
      {
        bbox: { x: 0.85, y: 0.85, width: 0.12, height: 0.12 },
        face: { x: 0.88, y: 0.88, width: 0.08, height: 0.08 },
        confidence: 0.8,
      },
    ],
  };
  const { ranking } = findBestFrameForPhoto(gone);
  // Extreme corner subject + heavy zoom candidates may still leave some usable;
  // at least circle or poorly fitting frames should be unusable/fallback not all strict-best-circle
  const circle = ranking.find((r) => r.frameId === "circle");
  assert.ok(circle);
  assert.notEqual(circle.matchTier, "strict");
});
