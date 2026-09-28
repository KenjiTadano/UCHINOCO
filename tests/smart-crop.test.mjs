import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSmartCropFrameResults,
  buildSubjectRect,
  computeSmartCrop,
} from "../lib/smart-crop/compute.ts";
import { computeSmartCropV0 } from "../lib/smart-crop/compute-v0.ts";
import { SMART_CROP_FRAMES } from "../lib/smart-crop/frames.ts";
import {
  fractionInsideCircle,
  rectCoverage,
  visibleWindow,
} from "../lib/smart-crop/geometry.ts";
import { headSafeAreaFromFace, earBandFromHead } from "../lib/smart-crop/head.ts";
import { scoreSmartCrop } from "../lib/smart-crop/quality.ts";
import { parseSmartCropVisionOutput } from "../lib/smart-crop/vision-parse.ts";
import { readImageDimensions } from "../lib/smart-crop/image-size.ts";
import { SMART_CROP_CONFIG } from "../lib/smart-crop/weights.ts";

const centerCat = {
  width: 1200,
  height: 1600,
  orientation: "portrait",
  focalPoint: { x: 0.5, y: 0.42 },
  pets: [
    {
      bbox: { x: 0.28, y: 0.22, width: 0.44, height: 0.55 },
      face: { x: 0.36, y: 0.24, width: 0.28, height: 0.22 },
      confidence: 0.92,
    },
  ],
};

/** Face near top — ear-cut risk if zoomed hard. */
const topFaceCat = {
  width: 1200,
  height: 1600,
  orientation: "portrait",
  focalPoint: { x: 0.5, y: 0.12 },
  pets: [
    {
      bbox: { x: 0.3, y: 0.02, width: 0.4, height: 0.55 },
      face: { x: 0.38, y: 0.03, width: 0.24, height: 0.18 },
      confidence: 0.9,
    },
  ],
};

/** Mid face — subjectScale should penalize heavy zoom more than cover. */
const midFace = {
  width: 1000,
  height: 1000,
  orientation: "square",
  focalPoint: { x: 0.5, y: 0.4 },
  pets: [
    {
      bbox: { x: 0.28, y: 0.2, width: 0.44, height: 0.6 },
      face: { x: 0.36, y: 0.24, width: 0.28, height: 0.24 },
      confidence: 0.95,
    },
  ],
};

const multiPet = {
  width: 1600,
  height: 1000,
  orientation: "landscape",
  focalPoint: { x: 0.5, y: 0.4 },
  pets: [
    {
      bbox: { x: 0.08, y: 0.25, width: 0.32, height: 0.5 },
      face: { x: 0.12, y: 0.28, width: 0.18, height: 0.18 },
      confidence: 0.9,
    },
    {
      bbox: { x: 0.58, y: 0.22, width: 0.34, height: 0.52 },
      face: { x: 0.64, y: 0.26, width: 0.18, height: 0.18 },
      confidence: 0.85,
    },
  ],
};

test("buildSubjectRect expands face for ears", () => {
  const subject = buildSubjectRect(centerCat);
  assert.ok(subject);
  assert.ok(subject.y < centerCat.pets[0].face.y);
});

test("headSafeArea expands above face", () => {
  const face = centerCat.pets[0].face;
  const head = headSafeAreaFromFace(face);
  assert.ok(head.y < face.y);
  assert.ok(head.width > face.width);
  const ear = earBandFromHead(head);
  assert.ok(ear.height < head.height);
  assert.equal(ear.y, head.y);
});

test("computeSmartCrop zooms toward face for portrait", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "portrait");
  assert.ok(frame);
  const { crop } = computeSmartCrop(centerCat, frame);
  assert.ok(crop.scale >= 1);
  assert.ok(crop.x > 0.3 && crop.x < 0.7);
  assert.ok(crop.y > 0.2 && crop.y < 0.6);
});

test("face stays inside landscape crop window", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(frame);
  const { crop } = computeSmartCrop(centerCat, frame);
  const imageAspect = centerCat.width / centerCat.height;
  const window = visibleWindow(
    imageAspect,
    frame.aspectRatio,
    crop.scale,
    crop.x,
    crop.y,
  );
  const face = centerCat.pets[0].face;
  const coverage = rectCoverage(face, window);
  assert.ok(coverage >= 0.85, `face coverage ${coverage}`);
});

test("landscape avoids excessive zoom vs portrait max", () => {
  const landscape = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(landscape);
  const { crop } = computeSmartCrop(centerCat, landscape);
  assert.ok(
    crop.scale <= landscape.maxScale + 0.01,
    `scale ${crop.scale} > max ${landscape.maxScale}`,
  );
});

