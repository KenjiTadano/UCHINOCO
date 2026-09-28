/**
 * Task049 / 049.1 — Photo × Frame Matching (+ Fallback / Degraded Mode).
 */
import { SMART_CROP_CONFIG } from "./weights.ts";
import { computeSmartCrop } from "./compute.ts";
import { SMART_CROP_FRAMES } from "./frames.ts";
import {
  clamp01,
  normalizeRect,
  occupancyRatio,
  rectCenter,
  visibleWindow,
} from "./geometry.ts";
import {
  combinedHeadSafeArea,
  combinedSubjectArea,
  headSafeAreaFromFace,
} from "./head.ts";
import type {
  FrameMatchRanking,
  FrameMatchRejectReason,
  FrameMatchResult,
  FrameMatchTier,
  FrameMatchWarning,
  NormalizedRect,
  SmartCropFrame,
  SmartCropPhotoAnalysis,
  SmartCropQuality,
  SmartCropTransform,
} from "./types.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function photoAspect(analysis: SmartCropPhotoAnalysis): number {
  return analysis.height > 0 ? analysis.width / analysis.height : 1;
}

function petDetectionConfidence(analysis: SmartCropPhotoAnalysis): number {
  if (analysis.analysisConfidence?.petDetection != null) {
    return analysis.analysisConfidence.petDetection;
  }
  if (analysis.pets.length === 0) return 0;
  const confs = analysis.pets
    .map((p) => p.confidence)
    .filter((c): c is number => typeof c === "number");
  if (confs.length === 0) return 0.75;
  return confs.reduce((a, b) => a + b, 0) / confs.length;
}

/**
 * Soft aspect compatibility — similar shapes score higher, but never dominate.
 */
export function scoreAspectCompatibility(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): number {
  const img = photoAspect(analysis);
  const fr = frame.aspectRatio;
  const logDiff = Math.abs(Math.log(img / Math.max(fr, 0.01)));
  const base = 42 + clamp01(1 - logDiff / 1.6) * 58;

  let hint = 0;
  if (analysis.orientation === "landscape" && frame.role === "landscape") hint = 6;
  if (analysis.orientation === "portrait" && frame.role === "portrait") hint = 6;
  if (
    analysis.orientation === "square" &&
    (frame.role === "square" || frame.role === "circle")
  ) {
    hint = 4;
  }
  if (analysis.orientation === "landscape" && frame.role === "portrait") hint = -3;
  if (analysis.orientation === "portrait" && frame.role === "landscape") hint = -3;

  return clampScore(base + hint);
}

export function scoreCropQuality(quality: SmartCropQuality): number {
  return clampScore(
    quality.faceSafety * 0.18 +
      quality.headSafety * 0.18 +
      quality.earSafety * 0.12 +
      quality.bodySafety * 0.1 +
      quality.subjectScale * 0.18 +
      quality.maskSafety * 0.12 +
      quality.cropAmount * 0.06 +
      quality.composition * 0.06,
  );
}

function subjectMetrics(analysis: SmartCropPhotoAnalysis) {
  const subject = combinedSubjectArea(analysis);
  const head = combinedHeadSafeArea(analysis);
  const faces = analysis.pets
    .map((p) => (p.face ? normalizeRect(p.face) : null))
    .filter((f): f is NormalizedRect => Boolean(f));

  const bodyUnion = subject;
  const bodyAspect =
    bodyUnion && bodyUnion.height > 0
      ? bodyUnion.width / bodyUnion.height
      : photoAspect(analysis);

  const headCenter = head ? rectCenter(head) : analysis.focalPoint;
  const bodyCenter = bodyUnion
    ? rectCenter(bodyUnion)
    : analysis.focalPoint;

  const faceArea =
    faces.length > 0
      ? faces.reduce((s, f) => s + f.width * f.height, 0) / faces.length
      : 0;
  const bodyArea = bodyUnion ? bodyUnion.width * bodyUnion.height : 0;
  const faceToBody = bodyArea > 0 ? faceArea / bodyArea : 0;

  return {
    subject,
    head,
    bodyAspect,
    headCenter,
    bodyCenter,
    faceArea,
    bodyArea,
    faceToBody,
    petCount: analysis.pets.length,
    whitespace: bodyUnion
      ? clamp01(1 - bodyUnion.width * bodyUnion.height)
      : 0.5,
  };
}

