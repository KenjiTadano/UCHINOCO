import { BEST_SHOT_CONFIG } from "./config.ts";
import type { BestShotGroupInput, BestShotPhoto, BestShotScores } from "./types.ts";
import { activityConflict } from "../photo-grouping/semantic.ts";

const ACTIVITIES = ["sleeping", "playing", "eating", "looking_camera", "cuddling", "walking"];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function score100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(clamp(n, 0, 100));
}

export function visualPairKey(photoA: string, photoB: string) {
  return photoA < photoB ? `${photoA}|${photoB}` : `${photoB}|${photoA}`;
}

export function visualSimilarity(
  group: BestShotGroupInput,
  photoA: string,
  photoB: string,
): number {
  if (photoA === photoB) return 100;
  const value = group.visualSimilarity[visualPairKey(photoA, photoB)];
  return Number.isFinite(value) ? score100(value) : 50;
}

export function geometrySimilarity(
  group: BestShotGroupInput,
  photoA: string,
  photoB: string,
): number | null {
  if (photoA === photoB) return 100;
  const value = group.geometrySimilarity?.[visualPairKey(photoA, photoB)];
  return Number.isFinite(value) ? score100(value ?? 0) : null;
}

function activityOf(tags: string[]) {
  return tags.find((tag) => ACTIVITIES.includes(tag)) ?? null;
}

/** How well this photo stands for the group's shared scene. Small weight on purpose. */
export function scoreSceneRepresentativeness(tags: string[], group: BestShotGroupInput): number {
  if (!group.scene && !group.activity && group.tags.length === 0) return 60;
  let score = 48;
  if (group.scene) score += tags.includes(group.scene) ? 22 : -8;
  if (group.activity) {
    const activity = activityOf(tags);
    if (activity === group.activity) score += 22;
    else if (activityConflict(activity, group.activity)) score -= 12;
    else score += 4;
  }
  if (group.tags.length > 0) {
    const set = new Set(tags);
    const hit = group.tags.filter((tag) => set.has(tag)).length;
    score += Math.round((hit / group.tags.length) * 16);
  }
  return score100(score);
}

function uniquenessContribution(photo: BestShotPhoto, technical: number, visibility: number) {
  const raw = photo.relativeUniqueness;
  if (
    raw >= BEST_SHOT_CONFIG.uniquenessGuard &&
    (technical < BEST_SHOT_CONFIG.uniquenessGuardQuality ||
      visibility < BEST_SHOT_CONFIG.uniquenessGuardQuality)
  ) {
    return BEST_SHOT_CONFIG.uniquenessGuardCap;
  }
  return raw;
}

function hardPenalty(photo: BestShotPhoto, technical: number, visibility: number) {
  const intelligence = photo.intelligence;
  const penalties = BEST_SHOT_CONFIG.penalties;
  let amount = 0;
  if (visibility < penalties.lowVisibility) amount += penalties.lowVisibilityAmount;
  if (technical < penalties.lowTechnical) amount += penalties.lowTechnicalAmount;
  if ((intelligence?.confidence ?? 0) < penalties.lowConfidence) amount += penalties.lowConfidenceAmount;
  if (intelligence?.warnings.includes("VISION_ANALYSIS_FAILED")) amount += penalties.visionFailedAmount;
  if (intelligence?.status === "low_quality") amount += penalties.lowQualityAmount;
  return amount;
}

export function duplicationPenalty(similarity: number) {
  const rule = BEST_SHOT_CONFIG.duplication;
  if (similarity > rule.strongSimilarity) return rule.strongPenalty;
  if (similarity > rule.softSimilarity) return rule.softPenalty;
  if (similarity > rule.mildSimilarity) return rule.mildPenalty;
  return 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Best-shot score before the duplication penalty. Singleton selection does not use this to choose. */
export function scoreBestShotPhoto(
  photo: BestShotPhoto,
  group: BestShotGroupInput,
  sharpnessBaseline: number,
): BestShotScores {
  const intelligence = photo.intelligence;
  const photoIntelligence = intelligence?.overallScore ?? 40;
  const expression = intelligence?.expression ?? 40;
  const petVisibility = intelligence?.petVisibility ?? 40;
  const technical = intelligence?.technicalQuality ?? 40;
  const composition = intelligence?.composition ?? 40;
  const memoryValue = intelligence?.memoryValue ?? 40;
  const sceneRepresentativeness = scoreSceneRepresentativeness(intelligence?.tags ?? [], group);
  const relativeUniqueness = uniquenessContribution(photo, technical, petVisibility);
  const weights = BEST_SHOT_CONFIG.weights;
  const weighted =
    photoIntelligence * weights.photoIntelligence +
    expression * weights.expression +
    petVisibility * weights.petVisibility +
    technical * weights.technical +
    composition * weights.composition +
    memoryValue * weights.memoryValue +
    relativeUniqueness * weights.relativeUniqueness +
    sceneRepresentativeness * weights.sceneRepresentativeness;
  const lift = clamp(
    (photo.sharpness - sharpnessBaseline) * BEST_SHOT_CONFIG.sharpnessLiftPerPoint,
    -BEST_SHOT_CONFIG.sharpnessLiftCap,
    BEST_SHOT_CONFIG.sharpnessLiftCap,
  );
  const overall = score100(weighted + lift - hardPenalty(photo, technical, petVisibility));
  return {
    photoIntelligence: score100(photoIntelligence),
    expression: score100(expression),
    petVisibility: score100(petVisibility),
    technical: score100(technical),
    composition: score100(composition),
    memoryValue: score100(memoryValue),
    relativeUniqueness: score100(photo.relativeUniqueness),
    sharpness: score100(photo.sharpness),
    duplicationPenalty: 0,
    sceneRepresentativeness,
    overall,
  };
}

export function sharpnessBaseline(photos: BestShotPhoto[]) {
  return median(photos.map((photo) => photo.sharpness));
}
