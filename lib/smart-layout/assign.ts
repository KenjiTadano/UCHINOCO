/**
 * Task050 — Photo × Slot assignment via full permutation (1–4 photos).
 */
import { computeSmartCrop } from "../smart-crop/compute.ts";
import { scoreFrameMatch } from "../smart-crop/frame-match.ts";
import { sanitizeCropTransform } from "../smart-crop/transform.ts";
import type { FrameMatchResult } from "../smart-crop/types.ts";
import { SMART_LAYOUT_CONFIG } from "./config.ts";
import { resolveCropFrame } from "./frames.ts";
import { scoreLayoutBalance } from "./balance.ts";
import { scoreRoleFit } from "./role-fit.ts";
import { scoreVisualVariety } from "./variety.ts";
import type {
  AlbumFrameDefinition,
  AlbumLayoutDefinition,
  LayoutAssignment,
  LayoutMatchResult,
  LayoutMatchTier,
  LayoutPhotoInput,
  LayoutScores,
} from "./types.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) {
      out.push([items[i], ...p]);
    }
  }
  return out;
}

type Cell = {
  frameMatch: FrameMatchResult;
  crop: ReturnType<typeof computeSmartCrop>["crop"];
  quality: ReturnType<typeof computeSmartCrop>["quality"];
};

function buildMatchMatrix(
  photos: LayoutPhotoInput[],
  frames: AlbumFrameDefinition[],
): Cell[][] {
  return photos.map((photo) =>
    frames.map((frame) => {
      const cropFrame = resolveCropFrame(frame.cropShapeId);
      const { crop, quality } = computeSmartCrop(photo.analysis, cropFrame);
      const safeCrop = sanitizeCropTransform(crop);
      const frameMatch = scoreFrameMatch(
        photo.analysis,
        cropFrame,
        safeCrop,
        quality,
      );
      return { frameMatch, crop: safeCrop, quality };
    }),
  );
}

function buildAssignment(
  photos: LayoutPhotoInput[],
  frames: AlbumFrameDefinition[],
  photoOrder: LayoutPhotoInput[],
  matrix: Cell[][],
): LayoutAssignment[] {
  return frames.map((frame, fi) => {
    const photo = photoOrder[fi];
    const photoIndex = photos.findIndex((p) => p.photoId === photo.photoId);
    const cell = matrix[photoIndex][fi];
    return {
      photoId: photo.photoId,
      frameId: frame.id,
      cropShapeId: frame.cropShapeId,
      slotRole: frame.slotRole,
      importance: frame.importance,
      frameMatch: cell.frameMatch,
      crop: cell.crop,
      quality: cell.quality,
      cropFrame: resolveCropFrame(frame.cropShapeId),
    };
  });
}

function assignmentTier(assignments: LayoutAssignment[]): LayoutMatchTier {
  if (assignments.some((a) => a.frameMatch.matchTier === "unusable")) {
    return "unusable";
  }
  if (assignments.some((a) => a.frameMatch.matchTier === "fallback")) {
    return "fallback";
  }
  return "strict";
}

function scoreAssignment(
  layout: AlbumLayoutDefinition,
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
): LayoutScores {
  const frameMatching = clampScore(
    assignments.reduce((s, a) => {
      const base =
        a.frameMatch.matchTier === "strict"
          ? a.frameMatch.matchScore
          : a.frameMatch.matchTier === "fallback"
            ? a.frameMatch.fallbackScore * 0.85
            : 20;
      return s + base * Math.max(a.importance, 0.4);
    }, 0) /
      Math.max(
        assignments.reduce((s, a) => s + Math.max(a.importance, 0.4), 0),
        0.01,
      ),
  );

  const roleFit = scoreRoleFit(photos, assignments);
  const balance = scoreLayoutBalance(photos, assignments);
  const variety = scoreVisualVariety(photos, assignments);
  const cropQuality = clampScore(
    assignments.reduce((s, a) => s + a.quality.overall * a.importance, 0) /
      Math.max(
        assignments.reduce((s, a) => s + a.importance, 0),
        0.01,
      ),
  );

  const w = SMART_LAYOUT_CONFIG.assignmentWeights;
  let overall = clampScore(
    frameMatching * w.frameMatch +
      roleFit * w.roleFit +
      balance * w.layoutBalance +
      variety * w.visualVariety +
      cropQuality * w.cropQuality,
  );

  const tier = assignmentTier(assignments);
  if (tier === "strict") overall = clampScore(overall + SMART_LAYOUT_CONFIG.tier.allStrictBonus);
  if (tier === "fallback")
    overall = clampScore(overall - SMART_LAYOUT_CONFIG.tier.anyFallbackPenalty);
  if (tier === "unusable") overall = Math.min(overall, 35);

  overall = applyLayoutAffinity(layout, photos, assignments, overall);
  overall = clampScore(overall + storyHierarchyDelta(photos, assignments));

  return {
    frameMatching,
    roleFit,
    balance,
    variety,
    cropQuality,
    overall,
  };
}

/**
 * Story roles nudge which photo lands in the larger slot.
 * No effect unless a photo sets storyRole, so Task050 stays put.
 * Two primaries prefer even frames. A secondary should not outrank its primary.
 */
