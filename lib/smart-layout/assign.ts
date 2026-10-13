/**
 * Task050 / 050.1 — Photo × Slot assignment via full permutation (1–4 photos).
 */
import { computeSmartCrop } from "../smart-crop/compute.ts";
import { scoreFrameMatch } from "../smart-crop/frame-match.ts";
import { scoreSmartCrop } from "../smart-crop/quality.ts";
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
import { scorePhotoFrameCompatibility } from "./compatibility.ts";
import { getTemplateFrameMetadata } from "./frame-metadata.ts";
import { scoreRoleFit } from "./role-fit.ts";
import { scoreVisualVariety } from "./variety.ts";
import type { AlbumFrameDefinition, AlbumLayoutDefinition, LayoutAssignment, LayoutMatchResult, LayoutMatchTier, LayoutPhotoInput, LayoutScores, PhotoFrameCompatibilityDiagnostics } from "./types.ts";
import type { PhotoFrameCompatibility } from "./compatibility.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function tierRank(tier: LayoutMatchTier): number {
  return tier === "strict" ? 0 : tier === "fallback" ? 1 : 2;
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

export type LayoutEvaluationWork = {
  cells: Map<string, Cell>;
  cropDurationMs: number;
  cropItemCount: number;
  cropReusedCount: number;
  layoutCandidateCount?: number;
  photoFrameMatching?: PhotoFrameCompatibilityDiagnostics & { totalScore: number };
};

export function emptyPhotoFrameMatchingDiagnostics(): PhotoFrameCompatibilityDiagnostics & { totalScore: number } {
  return {
    frameEvaluatedCount: 0,
    comparedPairCount: 0,
    matchedPairCount: 0,
    suitabilityPhotoCount: 0,
    averageScore: 0,
    assignmentCandidateCount: 0,
    optimizedAssignmentCount: 0,
    legacyFallbackCount: 0,
    portraitMatchedCount: 0,
    landscapeMatchedCount: 0,
    squareMatchedCount: 0,
    cropSafePreferredCount: 0,
    heroPreferredCount: 0,
    fullBleedPreferredCount: 0,
    totalScore: 0,
  };
}

function noCropCell(photo: LayoutPhotoInput, cropFrame: ReturnType<typeof resolveLayoutCropFrame>, work?: LayoutEvaluationWork): Cell {
  const key = `${photo.photoId}|contain|${JSON.stringify(cropFrame)}`;
  const cached = work?.cells.get(key);
  if (cached) {
    work!.cropReusedCount++;
    return cached;
  }
  const started = performance.now();
  const transform = { x: 0.5, y: 0.5, scale: 1 };
  const validRect = (rect: { x: number; y: number; width: number; height: number }) =>
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0 && rect.x >= 0.005 && rect.y >= 0.005 && rect.x + rect.width <= 0.995 && rect.y + rect.height <= 0.995;
  const dimensionsValid = Number.isFinite(photo.analysis.width) && photo.analysis.width > 0 && Number.isFinite(photo.analysis.height) && photo.analysis.height > 0 && Number.isFinite(photo.analysis.focalPoint.x) && Number.isFinite(photo.analysis.focalPoint.y);
  const subjectGeometryValid = photo.analysis.pets.length > 0 && photo.analysis.pets.every((pet) => validRect(pet.bbox) && (!pet.face || validRect(pet.face)));
  const validGeometry = dimensionsValid && subjectGeometryValid;
  const fullSourceFrame = { ...cropFrame, aspectRatio: dimensionsValid ? photo.analysis.width / photo.analysis.height : cropFrame.aspectRatio };
  const quality = scoreSmartCrop(photo.analysis, fullSourceFrame, transform);
  if (!validGeometry) {
    quality.rejected = true;
    quality.rejectReason = !dimensionsValid ? "invalidGeometry" : "subjectVisibility";
  }
  const frameMatch = scoreFrameMatch(photo.analysis, fullSourceFrame, transform, quality);
  const cell = { frameMatch, crop: transform, quality };
  if (work) {
    work.cropDurationMs += performance.now() - started;
    work.cropItemCount++;
    work.cells.set(key, cell);
  }
  return cell;
}

