import { scorePhotoComposition } from "./composition.ts";
import {
  PHOTO_INTELLIGENCE_CONFIG,
  PHOTO_INTELLIGENCE_VERSION,
} from "./config.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";
import type {
  PhotoIntelligence,
  PhotoIntelligenceVision,
  ScoreAxes,
  TechnicalQualityResult,
} from "./types.ts";
import { scorePetVisibility } from "./visibility.ts";
import { collectVisionTags } from "./vision-parse.ts";

function score100(n: number, fallback = 50) {
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export function computeOverallScore(
  axes: ScoreAxes,
  weights = PHOTO_INTELLIGENCE_CONFIG.weights,
): number {
  const raw =
    axes.technicalQuality * weights.technicalQuality +
    axes.petVisibility * weights.petVisibility +
    axes.expression * weights.expression +
    axes.composition * weights.composition +
    axes.uniqueness * weights.uniqueness +
    axes.memoryValue * weights.memoryValue;

  let penalty = 0;
  const { below, max, momentCap } = PHOTO_INTELLIGENCE_CONFIG.technicalPenalty;
  if (axes.technicalQuality < below) {
    const span = (below - axes.technicalQuality) / below;
    penalty = span * max;
    const moment = (axes.expression + axes.memoryValue) / 2;
    if (moment >= 90) penalty = Math.min(penalty, momentCap);
  }
  return score100(raw - penalty);
}

const FLAG_REASONS: Record<string, string> = {
  CORRUPT_IMAGE: "画像データを読み取れませんでした。",
  BLACK_IMAGE: "ほぼ真っ黒で、被写体を確認できません。",
  EXTREME_BLUR: "ブレが強く、被写体の形がほとんど残っていません。",
  NO_SUBJECT: "ペットがほぼ写っていません。",
};

export function buildPhotoIntelligence(input: {
  photoId: string;
  analysis: SmartCropPhotoAnalysis;
  technical: TechnicalQualityResult;
  vision: PhotoIntelligenceVision | null;
  visionFailed: boolean;
}): PhotoIntelligence {
  const { photoId, analysis, technical, vision, visionFailed } = input;
  const unusable =
    technical.flags.includes("CORRUPT_IMAGE") || technical.flags.includes("BLACK_IMAGE");
  const visibility = scorePetVisibility(analysis, {
    eyesVisible: vision?.eyesVisible ?? null,
    activity: vision?.petActivity ?? null,
    petPresent: vision?.petPresent ?? null,
  });
  const composition = scorePhotoComposition(analysis);
  const fallback = PHOTO_INTELLIGENCE_CONFIG.fallback;
  const petVisible = analysis.pets.length > 0 || vision?.petPresent === true;

  const expression = vision
    ? score100(vision.expressionScore)
    : unusable
      ? 18
      : fallback.expression;
  const uniqueness = vision
    ? score100(vision.uniquenessScore)
    : unusable
      ? 15
      : fallback.uniqueness;
  const memoryValue = vision
    ? score100(vision.memoryValueScore)
    : unusable
      ? 12
      : petVisible
        ? fallback.memoryValue
        : fallback.memoryValueNoPet;

  const axes: ScoreAxes = {
    technicalQuality: score100(technical.technicalQuality, 0),
    petVisibility: visibility.score,
    expression,
    composition: composition.score,
    uniqueness,
    memoryValue,
  };

  const warnings: string[] = [...technical.flags];
  if (!technical.signals.pixelsKnown && technical.signals.readable) {
    warnings.push("TECHNICAL_PIXELS_UNAVAILABLE");
  }
  if (visionFailed) warnings.push("VISION_ANALYSIS_FAILED");
  if (unusable && !vision) warnings.push("VISION_SKIPPED_UNUSABLE_IMAGE");
  if (
    analysis.pets.length === 0 &&
    vision?.petPresent === false &&
    !unusable
  ) {
    warnings.push("NO_SUBJECT");
  } else if (analysis.pets.length === 0 && vision?.petPresent) {
    warnings.push("GEOMETRY_PET_MISS");
  }
  const detection = analysis.analysisConfidence?.petDetection;
  if (typeof detection === "number" && detection < 0.45 && analysis.pets.length > 0) {
    warnings.push("PET_DETECTION_LOW_CONFIDENCE");
  }

  let confidence = vision ? vision.confidence : fallback.confidence;
  if (vision && typeof detection === "number") {
    confidence = confidence * 0.75 + detection * 0.25;
  }
  if (!technical.signals.pixelsKnown) confidence *= 0.9;
  if (analysis.pets.length === 0) confidence = Math.min(confidence, 0.55);
  if (visionFailed) confidence = Math.min(confidence, fallback.confidence);
  confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
  if (confidence < 0.55) warnings.push("LOW_CONFIDENCE");

  const reasons: string[] = [];
  for (const flag of ["CORRUPT_IMAGE", "BLACK_IMAGE", "EXTREME_BLUR", "NO_SUBJECT"]) {
    if (warnings.includes(flag) && FLAG_REASONS[flag]) reasons.push(FLAG_REASONS[flag]);
  }
  if (vision?.reason) reasons.push(vision.reason);
  else if (visionFailed) {
    reasons.push("意味の評価は取得できなかったため、技術品質と見え方からの暫定スコアです。");
  }
  for (const note of [...visibility.notes, ...composition.notes]) {
    if (reasons.length >= 4) break;
    if (!reasons.includes(note)) reasons.push(note);
  }

  const tags = vision ? collectVisionTags(vision) : [];
  const status = warnings.some((warning) =>
    ["CORRUPT_IMAGE", "BLACK_IMAGE", "EXTREME_BLUR", "NO_SUBJECT"].includes(warning),
  )
    ? "low_quality"
    : "ok";

  return {
    photoId,
    ...axes,
    overallScore: computeOverallScore(axes),
    confidence,
    tags,
    reasons: reasons.slice(0, 4),
    warnings,
    analysisVersion: PHOTO_INTELLIGENCE_VERSION,
    status,
  };
}