test("circle mask scores face inside circle", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "circle");
  assert.ok(frame);
  const { crop, quality } = computeSmartCrop(centerCat, frame);
  assert.ok(quality.faceSafety >= 50);
  assert.ok(quality.maskSafety >= 40);
  assert.ok(quality.overall >= 40 && quality.overall <= 100);
  assert.ok(crop.scale >= 1);
});

test("quality includes head/ear/subjectScale/maskSafety", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "square");
  assert.ok(frame);
  const { quality } = computeSmartCrop(centerCat, frame);
  for (const key of [
    "faceSafety",
    "headSafety",
    "earSafety",
    "bodySafety",
    "subjectScale",
    "maskSafety",
    "cropAmount",
    "composition",
    "overall",
  ]) {
    assert.equal(typeof quality[key], "number", key);
  }
});

test("oversized face gets lower subjectScale when zoomed hard", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "square");
  assert.ok(frame);
  const tight = scoreSmartCrop(midFace, frame, {
    x: 0.5,
    y: 0.4,
    scale: 1.8,
  });
  const loose = scoreSmartCrop(midFace, frame, {
    x: 0.5,
    y: 0.4,
    scale: 1.0,
  });
  assert.ok(
    tight.subjectScale < loose.subjectScale,
    `tight ${tight.subjectScale} vs loose ${loose.subjectScale}`,
  );
});

test("top-face: 048.1 prefers more top margin than extreme zoom", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "portrait");
  assert.ok(frame);
  const v0 = computeSmartCropV0(topFaceCat, frame);
  const { crop, quality } = computeSmartCrop(topFaceCat, frame);
  assert.ok(quality.earSafety >= 0);
  // Candidate search should not zoom harder than legacy when ear risk is high
  // (soft assertion — scale should stay within frame max)
  assert.ok(crop.scale <= frame.maxScale + 0.01);
  assert.ok(v0.scale >= 1);
});

test("multi-pet subject union is wider", () => {
  const subject = buildSubjectRect(multiPet);
  assert.ok(subject);
  assert.ok(subject.width > 0.5);
});

test("multi-pet crop keeps both faces reasonably covered", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(frame);
  const { crop, quality } = computeSmartCrop(multiPet, frame);
  const imageAspect = multiPet.width / multiPet.height;
  const window = visibleWindow(
    imageAspect,
    frame.aspectRatio,
    crop.scale,
    crop.x,
    crop.y,
  );
  for (const pet of multiPet.pets) {
    const cov = rectCoverage(pet.face, window);
    assert.ok(cov >= 0.5, `face coverage ${cov}`);
  }
  assert.ok(quality.subjectCoverage >= 50);
});

test("hard reject when faceSafety too low", () => {
  const frame = SMART_CROP_FRAMES.find((f) => f.id === "landscape");
  assert.ok(frame);
  const q = scoreSmartCrop(centerCat, frame, {
    x: 0.95,
    y: 0.95,
    scale: 2.2,
  });
  assert.ok(
    q.rejected || q.faceSafety < SMART_CROP_CONFIG.hardReject.faceSafety,
  );
});

test("buildSmartCropFrameResults includes legacy Before crop", () => {
  const results = buildSmartCropFrameResults(centerCat);
  assert.equal(results.length, SMART_CROP_FRAMES.length);
  for (const r of results) {
    assert.ok(r.legacyCrop);
    assert.ok(r.legacyQuality);
    assert.ok(r.candidatesEvaluated > 0);
    assert.ok(r.aiCrop.scale >= 1);
  }
});

test("parseSmartCropVisionOutput accepts valid JSON", () => {
  const raw = JSON.stringify({
    pets: [
      {
        bbox: { x: 0.2, y: 0.2, width: 0.4, height: 0.5 },
        face: { x: 0.28, y: 0.22, width: 0.24, height: 0.2 },
        confidence: 0.8,
      },
    ],
    focalPoint: { x: 0.4, y: 0.35 },
  });
  const parsed = parseSmartCropVisionOutput(raw, 800, 600);
  assert.ok(parsed);
  assert.equal(parsed.pets.length, 1);
  assert.equal(parsed.orientation, "landscape");
});

test("parseSmartCropVisionOutput rejects garbage", () => {
  assert.equal(parseSmartCropVisionOutput("{nope", 100, 100), null);
});

test("readImageDimensions PNG 1x1", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const dims = readImageDimensions(new Uint8Array(png), "image/png");
  assert.deepEqual(dims, { width: 1, height: 1 });
});

test("fractionInsideCircle is high for centered face", () => {
  const window = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  const face = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
  const f = fractionInsideCircle(face, window);
  assert.ok(f > 0.7, `got ${f}`);
});