/** pets=0: orientation + focal — avoid Square-only bias. */
function scoreSubjectFitNoPets(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): number {
  const o = analysis.orientation;
  const fx = Math.abs(analysis.focalPoint.x - 0.5);
  const fy = Math.abs(analysis.focalPoint.y - 0.5);
  const centered = fx + fy < 0.2;

  switch (frame.role) {
    case "landscape":
      return clampScore(
        (o === "landscape" ? 78 : o === "square" ? 60 : 48) +
          (fx > 0.1 ? 6 : 0),
      );
    case "portrait":
      return clampScore(
        (o === "portrait" ? 80 : o === "square" ? 58 : 46) +
          (fy < 0.15 ? 6 : 0),
      );
    case "square":
      // Not automatic winner — only mild boost when truly square + centered
      return clampScore(
        (o === "square" ? 68 : 52) + (centered ? 8 : 0),
      );
    case "circle":
      // Without a detected face, circle is a poor default
      return clampScore(centered && o === "square" ? 42 : 28);
    default:
      return 50;
  }
}

export function scoreSubjectFit(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): number {
  if (analysis.pets.length === 0) {
    return scoreSubjectFitNoPets(analysis, frame);
  }

  const m = subjectMetrics(analysis);
  let score = 55;

  switch (frame.role) {
    case "landscape": {
      if (m.bodyAspect >= 1.15) score += 22;
      else if (m.bodyAspect >= 0.95) score += 10;
      else score -= 8;
      if (m.petCount > 1) score += 12;
      if (m.faceToBody < 0.35) score += 8;
      if (m.faceToBody > 0.55) score -= 6;
      break;
    }
    case "portrait": {
      if (m.bodyAspect <= 0.85) score += 20;
      else if (m.bodyAspect <= 1.05) score += 8;
      else score -= 10;
      if (m.head && m.subject) {
        const headBottom = m.head.y + m.head.height;
        const bodyBottom = m.subject.y + m.subject.height;
        if (bodyBottom - headBottom > 0.15) score += 10;
      }
      if (m.petCount > 1) score -= 8;
      break;
    }
    case "square": {
      const cx = Math.abs(m.bodyCenter.x - 0.5);
      const cy = Math.abs(m.bodyCenter.y - 0.5);
      score += clampScore(100 - (cx + cy) * 120) * 0.2;
      if (m.bodyAspect >= 0.75 && m.bodyAspect <= 1.35) score += 14;
      if (m.faceToBody >= 0.25 && m.faceToBody <= 0.55) score += 10;
      break;
    }
    case "circle": {
      if (m.faceToBody >= 0.4) score += 24;
      else if (m.faceToBody >= 0.28) score += 12;
      else score -= 18;
      if (m.faceArea >= 0.035) score += 14;
      else if (m.faceArea < 0.015) score -= 12;
      const hc =
        Math.abs(m.headCenter.x - 0.5) + Math.abs(m.headCenter.y - 0.5);
      score += clampScore(100 - hc * 140) * 0.15;
      if (m.petCount > 1) score -= 15;
      if (m.bodyAspect > 1.4 || m.bodyAspect < 0.6) score -= 8;
      break;
    }
  }

  return clampScore(score);
}

export function scoreMaskFit(
  frame: SmartCropFrame,
  quality: SmartCropQuality,
): number {
  if (frame.mask !== "circle") {
    return clampScore(70 + quality.maskSafety * 0.3);
  }
  const ms = quality.maskSafety;
  if (ms >= 90) return 100;
  if (ms >= 80) return 88;
  if (ms >= 75) return 78;
  if (ms >= 60) return 45;
  return clampScore(ms * 0.5);
}

