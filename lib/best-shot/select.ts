import { BEST_SHOT_CONFIG, BEST_SHOT_VERSION } from "./config.ts";
import {
  duplicationPenalty,
  geometrySimilarity,
  scoreBestShotPhoto,
  sharpnessBaseline,
  visualSimilarity,
} from "./score.ts";
import type {
  BestShotCandidate,
  BestShotGroupInput,
  BestShotPhoto,
  BestShotResult,
  BestShotScores,
} from "./types.ts";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function selectionConfidence(gap: number, count: number, groupConfidence: number) {
  if (count <= 1) return 1;
  const raw = Math.min(0.95, 0.62 + gap / 40);
  const cap = Math.min(1, groupConfidence + BEST_SHOT_CONFIG.confidenceHeadroom);
  return round2(Math.min(raw, cap));
}

function axisLeads(primary: BestShotScores, other: BestShotScores) {
  return [
    ["表情", primary.expression - other.expression],
    ["ペットの見え方", primary.petVisibility - other.petVisibility],
    ["構図", primary.composition - other.composition],
    ["思い出の価値", primary.memoryValue - other.memoryValue],
    ["場面らしさ", primary.sceneRepresentativeness - other.sceneRepresentativeness],
    ["ほかの写真との違い", primary.relativeUniqueness - other.relativeUniqueness],
    ["ピント", primary.sharpness - other.sharpness],
  ]
    .filter((entry) => Number(entry[1]) >= 8)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map((entry) => String(entry[0]));
}

function primaryReason(primary: BestShotScores, runnerUp: BestShotScores | null) {
  if (!runnerUp) return "この場面の写真は1枚なので、それを代表にします。";
  const leads = axisLeads(primary, runnerUp);
  if (leads.length === 0) {
    return "点差は小さいですが、表情と見え方のバランスでこの写真を代表にします。";
  }
  return `${leads.join("・")}がこの場面の中で高く、代表に向いています。`;
}

function complements(
  primary: BestShotCandidate,
  candidate: BestShotCandidate,
  similarity: number,
  group: BestShotGroupInput,
) {
  const rule = BEST_SHOT_CONFIG.secondary;
  if (similarity > rule.maxSimilarity) return false;
  if (candidate.scores.memoryValue < rule.minMemory) return false;
  const expressionGap = Math.abs(primary.scores.expression - candidate.scores.expression);
  const compositionGap = Math.abs(primary.scores.composition - candidate.scores.composition);
  const placement = geometrySimilarity(group, primary.photoId, candidate.photoId);
  const poseDiffers = placement !== null && placement <= rule.maxGeometry;
  const expressionDiffers = expressionGap >= rule.minAxisGap;
  const compositionDiffers = compositionGap >= rule.minAxisGap;
  if (placement !== null && placement > rule.maxGeometry && !expressionDiffers && !compositionDiffers) {
    return false;
  }
  return expressionDiffers || compositionDiffers || poseDiffers;
}

function withPenalty(
  candidate: BestShotCandidate,
  primary: BestShotCandidate,
  group: BestShotGroupInput,
): BestShotCandidate {
  if (candidate.photoId === primary.photoId) return candidate;
  const penalty = duplicationPenalty(visualSimilarity(group, primary.photoId, candidate.photoId));
  return {
    ...candidate,
    scores: { ...candidate.scores, duplicationPenalty: penalty },
  };
}

/**
 * Rank one scene group.
 * A single photo stays the primary without a contest.
 */
export function selectBestShot(group: BestShotGroupInput, photos: BestShotPhoto[]): BestShotResult {
  const members = photos.filter((photo) => photo.photoId);
  const ordered = [...members].sort((a, b) => a.photoId.localeCompare(b.photoId));
  if (ordered.length === 0) {
    return {
      groupId: group.id,
      primaryPhotoId: "",
      ranking: [],
      confidence: 0,
      reason: "写真がありません。",
      warnings: [],
      analysisVersion: BEST_SHOT_VERSION,
    };
  }

  const warnings = group.warnings.includes("AMBIGUOUS_GROUP") ? ["GROUP_AMBIGUOUS"] : [];

  if (ordered.length === 1) {
    const only = ordered[0];
    const scores = scoreBestShotPhoto(only, group, only.sharpness);
    return {
      groupId: group.id,
      primaryPhotoId: only.photoId,
      ranking: [{ photoId: only.photoId, scores, rank: 1, role: "primary" }],
      confidence: 1,
      reason: "この場面の写真は1枚なので、それを代表にします。",
      warnings,
      analysisVersion: BEST_SHOT_VERSION,
    };
  }

  const baseline = sharpnessBaseline(ordered);
  const scored = ordered
    .map((photo) => ({
      photoId: photo.photoId,
      scores: scoreBestShotPhoto(photo, group, baseline),
      rank: 0,
      role: "alternate" as const,
    }))
    .sort((a, b) => b.scores.overall - a.scores.overall || a.photoId.localeCompare(b.photoId));

  const primary = scored[0];
  const penalized = scored.map((candidate) => withPenalty(candidate, primary, group));
  const secondary = pickSecondary(penalized, primary, group);
  const ranking: BestShotCandidate[] = penalized.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    role:
      candidate.photoId === primary.photoId
        ? "primary"
        : candidate.photoId === secondary?.photoId
          ? "secondary"
          : "alternate",
  }));
  const runnerUp = ranking[1]?.scores ?? null;
  const gap = primary.scores.overall - (runnerUp?.overall ?? primary.scores.overall);

  return {
    groupId: group.id,
    primaryPhotoId: primary.photoId,
    secondaryPhotoId: secondary?.photoId,
    ranking,
    confidence: selectionConfidence(gap, ordered.length, group.groupConfidence),
    reason: primaryReason(primary.scores, runnerUp),
    secondaryReason: secondary ? "代表写真とは見え方が違い、同じ場面を補う写真です。" : undefined,
    warnings,
    analysisVersion: BEST_SHOT_VERSION,
  };
}

function pickSecondary(
  ranking: BestShotCandidate[],
  primary: BestShotCandidate,
  group: BestShotGroupInput,
) {
  const rule = BEST_SHOT_CONFIG.secondary;
  if (ranking.length < rule.minGroupSize) return undefined;
  let best: BestShotCandidate | undefined;
  for (const candidate of ranking) {
    if (candidate.photoId === primary.photoId) continue;
    const similarity = visualSimilarity(group, primary.photoId, candidate.photoId);
    if (!complements(primary, candidate, similarity, group)) continue;
    const adjusted = candidate.scores.overall - candidate.scores.duplicationPenalty;
    if (adjusted < rule.minScore) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    const bestAdjusted = best.scores.overall - best.scores.duplicationPenalty;
    if (adjusted > bestAdjusted) best = candidate;
  }
  return best;
}
