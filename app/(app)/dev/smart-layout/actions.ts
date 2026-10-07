"use server";

import { analyzeSmartCropPhoto } from "@/app/(app)/dev/smart-crop/actions";
import { analyzePhotoIntelligence } from "@/app/(app)/dev/photo-intelligence/actions";
import { selectPetBestShots } from "@/app/(app)/dev/best-shot/actions";
import { getBestShotCacheByPhotoIds } from "@/lib/best-shot/cache";
import { findBestLayoutForPhotos } from "@/lib/smart-layout/select";
import type { LayoutBestShot, LayoutMatchResult, LayoutPhotoInput, LayoutPhotoIntelligence, LayoutSelectionResult } from "@/lib/smart-layout/types";

export type SmartLayoutSelectResult = {
  ok: boolean;
  message: string | null;
  photos: LayoutPhotoInput[];
  selection: LayoutSelectionResult | null;
  /** Aggregated FALLBACK reason codes for this run. */
  fallbackReasonCounts: Record<string, number>;
};

function tallyFallbackReasons(selection: LayoutSelectionResult | null): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!selection) return counts;
  for (const layout of selection.ranking) {
    if (layout.tier !== "fallback" && layout.tier !== "unusable") continue;
    for (const a of layout.assignments) {
      if (a.frameMatch.matchTier === "strict") continue;
      const reasons = a.frameMatch.rejectReasons.length > 0 ? a.frameMatch.rejectReasons : a.frameMatch.warnings;
      for (const r of reasons) {
        counts[r] = (counts[r] || 0) + 1;
      }
      if (reasons.length === 0) {
        counts["UNKNOWN"] = (counts["UNKNOWN"] || 0) + 1;
      }
    }
  }
  return counts;
}

export async function selectSmartLayout(petId: string, photoIds: string[]): Promise<SmartLayoutSelectResult> {
  if (!petId || photoIds.length < 1 || photoIds.length > 4) {
    return {
      ok: false,
      message: "1〜4枚の写真を選んでください。",
      photos: [],
      selection: null,
      fallbackReasonCounts: {},
    };
  }

  // Keep caller order but resolve strictly by photoId (no index coupling).
  const unique = [...new Set(photoIds)];
  const analyses = await Promise.all(unique.map((id) => analyzeSmartCropPhoto(petId, id)));

  const byId = new Map<string, LayoutPhotoInput>();
  for (let i = 0; i < analyses.length; i++) {
    const res = analyses[i];
    const id = unique[i];
    if (!res.ok || !res.analysis || !res.photoId) {
      return {
        ok: false,
        message: res.message ?? `写真の解析に失敗しました（${id}）。`,
        photos: [],
        selection: null,
        fallbackReasonCounts: {},
      };
    }
    const preview = res.previewUrl ?? res.thumbnailUrl ?? res.imageUrl;
    if (!preview) {
      return {
        ok: false,
        message: `Preview URLがありません（${res.photoId}）。`,
        photos: [],
        selection: null,
        fallbackReasonCounts: {},
      };
    }
    byId.set(res.photoId, {
      photoId: res.photoId,
      imageUrl: res.imageUrl ?? preview,
      previewUrl: preview,
      analysis: res.analysis,
    });
  }

  const intelligenceResults = await Promise.all(unique.map((id) => analyzePhotoIntelligence(petId, id, false, { storedOnly: true })));
  const photoIntelligenceById = new Map<string, LayoutPhotoIntelligence>();
  for (const result of intelligenceResults) {
    if (!result.ok || !result.photoId || !result.intelligence) continue;
    const { overallScore, composition, technicalQuality, petVisibility, expression, memoryValue, status } = result.intelligence;
    photoIntelligenceById.set(result.photoId, {
      overallScore,
      composition,
      technicalQuality,
      petVisibility,
      expression,
      memoryValue,
      status,
    });
  }
  let bestShotById: Map<string, LayoutBestShot> = getBestShotCacheByPhotoIds(unique);
  if (bestShotById.size < unique.length) {
    await selectPetBestShots(petId, { storedOnly: true });
    bestShotById = getBestShotCacheByPhotoIds(unique);
  }

  // Preserve selection order from photoIds, keyed by id
  const photos: LayoutPhotoInput[] = [];
  for (const id of photoIds) {
    const p = byId.get(id);
    if (p && !photos.some((x) => x.photoId === p.photoId)) {
      photos.push({
        ...p,
        photoIntelligence: photoIntelligenceById.get(id),
        bestShot: bestShotById.get(id),
      });
    }
  }

  const selection = findBestLayoutForPhotos(photos);
  return {
    ok: true,
    message: null,
    photos,
    selection,
    fallbackReasonCounts: tallyFallbackReasons(selection),
  };
}

export type { LayoutMatchResult, LayoutSelectionResult };
