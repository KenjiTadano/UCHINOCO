import type { PersistedDraftView } from "./album-persistence/view.ts";

export const ALBUM_EDIT_WEIGHTS = {
  photoSwap: 3,
  layout: 2,
  crop: 1,
  text: 1,
  stamp: 0.5,
  decoration: 0.5,
  background: 0.5,
} as const;

export const ALBUM_EDIT_THRESHOLDS = { lightMax: 2, mediumMax: 7 } as const;

export type AlbumEditSeverity = "NONE" | "LIGHT" | "MEDIUM" | "HEAVY";
export type AlbumAcceptCategory = "DIRECT_ACCEPT" | "LIGHT_EDIT_ACCEPT" | "MEDIUM_EDIT_ACCEPT" | "HEAVY_EDIT_ACCEPT";

export type AlbumEditMetrics = {
  photoSwapCount: number;
  layoutChangeCount: number;
  cropChangeCount: number;
  textChangeCount: number;
  stampChangeCount: number;
  decorationChangeCount: number;
  backgroundChangeCount: number;
  editCount: number;
  editDistance: number;
  severity: AlbumEditSeverity;
  category: AlbumAcceptCategory;
  decorationApplied: boolean;
  aiLayoutKeptCount: number;
  aiLayoutTotal: number;
  aiCropKeptCount: number;
  aiCropTotal: number;
  selectedRankCounts: Record<string, number>;
};

function changedTextCount(view: PersistedDraftView) {
  return view.spreads.reduce((count, spread) => count + spread.texts.filter((item) => item.overrideMode !== "inherit").length + spread.elements.filter((item) => item.type === "text").length, 0);
}

export function classifyAlbumEditDistance(distance: number): AlbumEditSeverity {
  if (distance === 0) return "NONE";
  if (distance <= ALBUM_EDIT_THRESHOLDS.lightMax) return "LIGHT";
  if (distance <= ALBUM_EDIT_THRESHOLDS.mediumMax) return "MEDIUM";
  return "HEAVY";
}

export function acceptCategory(severity: AlbumEditSeverity): AlbumAcceptCategory {
  return severity === "NONE" ? "DIRECT_ACCEPT" : `${severity}_EDIT_ACCEPT` as AlbumAcceptCategory;
}

export function calculateAlbumEditMetrics(view: PersistedDraftView): AlbumEditMetrics {
  const frames = view.spreads.flatMap((spread) => spread.frames);
  const photoSwapCount = frames.filter((frame) => frame.userPhotoId != null && frame.userPhotoId !== frame.aiPhotoId).length;
  const cropChangeCount = frames.filter((frame) => frame.userCrop != null).length;
  const layoutChangeCount = view.spreads.filter((spread) => spread.userLayoutId != null && spread.userLayoutId !== spread.aiLayoutId).length;
  const textChangeCount = changedTextCount(view);
  const legacyDecorationCount = view.spreads.reduce((count, spread) => count + spread.decorations.filter((item) => item.overrideMode !== "inherit").length, 0);
  const stampChangeCount = view.spreads.reduce((count, spread) => count + spread.elements.filter((item) => item.type === "stamp").length, 0);
  const decorationChangeCount = legacyDecorationCount + view.spreads.reduce((count, spread) => count + spread.elements.filter((item) => item.type === "decoration").length, 0);
  const backgroundChangeCount = view.spreads.reduce((count, spread) => count + (["left", "right"] as const).filter((side) => spread.backgrounds[side].backgroundId != null).length, 0);
  const editCount = photoSwapCount + layoutChangeCount + cropChangeCount + textChangeCount + stampChangeCount + decorationChangeCount + backgroundChangeCount;
  const editDistance = photoSwapCount * ALBUM_EDIT_WEIGHTS.photoSwap + layoutChangeCount * ALBUM_EDIT_WEIGHTS.layout + cropChangeCount * ALBUM_EDIT_WEIGHTS.crop + textChangeCount * ALBUM_EDIT_WEIGHTS.text + stampChangeCount * ALBUM_EDIT_WEIGHTS.stamp + decorationChangeCount * ALBUM_EDIT_WEIGHTS.decoration + backgroundChangeCount * ALBUM_EDIT_WEIGHTS.background;
  const severity = classifyAlbumEditDistance(editDistance);
  const selectedRankCounts: Record<string, number> = {};
  for (const spread of view.spreads) {
    const selected = spread.effectiveLayoutId;
    const ranking = spread.layoutRanking ? [spread.layoutRanking.selectedLayout, ...spread.layoutRanking.alternatives].filter((item) => item != null) : [];
    const rank = ranking.findIndex((item) => item.layoutId === selected);
    const key = rank >= 0 && rank < 4 ? String(rank + 1) : "other";
    selectedRankCounts[key] = (selectedRankCounts[key] ?? 0) + 1;
  }
  return {
    photoSwapCount, layoutChangeCount, cropChangeCount, textChangeCount, stampChangeCount,
    decorationChangeCount, backgroundChangeCount, editCount, editDistance, severity,
    category: acceptCategory(severity),
    decorationApplied: stampChangeCount + decorationChangeCount + backgroundChangeCount > 0,
    aiLayoutKeptCount: view.spreads.length - layoutChangeCount,
    aiLayoutTotal: view.spreads.length,
    aiCropKeptCount: frames.length - cropChangeCount,
    aiCropTotal: frames.length,
    selectedRankCounts,
  };
}

export function analyticsAcceptData(metrics: AlbumEditMetrics, timeToAcceptSeconds: number | null) {
  return {
    category: metrics.category,
    severity: metrics.severity,
    edit_count: metrics.editCount,
    edit_distance: metrics.editDistance,
    time_to_accept_seconds: timeToAcceptSeconds,
    photo_swap_count: metrics.photoSwapCount,
    layout_change_count: metrics.layoutChangeCount,
    crop_change_count: metrics.cropChangeCount,
    text_change_count: metrics.textChangeCount,
    stamp_change_count: metrics.stampChangeCount,
    decoration_change_count: metrics.decorationChangeCount,
    background_change_count: metrics.backgroundChangeCount,
    decoration_applied: metrics.decorationApplied,
    ai_layout_kept_count: metrics.aiLayoutKeptCount,
    ai_layout_total: metrics.aiLayoutTotal,
    ai_crop_kept_count: metrics.aiCropKeptCount,
    ai_crop_total: metrics.aiCropTotal,
    selected_rank_counts: metrics.selectedRankCounts,
  };
}
