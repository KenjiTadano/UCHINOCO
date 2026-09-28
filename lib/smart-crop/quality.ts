import { SMART_CROP_CONFIG } from "./weights.ts";
import {
  circleEdgeClearance,
  clamp01,
  edgeMargins,
  fractionInsideCircle,
  imagePointToFrameUv,
  occupancyRatio,
  normalizeRect,
  rectCoverage,
  visibleWindow,
} from "./geometry.ts";
import {
  combinedSubjectArea,
  earBandFromHead,
  headSafeAreaFromFace,
  petHeadSafeAreas,
} from "./head.ts";
import type {
  NormalizedRect,
  SmartCropFrame,
  SmartCropPhotoAnalysis,
  SmartCropQuality,
  SmartCropTransform,
} from "./types.ts";

function scoreCropAmount(scale: number, frame: SmartCropFrame): number {
  const softMax = frame.maxScale;
  if (scale <= 1.02) return 92;
  if (scale <= softMax) {
    // Prefer lower half of allowed zoom for landscape/circle
    const t = (scale - 1) / Math.max(softMax - 1, 0.01);
    return Math.round(95 - t * 25);
  }
  const over = Math.min(1, (scale - softMax) / 0.5);
  return Math.round(70 - over * 40);
}

function scoreComposition(
  transform: SmartCropTransform,
  subjectCx: number,
  subjectCy: number,
): number {
  const dx = Math.abs(transform.x - subjectCx);
  const dy = Math.abs(transform.y - subjectCy);
  const dist = Math.sqrt(dx * dx + dy * dy);
  return Math.round(clamp01(1 - dist / 0.45) * 100);
}

function scoreSubjectScale(
  occupancy: number,
  range: { min: number; max: number },
): number {
  if (occupancy >= range.min && occupancy <= range.max) return 100;
  if (occupancy < range.min) {
    const t = clamp01(occupancy / Math.max(range.min, 0.01));
    return Math.round(40 + t * 55);
  }
  // Too large — penalize harder, keep rank differentiation when both overshoot
  const over = (occupancy - range.max) / Math.max(range.max, 0.01);
  return Math.round(Math.max(0, 90 - over * 55));
}

function marginToScore(margin: number): number {
  const { good, ok, tight } = SMART_CROP_CONFIG.earMargin;
  if (margin >= good) return 100;
  if (margin >= ok) return 80;
  if (margin >= tight) return 50;
  if (margin > 0) return 20;
  return 0;
}

function blendMultiPet(scores: number[]): number {
  if (scores.length === 0) return 55;
  if (scores.length === 1) return scores[0];
  const sorted = [...scores].sort((a, b) => b - a);
  const primary = sorted[0];
  const secondaryAvg =
    sorted.slice(1).reduce((a, b) => a + b, 0) / (sorted.length - 1);
  const { primaryWeight, secondaryWeight } = SMART_CROP_CONFIG.multiPet;
  return Math.round(primary * primaryWeight + secondaryAvg * secondaryWeight);
}

function coverageInWindow(
  rect: NormalizedRect,
  window: NormalizedRect,
  circle: boolean,
): number {
  return circle
    ? fractionInsideCircle(rect, window)
    : rectCoverage(rect, window);
}

function circlePointClearanceScore(
  points: Array<{ x: number; y: number }>,
  window: NormalizedRect,
): number {
  let minClear = Infinity;
  for (const p of points) {
    const { u, v } = imagePointToFrameUv(p.x, p.y, window);
    const clear = circleEdgeClearance(u, v);
    minClear = Math.min(minClear, clear);
  }
  if (!Number.isFinite(minClear)) return 50;
  // 0.12+ clearance → 100; 0 → 40; negative → 0
  if (minClear >= 0.12) return 100;
  if (minClear >= 0.06) return 85;
  if (minClear >= 0.03) return 65;
  if (minClear >= 0) return 45;
  return Math.round(clamp01(1 + minClear / 0.1) * 30);
}

