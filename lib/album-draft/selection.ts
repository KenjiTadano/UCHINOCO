import type { EditorialPhoto } from "./editorial.ts";
import type { StorySpread } from "../album-story/types.ts";
import type { AlbumPageCount } from "../album-capacity.ts";
import { planEditorialAlbum } from "./editorial.ts";
import { sourceSubjectClipped } from "../smart-layout/suitability.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

export type PhotoSubsetSelectionDiagnostics = {
  eligiblePhotoCount: number;
  selectedPhotoCount: number;
  unusedPhotoCount: number;
  subsetAttemptCount: number;
  subsetSuccessCount: number;
  fallbackToPreviousSafeSubsetCount: number;
  droppedForLayoutSafetyCount: number;
  droppedForCropRiskCount: number;
  droppedForSourceClippingCount: number;
  droppedForRedundancyCount: number;
  initialUnrecoveredCount: number;
  finalUnrecoveredCount: number;
  spreadSubsetAdjustments?: SpreadSubsetAdjustmentDiagnostics[];
};

export type SpreadSubsetAdjustmentDiagnostics = {
  spreadIndex: number;
  contributingPhotoCount: number;
  removableCandidateCount: number;
  replacementCandidateCount: number;
  subsetAdjustmentAttempted: boolean;
  subsetAdjustmentSucceeded: boolean;
};

export const MAX_SUBSET_SEARCH_ATTEMPTS = 4;

export function scorePhotoQualityAndSuitability(
  photo: EditorialPhoto,
  geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>,
): number {
  let score = photo.candidate.scores.overall;

  if (geometryMap) {
    const analysis = geometryMap.get(photo.photoId);
    if (analysis) {
      if (sourceSubjectClipped(analysis)) {
        score -= 35;
      }
      const suit = analysis.layoutSuitability;
      if (suit) {
        if (!suit.portraitCropSafe && !suit.landscapeCropSafe && !suit.squareCropSafe) {
          score -= 20;
        }
        if (suit.sourceSubjectClipped) {
          score -= 30;
        }
      }
    }
  }

  return score;
}

/**
 * Deterministically ranks eligible photos and produces candidate subsets.
 */
export function rankPhotosForSubset(
  photos: EditorialPhoto[],
  geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>,
): EditorialPhoto[] {
  const eligible = [...new Map(photos.filter((p) => p.candidate.role !== "alternate" && p.candidate.scores.technical >= 25).map((p) => [p.photoId, p])).values()];

  return eligible.sort((a, b) => {
    const scoreA = scorePhotoQualityAndSuitability(a, geometryMap);
    const scoreB = scorePhotoQualityAndSuitability(b, geometryMap);
    return scoreB - scoreA || a.photoId.localeCompare(b.photoId);
  });
}

/**
 * Plans an editorial album using candidate subset search for Monotonic Completion.
 * If excludedPhotoIds is provided, those photos are left unused in the pool.
 */
export function planEditorialAlbumWithSubset(
  eligiblePhotos: EditorialPhoto[],
  pageCount: AlbumPageCount,
  excludedPhotoIds: ReadonlySet<string> = new Set(),
): { selected: EditorialPhoto[]; spreads: StorySpread[] } {
  const filtered = eligiblePhotos.filter((p) => !excludedPhotoIds.has(p.photoId));
  return planEditorialAlbum(filtered, pageCount);
}

/**
 * Identifies photos in an unsafe spread that are candidates for exclusion/replacement,
 * prioritizing photos with lower suitability, higher crop/clipping risk, or lower overall score.
 */
export function identifyUnsafeSpreadRemovals(
  story: StorySpread,
  photoMap: ReadonlyMap<string, EditorialPhoto>,
  geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>,
): EditorialPhoto[] {
  const photos = story.photoIds.map((id: string) => photoMap.get(id)).filter((p: EditorialPhoto | undefined): p is EditorialPhoto => Boolean(p));
  if (photos.length <= 1) return [];

  // Sort lowest quality/suitability first so they are removed first
  return [...photos].sort((a, b) => {
    const scoreA = scorePhotoQualityAndSuitability(a, geometryMap);
    const scoreB = scorePhotoQualityAndSuitability(b, geometryMap);
    return scoreA - scoreB || a.photoId.localeCompare(b.photoId);
  });
}