export function scoreCompositionFit(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  crop: SmartCropTransform,
  quality: SmartCropQuality,
): number {
  const m = subjectMetrics(analysis);
  const offsetX = Math.abs(m.bodyCenter.x - 0.5);
  const offsetY = Math.abs(m.bodyCenter.y - 0.5);

  let score = quality.composition * 0.55;

  if (analysis.pets.length === 0) {
    // Focal-led composition when detection failed
    const fx = Math.abs(analysis.focalPoint.x - 0.5);
    const fy = Math.abs(analysis.focalPoint.y - 0.5);
    score = 50 + clampScore(100 - (fx + fy) * 120) * 0.4;
    if (frame.role === analysis.orientation) score += 10;
    if (frame.role === "circle") score -= 8;
    return clampScore(score);
  }

  if (frame.role === "landscape") {
    if (offsetX >= 0.08 && offsetX <= 0.28) score += 18;
    else if (offsetX < 0.08) score += 8;
    else score += 4;
    if (m.whitespace >= 0.45) score += 8;
  } else if (frame.role === "portrait") {
    if (offsetY <= 0.2) score += 12;
    if (m.headCenter.y < 0.45) score += 8;
  } else if (frame.role === "square") {
    if (offsetX + offsetY < 0.22) score += 16;
    else score += 4;
  } else if (frame.role === "circle") {
    const hc =
      Math.abs(m.headCenter.x - 0.5) + Math.abs(m.headCenter.y - 0.5);
    score += clampScore(100 - hc * 160) * 0.35;
  }

  const dx = Math.abs(crop.x - m.headCenter.x);
  const dy = Math.abs(crop.y - m.headCenter.y);
  score += clampScore(100 - Math.sqrt(dx * dx + dy * dy) * 180) * 0.15;

  return clampScore(score);
}

export function scoreFallbackScore(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  quality: SmartCropQuality,
  aspect: number,
): number {
  const w = SMART_CROP_CONFIG.frameMatch.fallback.weights;
  return clampScore(
    quality.faceSafety * w.faceSafety +
      quality.headSafety * w.headSafety +
      quality.subjectCoverage * w.subjectCoverage +
      quality.bodySafety * w.bodySafety +
      quality.maskSafety * w.maskSafety +
      quality.subjectScale * w.subjectScale +
      quality.composition * w.composition +
      aspect * w.aspect,
  );
}

function mapRejectReasons(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  quality: SmartCropQuality,
): FrameMatchRejectReason[] {
  const reasons: FrameMatchRejectReason[] = [];
  const hr = SMART_CROP_CONFIG.hardReject;
  const circleMin = SMART_CROP_CONFIG.frameMatch.circleMaskMin;

  if (quality.rejected) {
    reasons.push("CROP_HARD_REJECT");
    const raw = quality.rejectReason ?? "";
    if (/faceSafety/i.test(raw)) reasons.push("FACE_SAFETY_TOO_LOW");
    if (/headSafety/i.test(raw)) reasons.push("HEAD_SAFETY_TOO_LOW");
    if (/maskSafety/i.test(raw)) reasons.push("MASK_SAFETY_TOO_LOW");
    if (/subjectCoverage|multi/i.test(raw))
      reasons.push("MULTI_SUBJECT_COVERAGE_TOO_LOW");
  }

  if (frame.mask === "circle") {
    if (quality.maskSafety < circleMin) {
      if (!reasons.includes("MASK_SAFETY_TOO_LOW")) {
        reasons.push("MASK_SAFETY_TOO_LOW");
      }
      reasons.push("CIRCLE_NOT_SUITABLE");
    }
  }

  if (analysis.pets.length > 0) {
    if (
      quality.faceSafety < hr.faceSafety &&
      !reasons.includes("FACE_SAFETY_TOO_LOW")
    ) {
      reasons.push("FACE_SAFETY_TOO_LOW");
    }
    if (
      quality.headSafety < hr.headSafety &&
      !reasons.includes("HEAD_SAFETY_TOO_LOW")
    ) {
      reasons.push("HEAD_SAFETY_TOO_LOW");
    }
  }

  return [...new Set(reasons)];
}