export function storyHierarchyDelta(
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
): number {
  const roleOf = new Map<string, "primary" | "secondary">();
  for (const photo of photos) {
    if (photo.storyRole) roleOf.set(photo.photoId, photo.storyRole);
  }
  if (roleOf.size === 0 || assignments.length === 0) return 0;

  const importances = assignments.map((assignment) => assignment.importance);
  const gap = Math.max(...importances) - Math.min(...importances);
  const primaries = assignments.filter((assignment) => roleOf.get(assignment.photoId) === "primary");
  const secondaries = assignments.filter((assignment) => roleOf.get(assignment.photoId) === "secondary");

  if (secondaries.length === 0 && primaries.length >= 2) {
    if (gap < 0.12) return 4;
    if (gap >= 0.25) return -6;
    return 0;
  }

  if (primaries.length === 0 || secondaries.length === 0 || gap < 0.2) return 0;

  const primaryImportance = Math.max(...primaries.map((assignment) => assignment.importance));
  const secondaryImportance = Math.max(...secondaries.map((assignment) => assignment.importance));
  if (secondaryImportance > primaryImportance + 0.05) {
    const primary = primaries[0];
    if (primary.frameMatch.matchTier === "unusable") return 0;
    return -16;
  }
  if (primaryImportance > secondaryImportance) return 6;
  return 0;
}

/** Soft affinity nudges — small deltas only. */
export function applyLayoutAffinity(
  layout: AlbumLayoutDefinition,
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
  overall: number,
): number {
  const a = SMART_LAYOUT_CONFIG.affinity;
  let score = overall;

  if (photos.length === 2 && assignments.length === 2) {
    const o0 = photos[0].analysis.orientation;
    const o1 = photos[1].analysis.orientation;
    const sameOrient = o0 === o1 && o0 !== "square";
    if (sameOrient) {
      if (layout.id === "L02" || layout.id === "L03") {
        score += a.pairedOrientationBonus;
      }
      if (layout.id === "L10") {
        score -= a.squarePairPenaltyWhenOriented;
      }
    }
  }

  if (photos.length === 3 && layout.frames.some((f) => f.slotRole === "hero")) {
    const qualities = assignments.map((x) => x.quality.overall);
    const maxQ = Math.max(...qualities);
    const sorted = [...qualities].sort((x, y) => y - x);
    const gap = sorted.length >= 2 ? sorted[0] - sorted[1] : 0;
    if (gap >= a.heroHierarchyGap && maxQ >= 85) {
      score += a.heroHierarchyBonus;
    }
  }

  return clampScore(score);
}

function collectWarnings(assignments: LayoutAssignment[], tier: LayoutMatchTier): string[] {
  const warnings: string[] = [];
  if (tier === "fallback") {
    warnings.push("FALLBACK_SLOTS");
    warnings.push("NEEDS_ADJUSTMENT");
  }
  if (tier === "unusable") warnings.push("CONTAINS_UNUSABLE");
  for (const a of assignments) {
    if (a.frameMatch.matchTier === "fallback") {
      warnings.push(`FALLBACK:${a.frameId}`);
    }
    if (a.frameMatch.matchTier === "unusable") {
      warnings.push(`UNUSABLE:${a.frameId}`);
    }
  }
  return [...new Set(warnings)];
}

/**
 * Best photo→frame permutation for one layout.
 */
export function evaluateLayout(
  layout: AlbumLayoutDefinition,
  photos: LayoutPhotoInput[],
): LayoutMatchResult {
  if (photos.length !== layout.photoCount) {
    return {
      layoutId: layout.id,
      layout,
      assignments: [],
      scores: {
        frameMatching: 0,
        roleFit: 0,
        balance: 0,
        variety: 0,
        cropQuality: 0,
        overall: 0,
      },
      tier: "unusable",
      needsAdjustment: false,
      warnings: ["PHOTO_COUNT_MISMATCH"],
    };
  }

  const matrix = buildMatchMatrix(photos, layout.frames);
  const perms = permutations(photos);

  let bestAssign: LayoutAssignment[] | null = null;
  let bestScores: LayoutScores | null = null;
  let bestTier: LayoutMatchTier = "unusable";

  for (const order of perms) {
    const assignments = buildAssignment(photos, layout.frames, order, matrix);
    const tier = assignmentTier(assignments);
    if (tier === "unusable") continue;

    const scores = scoreAssignment(layout, photos, assignments);

    if (!bestAssign) {
      bestAssign = assignments;
      bestScores = scores;
      bestTier = tier;
      continue;
    }

    // Never replace STRICT with FALLBACK
    if (bestTier === "strict" && tier === "fallback") continue;
    // Prefer STRICT when current best is FALLBACK
    if (tier === "strict" && bestTier === "fallback") {
      bestAssign = assignments;
      bestScores = scores;
      bestTier = tier;
      continue;
    }
    if (scores.overall > (bestScores?.overall ?? -1)) {
      bestAssign = assignments;
      bestScores = scores;
      bestTier = tier;
    }
  }

  // If every perm was unusable, still pick least-bad for debug (marked unusable)
  if (!bestAssign) {
    let worstBest: LayoutAssignment[] | null = null;
    let worstScores: LayoutScores | null = null;
    for (const order of perms) {
      const assignments = buildAssignment(photos, layout.frames, order, matrix);
      const scores = scoreAssignment(layout, photos, assignments);
      if (!worstBest || scores.overall > (worstScores?.overall ?? -1)) {
        worstBest = assignments;
        worstScores = scores;
      }
    }
    bestAssign = worstBest ?? [];
    bestScores = worstScores ?? {
      frameMatching: 0,
      roleFit: 0,
      balance: 0,
      variety: 0,
      cropQuality: 0,
      overall: 0,
    };
    bestTier = "unusable";
  }

  return {
    layoutId: layout.id,
    layout,
    assignments: bestAssign,
    scores: bestScores!,
    tier: bestTier,
    needsAdjustment: bestTier === "fallback",
    warnings: collectWarnings(bestAssign, bestTier),
  };
}