export function scoreSmartCrop(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  transform: SmartCropTransform,
): SmartCropQuality {
  const imageAspect =
    analysis.height > 0 ? analysis.width / analysis.height : 1;
  const window = visibleWindow(
    imageAspect,
    frame.aspectRatio,
    transform.scale,
    transform.x,
    transform.y,
  );
  const isCircle = frame.mask === "circle";

  const faces = analysis.pets
    .map((p) => (p.face ? normalizeRect(p.face as NormalizedRect) : null))
    .filter((f): f is NormalizedRect => Boolean(f));
  const bodies = analysis.pets.map((p) => normalizeRect(p.bbox));
  const heads = petHeadSafeAreas(analysis.pets);

  // Face safety
  let faceSafety = 70;
  if (faces.length > 0) {
    faceSafety = Math.round(
      blendMultiPet(
        faces.map((f) => coverageInWindow(f, window, isCircle) * 100),
      ),
    );
  } else if (analysis.pets.length === 0) {
    faceSafety = 55;
  }

  // Head safety + top margin emphasis
  let headSafety = 70;
  if (heads.length > 0) {
    const covScores = heads.map((h) => {
      const cov = coverageInWindow(h, window, isCircle) * 100;
      const m = edgeMargins(h, window);
      const topBoost = marginToScore(m.top);
      return Math.min(cov, (cov * 0.7 + topBoost * 0.3));
    });
    headSafety = Math.round(blendMultiPet(covScores));
  }

  // Ear safety from ear band margins (+ circle clearances)
  let earSafety = 70;
  if (heads.length > 0) {
    const earScores = heads.map((h) => {
      const ear = earBandFromHead(h);
      const m = edgeMargins(ear, window);
      const edge = Math.min(
        marginToScore(m.top),
        marginToScore(m.left),
        marginToScore(m.right),
      );
      if (!isCircle) return edge;
      const pts = [
        { x: ear.x + ear.width * 0.5, y: ear.y },
        { x: ear.x, y: ear.y + ear.height * 0.3 },
        { x: ear.x + ear.width, y: ear.y + ear.height * 0.3 },
      ];
      return Math.min(edge, circlePointClearanceScore(pts, window));
    });
    earSafety = Math.round(blendMultiPet(earScores));
  }

  // Body
  let bodySafety = 50;
  if (bodies.length > 0) {
    bodySafety = Math.round(
      blendMultiPet(
        bodies.map((b) => coverageInWindow(b, window, isCircle) * 100),
      ),
    );
  }

  // Subject scale (head occupancy)
  const primaryHead =
    heads[0] ??
    (faces[0] ? headSafeAreaFromFace(faces[0]) : null);
  const headOcc = primaryHead ? occupancyRatio(primaryHead, window) : 0.25;
  const subjectScale = scoreSubjectScale(headOcc, frame.idealHeadOccupancy);

  // Mask safety
  let maskSafety = 100;
  if (isCircle) {
    const parts: number[] = [];
    for (const f of faces) parts.push(fractionInsideCircle(f, window) * 100);
    for (const h of heads) parts.push(fractionInsideCircle(h, window) * 100);
    for (const b of bodies) parts.push(fractionInsideCircle(b, window) * 90);
    maskSafety =
      parts.length > 0
        ? Math.round(Math.min(...parts.map((p) => Math.min(p, 100))))
        : 60;
    // Extra: head corners clearance
    if (heads[0]) {
      const h = heads[0];
      const pts = [
        { x: h.x, y: h.y },
        { x: h.x + h.width, y: h.y },
        { x: h.x + h.width / 2, y: h.y },
      ];
      maskSafety = Math.min(maskSafety, circlePointClearanceScore(pts, window));
    }
  }

  const subject = combinedSubjectArea(analysis);
  let subjectCoverage = 60;
  if (subject) {
    subjectCoverage = Math.round(
      coverageInWindow(subject, window, isCircle) * 100,
    );
  }

  const cropAmount = scoreCropAmount(transform.scale, frame);
  const sc = primaryHead
    ? { x: primaryHead.x + primaryHead.width / 2, y: primaryHead.y + primaryHead.height / 2 }
    : analysis.focalPoint;
  const composition = scoreComposition(transform, sc.x, sc.y);

  const weights =
    isCircle ? SMART_CROP_CONFIG.weightsCircle : SMART_CROP_CONFIG.weights;
  const overall = Math.round(
    faceSafety * weights.faceSafety +
      headSafety * weights.headSafety +
      earSafety * weights.earSafety +
      bodySafety * weights.bodySafety +
      subjectScale * weights.subjectScale +
      maskSafety * weights.maskSafety +
      cropAmount * weights.cropAmount +
      composition * weights.composition,
  );

  const quality: SmartCropQuality = {
    faceSafety,
    headSafety,
    earSafety,
    bodySafety,
    subjectScale,
    maskSafety,
    cropAmount,
    composition,
    subjectCoverage,
    overall: Math.max(0, Math.min(100, overall)),
  };

  const reject = isHardRejected(quality, frame, analysis);
  if (reject) {
    quality.rejected = true;
    quality.rejectReason = reject;
    // Soft-cap for display, but keep rank differentiation via slight penalty
    // rather than flattening every reject to the same score.
    quality.overall = Math.min(quality.overall, 60) - Math.round((100 - Math.min(maskSafety, faceSafety, headSafety)) * 0.05);
    quality.overall = Math.max(0, quality.overall);
  }

  return quality;
}

export function isHardRejected(
  q: SmartCropQuality,
  frame: SmartCropFrame,
  analysis: SmartCropPhotoAnalysis,
): string | null {
  const hr = SMART_CROP_CONFIG.hardReject;
  if (analysis.pets.length > 0 && q.faceSafety < hr.faceSafety) {
    return `faceSafety ${q.faceSafety} < ${hr.faceSafety}`;
  }
  if (analysis.pets.length > 0 && q.headSafety < hr.headSafety) {
    return `headSafety ${q.headSafety} < ${hr.headSafety}`;
  }
  if (frame.mask === "circle" && q.maskSafety < hr.maskSafetyCircle) {
    return `maskSafety ${q.maskSafety} < ${hr.maskSafetyCircle}`;
  }
  if (
    analysis.pets.length > 1 &&
    q.subjectCoverage < hr.multiSubjectCoverage
  ) {
    return `multi subjectCoverage ${q.subjectCoverage} < ${hr.multiSubjectCoverage}`;
  }
  return null;
}