function isUnusable(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  quality: SmartCropQuality,
): { unusable: boolean; reasons: FrameMatchRejectReason[] } {
  const fb = SMART_CROP_CONFIG.frameMatch.fallback;
  const reasons: FrameMatchRejectReason[] = [];

  if (analysis.pets.length > 0) {
    if (quality.faceSafety < fb.unusableFaceSafety) {
      reasons.push("FACE_SAFETY_TOO_LOW");
    }
    if (quality.subjectCoverage < fb.unusableSubjectCoverage) {
      reasons.push("SUBJECT_INVISIBLE");
    }
    if (quality.faceSafety < 40) {
      reasons.push("FACE_MOSTLY_OUTSIDE");
    }
  }

  if (frame.mask === "circle") {
    if (quality.maskSafety < fb.unusableCircleMaskSafety) {
      reasons.push("MASK_SAFETY_TOO_LOW");
      reasons.push("CIRCLE_NOT_SUITABLE");
    }
    if (
      analysis.pets.length > 0 &&
      quality.faceSafety < fb.unusableCircleFaceSafety
    ) {
      reasons.push("FACE_MOSTLY_OUTSIDE");
      reasons.push("CIRCLE_NOT_SUITABLE");
    }
  }

  return { unusable: reasons.length > 0, reasons: [...new Set(reasons)] };
}

function buildWarnings(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  quality: SmartCropQuality,
  tier: FrameMatchTier,
): FrameMatchWarning[] {
  const warnings: FrameMatchWarning[] = [];
  const hr = SMART_CROP_CONFIG.hardReject;

  if (petDetectionConfidence(analysis) < 0.45 || analysis.pets.length === 0) {
    warnings.push("PET_DETECTION_LOW_CONFIDENCE");
  }
  if (quality.headSafety < hr.headSafety) warnings.push("HEAD_SAFETY_LOW");
  if (quality.faceSafety < hr.faceSafety) warnings.push("FACE_SAFETY_LOW");
  if (
    frame.mask === "circle" &&
    quality.maskSafety < SMART_CROP_CONFIG.frameMatch.circleMaskMin
  ) {
    warnings.push("MASK_SAFETY_LOW");
  }
  if (
    frame.mask === "circle" &&
    quality.maskSafety >= SMART_CROP_CONFIG.frameMatch.circleMaskMin &&
    quality.maskSafety < 85
  ) {
    warnings.push("CIRCLE_MARGIN_TIGHT");
  }
  if (tier === "fallback") {
    warnings.push("NEEDS_ADJUSTMENT");
  }
  return [...new Set(warnings)];
}

function fallbackReasonText(
  rejectReasons: FrameMatchRejectReason[],
  warnings: FrameMatchWarning[],
): string | undefined {
  if (rejectReasons.includes("HEAD_SAFETY_TOO_LOW") || warnings.includes("HEAD_SAFETY_LOW")) {
    return "頭部余白が少ないため微調整推奨";
  }
  if (rejectReasons.includes("FACE_SAFETY_TOO_LOW") || warnings.includes("FACE_SAFETY_LOW")) {
    return "顔の余白が少ないため微調整推奨";
  }
  if (rejectReasons.includes("MASK_SAFETY_TOO_LOW")) {
    return "マスク境界が狭いため別Frameまたは調整推奨";
  }
  if (warnings.includes("PET_DETECTION_LOW_CONFIDENCE")) {
    return "ペット検出が不確実なため仮配置です";
  }
  return "STRICT条件未達のため妥協案を採用";
}