function buildMatchMatrix(photos: LayoutPhotoInput[], frames: AlbumFrameDefinition[], work?: LayoutEvaluationWork, imageFit: AlbumLayoutDefinition["imageFit"] = "cover"): Cell[][] {
  return photos.map((photo) =>
    frames.map((frame) => {
      const cropFrame = resolveLayoutCropFrame(frame);
      if (imageFit === "contain") return noCropCell(photo, cropFrame, work);
      const key = `${photo.photoId}|cover|${JSON.stringify(cropFrame)}`;
      const cached = work?.cells.get(key);
      if (cached) {
        work!.cropReusedCount++;
        return cached;
      }
      const started = performance.now();
      const { crop, quality } = computeSmartCrop(photo.analysis, cropFrame);
      const safeCrop = sanitizeCropTransform(crop);
      const frameMatch = scoreFrameMatch(photo.analysis, cropFrame, safeCrop, quality);
      const cell = { frameMatch, crop: safeCrop, quality };
      if (work) {
        work.cropDurationMs += performance.now() - started;
        work.cropItemCount++;
        work.cells.set(key, cell);
      }
      return cell;
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
    suitabilityFit: 0,
    legacyOverall: 0,
    overall: 0,
  };
}

function scoreAssignment(layout: AlbumLayoutDefinition, photos: LayoutPhotoInput[], assignments: LayoutAssignment[], qualityProfile: QualityProfile, heroProfile: HeroSelectionProfile, compatibilityByPhotoFrame: ReadonlyMap<string, PhotoFrameCompatibility>): LayoutScores {
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
  const compatibilityPairs = assignments.flatMap((assignment) => {
    const compatibility = compatibilityByPhotoFrame.get(`${assignment.photoId}|${assignment.frameId}`);
    return compatibility === undefined ? [] : [{ score: compatibility.score, weight: Math.max(assignment.importance, 0.4) }];
  });
  const suitabilityFit = compatibilityPairs.length
    ? Math.round(compatibilityPairs.reduce((sum, pair) => sum + pair.score * pair.weight, 0) / compatibilityPairs.reduce((sum, pair) => sum + pair.weight, 0) * 100)
    : 0;
  let hierarchyFit = scoreHierarchyFit(photos, layout, assignments, qualityProfile, heroProfile);
  hierarchyFit = clampScore(hierarchyFit + weakPhotoHeroPenalty(photos, assignments, qualityProfile));

  const w = SMART_LAYOUT_CONFIG.assignmentWeights;
  const legacyBase = frameMatching * w.frameMatch + roleFit * w.roleFit + balance * w.layoutBalance + variety * w.visualVariety + cropQuality * w.cropQuality + orientationAffinity * w.orientationAffinity + hierarchyFit * w.hierarchyFit;
  const tier = assignmentTier(assignments);
  const finalizeScore = (base: number) => {
    let score = clampScore(base);
    if (tier === "strict") score = clampScore(score + SMART_LAYOUT_CONFIG.tier.allStrictBonus);
    if (tier === "fallback") score = clampScore(score - SMART_LAYOUT_CONFIG.tier.anyFallbackPenalty);
    if (tier === "unusable") score = Math.min(score, 35);
    return clampScore(score + storyHierarchyDelta(photos, assignments));
  };
  const legacyOverall = finalizeScore(legacyBase);
  const overall = finalizeScore(legacyBase + suitabilityFit * 0.04);

  return {
    frameMatching,
    roleFit,
    balance,
    variety,
    cropQuality,
    orientationAffinity,
    hierarchyFit,
    hierarchyNeed: qualityProfile.hierarchyNeed,
    suitabilityFit,
    legacyOverall,
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
export function evaluateLayout(layout: AlbumLayoutDefinition, photos: LayoutPhotoInput[], work?: LayoutEvaluationWork): LayoutMatchResult {
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

  const matrix = buildMatchMatrix(photos, layout.frames, work, layout.imageFit);
  const frameMetadataById = new Map((getTemplateFrameMetadata(layout.id) ?? []).map((metadata) => [metadata.frameId, metadata]));
  const compatibilityByPhotoFrame = new Map<string, PhotoFrameCompatibility>();
  let suitabilityPhotoCount = 0;
  for (const photo of photos) {
    if (photo.analysis.layoutSuitability) suitabilityPhotoCount++;
    for (const frame of layout.frames) {
      const metadata = frameMetadataById.get(frame.id);
      const compatibility = metadata ? scorePhotoFrameCompatibility(photo.analysis.layoutSuitability, metadata) : null;
      if (compatibility) compatibilityByPhotoFrame.set(`${photo.photoId}|${frame.id}`, compatibility);
    }
  }
  const compatibilityDiagnostics: PhotoFrameCompatibilityDiagnostics = {
    frameEvaluatedCount: layout.frames.length,
    comparedPairCount: photos.length * layout.frames.length,
    matchedPairCount: compatibilityByPhotoFrame.size,
    suitabilityPhotoCount,
    averageScore: compatibilityByPhotoFrame.size
      ? [...compatibilityByPhotoFrame.values()].reduce((sum, compatibility) => sum + compatibility.score, 0) / compatibilityByPhotoFrame.size
      : 0,
    assignmentCandidateCount: 0,
    optimizedAssignmentCount: 0,
    legacyFallbackCount: 0,
    portraitMatchedCount: 0,
    landscapeMatchedCount: 0,
    squareMatchedCount: 0,
    cropSafePreferredCount: 0,
    heroPreferredCount: 0,
    fullBleedPreferredCount: 0,
  };
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
  compatibilityDiagnostics.assignmentCandidateCount = perms.length;
  compatibilityDiagnostics.optimizedAssignmentCount = compatibilityByPhotoFrame.size > 0 ? 1 : 0;
  compatibilityDiagnostics.legacyFallbackCount = suitabilityPhotoCount === 0 ? 1 : 0;

  let bestAssign: LayoutAssignment[] | null = null;
  let bestScores: LayoutScores | null = null;
  let bestTier: LayoutMatchTier = "unusable";
  let legacyBestAssign: LayoutAssignment[] | null = null;
  let legacyBestScores: LayoutScores | null = null;
  let legacyBestTier: LayoutMatchTier = "unusable";
  const better = (tier: LayoutMatchTier, score: number, currentTier: LayoutMatchTier, currentScore: number) => tierRank(tier) < tierRank(currentTier) || (tierRank(tier) === tierRank(currentTier) && score > currentScore);

  for (const order of perms) {
    const assignments = buildAssignment(photos, layout.frames, order, matrix, heroSuitabilityByPhotoId);
    if (!assignmentIntegrityOk(layout, photos, assignments)) continue;

    const tier = assignmentTier(assignments);
    if (tier === "unusable") continue;

    const scores = scoreAssignment(layout, photos, assignments, qualityProfile, heroProfile, compatibilityByPhotoFrame);

    if (!bestAssign || better(tier, scores.overall, bestTier, bestScores?.overall ?? -1)) {
      bestAssign = assignments;
      bestScores = scores;
      bestTier = tier;
    }
    if (!legacyBestAssign || better(tier, scores.legacyOverall, legacyBestTier, legacyBestScores?.legacyOverall ?? -1)) {
      legacyBestAssign = assignments;
      legacyBestScores = scores;
      legacyBestTier = tier;
    }
  }

  if (!bestAssign) {
    let worstBest: LayoutAssignment[] | null = null;
    let worstScores: LayoutScores | null = null;
    let legacyWorstBest: LayoutAssignment[] | null = null;
    let legacyWorstScores: LayoutScores | null = null;
    for (const order of perms) {
      const assignments = buildAssignment(photos, layout.frames, order, matrix, heroSuitabilityByPhotoId);
      if (!assignmentIntegrityOk(layout, photos, assignments)) continue;
      const scores = scoreAssignment(layout, photos, assignments, qualityProfile, heroProfile, compatibilityByPhotoFrame);
      if (!worstBest || scores.overall > (worstScores?.overall ?? -1)) {
        worstBest = assignments;
        worstScores = scores;
      }
      if (!legacyWorstBest || scores.legacyOverall > (legacyWorstScores?.legacyOverall ?? -1)) {
        legacyWorstBest = assignments;
        legacyWorstScores = scores;
      }
    }
    bestAssign = worstBest ?? [];
    bestScores = worstScores ?? emptyScores();
    bestTier = "unusable";
    legacyBestAssign = legacyWorstBest ?? bestAssign;
    legacyBestScores = legacyWorstScores ?? bestScores;
    legacyBestTier = "unusable";
  }

  legacyBestAssign ??= bestAssign;
  legacyBestScores ??= bestScores;
  legacyBestTier ??= bestTier;
  for (const assignment of bestAssign) {
    const compatibility = compatibilityByPhotoFrame.get(`${assignment.photoId}|${assignment.frameId}`);
    const metadata = frameMetadataById.get(assignment.frameId);
    if (!compatibility || !metadata) continue;
    if (compatibility.orientationScore >= 0.7) {
      if (metadata.orientation === "portrait") compatibilityDiagnostics.portraitMatchedCount++;
      else if (metadata.orientation === "landscape") compatibilityDiagnostics.landscapeMatchedCount++;
      else compatibilityDiagnostics.squareMatchedCount++;
    }
    if (compatibility.cropSafetyPreference >= 0.9) compatibilityDiagnostics.cropSafePreferredCount++;
    if (metadata.role === "hero" && compatibility.roleScore >= 0.7) compatibilityDiagnostics.heroPreferredCount++;
    if (metadata.fullBleed && compatibility.fullBleedScore >= 0.7) compatibilityDiagnostics.fullBleedPreferredCount++;
  }
  if (work?.photoFrameMatching) {
    const aggregate = work.photoFrameMatching;
    for (const key of ["frameEvaluatedCount", "comparedPairCount", "matchedPairCount", "suitabilityPhotoCount", "assignmentCandidateCount", "optimizedAssignmentCount", "legacyFallbackCount", "portraitMatchedCount", "landscapeMatchedCount", "squareMatchedCount", "cropSafePreferredCount", "heroPreferredCount", "fullBleedPreferredCount"] as const) aggregate[key] += compatibilityDiagnostics[key];
    aggregate.totalScore += compatibilityDiagnostics.averageScore * compatibilityDiagnostics.matchedPairCount;
    aggregate.averageScore = aggregate.matchedPairCount ? aggregate.totalScore / aggregate.matchedPairCount : 0;
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
      photoFrameCompatibility: compatibilityDiagnostics,
      legacyAssignments: legacyBestAssign,
      legacyTier: legacyBestTier,
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
    photoFrameCompatibility: compatibilityDiagnostics,
    legacyAssignments: legacyBestAssign,
    legacyTier: legacyBestTier,
  };
}
