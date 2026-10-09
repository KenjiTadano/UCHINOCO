/**
 * Task050 / 050.1 — Photo × Slot assignment via full permutation (1–4 photos).
 */
import { computeSmartCrop } from "../smart-crop/compute.ts";
import { scoreFrameMatch } from "../smart-crop/frame-match.ts";
import { sanitizeCropTransform } from "../smart-crop/transform.ts";
import type { FrameMatchResult } from "../smart-crop/types.ts";
import { SMART_LAYOUT_CONFIG } from "./config.ts";
import { resolveLayoutCropFrame } from "./frames.ts";
import { scoreLayoutBalance } from "./balance.ts";
import { scoreHierarchyFit, weakPhotoHeroPenalty } from "./hierarchy.ts";
import type { HeroSelectionProfile } from "./hierarchy.ts";
import { computeHeroConfidence, computeHeroSuitability } from "./hero.ts";
import { scoreOrientationAffinity } from "./orientation.ts";
import { buildOrientationProfile, buildPhotoSetQualityProfile, type QualityProfile } from "./photo-set.ts";
import { scoreRoleFit } from "./role-fit.ts";
import { scoreVisualVariety } from "./variety.ts";
import type { AlbumFrameDefinition, AlbumLayoutDefinition, LayoutAssignment, LayoutMatchResult, LayoutMatchTier, LayoutPhotoInput, LayoutScores } from "./types.ts";

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

function buildMatchMatrix(photos: LayoutPhotoInput[], frames: AlbumFrameDefinition[]): Cell[][] {
  return photos.map((photo) =>
    frames.map((frame) => {
      const cropFrame = resolveLayoutCropFrame(frame);
      const { crop, quality } = computeSmartCrop(photo.analysis, cropFrame);
      const safeCrop = sanitizeCropTransform(crop);
      const frameMatch = scoreFrameMatch(photo.analysis, cropFrame, safeCrop, quality);
      return { frameMatch, crop: safeCrop, quality };
    }),
  );
}