function applyMultiplePetBonus(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  cropOverall: number,
  subjectFit: number,
): number {
  if (analysis.pets.length <= 1) return subjectFit;
  const bonus = SMART_CROP_CONFIG.frameMatch.multiplePetBonus;
  if (cropOverall < bonus.minCropOverall) return subjectFit;
  const add =
    frame.role === "landscape"
      ? bonus.landscape
      : frame.role === "square"
        ? bonus.square
        : frame.role === "portrait"
          ? bonus.portrait
          : bonus.circle;
  return clampScore(subjectFit + add);
}

function tierRank(t: FrameMatchTier): number {
  if (t === "strict") return 0;
  if (t === "fallback") return 1;
  return 2;
}

export function scoreFrameMatch(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  crop: SmartCropTransform,
  quality: SmartCropQuality,
): FrameMatchResult {
  const aspect = scoreAspectCompatibility(analysis, frame);
  const cropQuality = scoreCropQuality(quality);
  let subjectFit = scoreSubjectFit(analysis, frame);
  subjectFit = applyMultiplePetBonus(
    analysis,
    frame,
    quality.overall,
    subjectFit,
  );
  const maskFit = scoreMaskFit(frame, quality);
  const compositionFit = scoreCompositionFit(
    analysis,
    frame,
    crop,
    quality,
  );

  const w = SMART_CROP_CONFIG.frameMatch.weights;
  let matchScore = clampScore(
    aspect * w.aspect +
      cropQuality * w.cropQuality +
      subjectFit * w.subjectFit +
      maskFit * w.maskFit +
      compositionFit * w.compositionFit,
  );

  const fallbackScore = scoreFallbackScore(analysis, frame, quality, aspect);

  let rejectReasons = mapRejectReasons(analysis, frame, quality);
  const unusable = isUnusable(analysis, frame, quality);
  if (unusable.unusable) {
    rejectReasons = [...new Set([...rejectReasons, ...unusable.reasons])];
  }

  let matchTier: FrameMatchTier;
  if (unusable.unusable) {
    matchTier = "unusable";
  } else if (rejectReasons.length > 0) {
    matchTier = "fallback";
  } else {
    matchTier = "strict";
  }

  // pets=0 never qualifies as STRICT circle; keep circle as fallback/unusable
  if (
    analysis.pets.length === 0 &&
    frame.mask === "circle" &&
    matchTier === "strict"
  ) {
    matchTier = "fallback";
    rejectReasons = [...rejectReasons, "CIRCLE_NOT_SUITABLE"];
  }

  if (matchTier !== "strict") {
    matchScore = Math.min(matchScore, matchTier === "unusable" ? 40 : 72);
  }

  const warnings = buildWarnings(analysis, frame, quality, matchTier);
  const needsAdjustment = matchTier === "fallback";
  const fallbackReason =
    matchTier === "fallback"
      ? fallbackReasonText(rejectReasons, warnings)
      : undefined;

  return {
    frameId: frame.id,
    frame,
    crop,
    quality,
    compatibility: {
      aspect,
      cropQuality,
      subjectFit,
      maskFit,
      compositionFit,
    },
    matchScore,
    fallbackScore,
    rejected: matchTier !== "strict",
    rejectReasons,
    matchTier,
    warnings,
    fallbackReason,
    needsAdjustment,
  };
}

function sortRanking(ranking: FrameMatchResult[]): void {
  ranking.sort((a, b) => {
    const tr = tierRank(a.matchTier) - tierRank(b.matchTier);
    if (tr !== 0) return tr;
    if (a.matchTier === "strict") return b.matchScore - a.matchScore;
    // fallback & unusable: safety-first
    return b.fallbackScore - a.fallbackScore;
  });
}

function finalizeRanking(ranking: FrameMatchResult[]): FrameMatchRanking {
  sortRanking(ranking);

  const strict = ranking.filter((r) => r.matchTier === "strict");
  const fallback = ranking.filter((r) => r.matchTier === "fallback");

  let best: FrameMatchResult | null = null;
  let mode: FrameMatchRanking["mode"] = "none";

  if (strict.length > 0) {
    best = strict[0];
    mode = "strict";
  } else if (fallback.length > 0) {
    best = {
      ...fallback[0],
      warnings: [
        ...new Set([
          ...fallback[0].warnings,
          "FALLBACK_BEST" as FrameMatchWarning,
          "NEEDS_ADJUSTMENT" as FrameMatchWarning,
        ]),
      ],
      needsAdjustment: true,
      fallbackReason:
        fallback[0].fallbackReason ??
        fallbackReasonText(fallback[0].rejectReasons, fallback[0].warnings),
    };
    mode = "fallback";
    // Reflect best warnings onto ranking entry
    const idx = ranking.findIndex((r) => r.frameId === best!.frameId);
    if (idx >= 0) ranking[idx] = best;
  }

  return { best, ranking, mode };
}

export function findBestFrameForPhoto(
  analysis: SmartCropPhotoAnalysis,
  frames: SmartCropFrame[] = SMART_CROP_FRAMES,
): FrameMatchRanking {
  const ranking: FrameMatchResult[] = frames.map((frame) => {
    const { crop, quality } = computeSmartCrop(analysis, frame);
    return scoreFrameMatch(analysis, frame, crop, quality);
  });
  return finalizeRanking(ranking);
}

export function rankFramesFromCropResults(
  analysis: SmartCropPhotoAnalysis,
  cropResults: Array<{
    frame: SmartCropFrame;
    aiCrop: SmartCropTransform;
    quality: SmartCropQuality;
  }>,
): FrameMatchRanking {
  const ranking: FrameMatchResult[] = cropResults.map((r) =>
    scoreFrameMatch(analysis, r.frame, r.aiCrop, r.quality),
  );
  return finalizeRanking(ranking);
}

export const FRAME_MATCH_REJECT_LABELS: Record<
  FrameMatchRejectReason,
  string
> = {
  MASK_SAFETY_TOO_LOW: "マスク安全性が不足",
  FACE_SAFETY_TOO_LOW: "顔の安全余白が不足",
  HEAD_SAFETY_TOO_LOW: "頭の安全余白が不足",
  MULTI_SUBJECT_COVERAGE_TOO_LOW: "複数ペットの収まりが不足",
  CROP_HARD_REJECT: "Smart CropがHard Reject",
  CIRCLE_NOT_SUITABLE: "Circle向きではない",
  FACE_MOSTLY_OUTSIDE: "顔の大半が欠ける",
  SUBJECT_INVISIBLE: "主要被写体が見えない",
};

export const FRAME_MATCH_WARNING_LABELS: Record<FrameMatchWarning, string> = {
  HEAD_SAFETY_LOW: "頭部余白が少ないため微調整推奨",
  FACE_SAFETY_LOW: "顔の余白が少ないため微調整推奨",
  MASK_SAFETY_LOW: "マスク境界が狭い",
  PET_DETECTION_LOW_CONFIDENCE: "ペット検出の確信度が低い",
  FALLBACK_BEST: "STRICT候補なしのため妥協案を採用",
  NEEDS_ADJUSTMENT: "位置の微調整を推奨",
  CIRCLE_MARGIN_TIGHT: "Circle余白がやや狭い",
};

export function debugHeadOccupancy(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
  crop: SmartCropTransform,
): number {
  const head = combinedHeadSafeArea(analysis);
  if (!head) return 0;
  const face = analysis.pets[0]?.face
    ? headSafeAreaFromFace(normalizeRect(analysis.pets[0].face))
    : head;
  const imageAspect = photoAspect(analysis);
  const window = visibleWindow(
    imageAspect,
    frame.aspectRatio,
    crop.scale,
    crop.x,
    crop.y,
  );
  return occupancyRatio(face, window);
}