function buildAssignment(photos: LayoutPhotoInput[], frames: AlbumFrameDefinition[], photoOrder: LayoutPhotoInput[], matrix: Cell[][], heroSuitabilityByPhotoId: ReadonlyMap<string, number>): LayoutAssignment[] {
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
      cropFrame: resolveLayoutCropFrame(frame),
      photoIntelligence: photo.photoIntelligence,
      bestShot: photo.bestShot,
      heroSuitability: heroSuitabilityByPhotoId.get(photo.photoId) ?? 0,
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

function emptyScores(): LayoutScores {
  return {
    frameMatching: 0,
    roleFit: 0,
    balance: 0,
    variety: 0,
    cropQuality: 0,
    orientationAffinity: 0,
    hierarchyFit: 0,
    hierarchyNeed: 0,
    overall: 0,
  };
}

function scoreAssignment(layout: AlbumLayoutDefinition, photos: LayoutPhotoInput[], assignments: LayoutAssignment[], qualityProfile: QualityProfile, heroProfile: HeroSelectionProfile): LayoutScores {
  const frameMatching = clampScore(
    assignments.reduce((s, a) => {
      const base = a.frameMatch.matchTier === "strict" ? a.frameMatch.matchScore : a.frameMatch.matchTier === "fallback" ? a.frameMatch.fallbackScore * 0.85 : 20;
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

  const orientProfile = buildOrientationProfile(photos);
  const orientationAffinity = scoreOrientationAffinity(photos, layout, orientProfile);
  let hierarchyFit = scoreHierarchyFit(photos, layout, assignments, qualityProfile, heroProfile);
  hierarchyFit = clampScore(hierarchyFit + weakPhotoHeroPenalty(photos, assignments, qualityProfile));

  const w = SMART_LAYOUT_CONFIG.assignmentWeights;
  let overall = clampScore(frameMatching * w.frameMatch + roleFit * w.roleFit + balance * w.layoutBalance + variety * w.visualVariety + cropQuality * w.cropQuality + orientationAffinity * w.orientationAffinity + hierarchyFit * w.hierarchyFit);

  const tier = assignmentTier(assignments);
  if (tier === "strict") overall = clampScore(overall + SMART_LAYOUT_CONFIG.tier.allStrictBonus);
  if (tier === "fallback") overall = clampScore(overall - SMART_LAYOUT_CONFIG.tier.anyFallbackPenalty);
  if (tier === "unusable") overall = Math.min(overall, 35);

  // Soft story-role nudge (optional; no-op without storyRole)
  overall = clampScore(overall + storyHierarchyDelta(photos, assignments));

  return {
    frameMatching,
    roleFit,
    balance,
    variety,
    cropQuality,
    orientationAffinity,
    hierarchyFit,
    hierarchyNeed: qualityProfile.hierarchyNeed,
    overall,
  };
}

/**
 * Story roles nudge which photo lands in the larger slot.
 * No effect unless a photo sets storyRole.
 */
export function storyHierarchyDelta(photos: LayoutPhotoInput[], assignments: LayoutAssignment[]): number {
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

function collectWarnings(assignments: LayoutAssignment[], tier: LayoutMatchTier, integrityOk: boolean): string[] {
  const warnings: string[] = [];
  if (!integrityOk) warnings.push("ASSIGNMENT_INTEGRITY_FAILED");
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

function assignmentIntegrityOk(layout: AlbumLayoutDefinition, photos: LayoutPhotoInput[], assignments: LayoutAssignment[]): boolean {
  if (assignments.length !== layout.frames.length) return false;
  if (assignments.length !== photos.length) return false;
  const photoIds = new Set(assignments.map((a) => a.photoId));
  const frameIds = new Set(assignments.map((a) => a.frameId));
  if (photoIds.size !== photos.length) return false;
  if (frameIds.size !== layout.frames.length) return false;
  for (const p of photos) {
    if (!photoIds.has(p.photoId)) return false;
  }
  for (const f of layout.frames) {
    if (!frameIds.has(f.id)) return false;
  }
  return true;
}

/**
 * Best photo→frame permutation for one layout.
 */
export function evaluateLayout(layout: AlbumLayoutDefinition, photos: LayoutPhotoInput[]): LayoutMatchResult {
  const heroConfidence = computeHeroConfidence(photos);
  if (photos.length !== layout.photoCount) {
    return {
      layoutId: layout.id,
      layout,
      assignments: [],
      scores: emptyScores(),
      tier: "unusable",
      heroConfidence,
      needsAdjustment: false,
      warnings: ["PHOTO_COUNT_MISMATCH"],
      invalid: true,
    };
  }

  const matrix = buildMatchMatrix(photos, layout.frames);
  // Hierarchy need is photo-set level (not layout-dependent crop max).
  const qualityProfile = buildPhotoSetQualityProfile(photos);
  const heroSuitabilityByPhotoId = new Map(photos.map((photo) => [photo.photoId, computeHeroSuitability(photo)]));
  const bestHeroPhoto = photos.reduce<LayoutPhotoInput | undefined>((best, photo) => (!best || (heroSuitabilityByPhotoId.get(photo.photoId) ?? 0) > (heroSuitabilityByPhotoId.get(best.photoId) ?? 0) ? photo : best), undefined);
  const heroProfile: HeroSelectionProfile = {
    bestPhotoId: bestHeroPhoto?.photoId,
    confidence: heroConfidence,
    hasSignals: photos.some((photo) => photo.photoIntelligence != null || photo.bestShot != null),
  };
  const perms = permutations(photos);

  let bestAssign: LayoutAssignment[] | null = null;
  let bestScores: LayoutScores | null = null;
  let bestTier: LayoutMatchTier = "unusable";

  for (const order of perms) {
    const assignments = buildAssignment(photos, layout.frames, order, matrix, heroSuitabilityByPhotoId);
    if (!assignmentIntegrityOk(layout, photos, assignments)) continue;

    const tier = assignmentTier(assignments);
    if (tier === "unusable") continue;

    const scores = scoreAssignment(layout, photos, assignments, qualityProfile, heroProfile);

    if (!bestAssign) {
      bestAssign = assignments;
      bestScores = scores;
      bestTier = tier;
      continue;
    }

    if (bestTier === "strict" && tier === "fallback") continue;
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

  if (!bestAssign) {
    let worstBest: LayoutAssignment[] | null = null;
    let worstScores: LayoutScores | null = null;
    for (const order of perms) {
      const assignments = buildAssignment(photos, layout.frames, order, matrix, heroSuitabilityByPhotoId);
      if (!assignmentIntegrityOk(layout, photos, assignments)) continue;
      const scores = scoreAssignment(layout, photos, assignments, qualityProfile, heroProfile);
      if (!worstBest || scores.overall > (worstScores?.overall ?? -1)) {
        worstBest = assignments;
        worstScores = scores;
      }
    }
    bestAssign = worstBest ?? [];
    bestScores = worstScores ?? emptyScores();
    bestTier = "unusable";
  }

  const integrity = assignmentIntegrityOk(layout, photos, bestAssign);
  if (!integrity) {
    return {
      layoutId: layout.id,
      layout,
      assignments: bestAssign,
      scores: bestScores!,
      tier: "unusable",
      invalid: true,
      heroConfidence,
      needsAdjustment: false,
      warnings: collectWarnings(bestAssign, "unusable", false),
    };
  }

  return {
    layoutId: layout.id,
    layout,
    assignments: bestAssign,
    scores: bestScores!,
    tier: bestTier,
    heroConfidence,
    needsAdjustment: bestTier === "fallback",
    warnings: collectWarnings(bestAssign, bestTier, true),
    invalid: false,
  };
}
