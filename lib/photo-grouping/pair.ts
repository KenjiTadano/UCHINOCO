import { PHOTO_GROUPING_CONFIG } from "./config.ts";
import { scoreGeometrySimilarity } from "./geometry.ts";
import { activityConflict, scoreSemanticSimilarity } from "./semantic.ts";
import { scoreTimeProximity, timeGapMs, tokyoDay } from "./time.ts";
import type { GroupingPhoto, PhotoPairSimilarity } from "./types.ts";
import { scoreBackgroundSimilarity, scoreVisualSimilarity } from "./visual.ts";

const globalStore = globalThis as typeof globalThis & {
  __uchinocoGroupingPairCache?: Map<string, PhotoPairSimilarity>;
};
const pairCache = (globalStore.__uchinocoGroupingPairCache ??= new Map());

export function groupingPairCacheKey(photoA: string, photoB: string, version: string) {
  const [left, right] = photoA < photoB ? [photoA, photoB] : [photoB, photoA];
  return `${version}::${left}::${right}`;
}

export function getGroupingPairCache(key: string) {
  return pairCache.get(key) ?? null;
}

export function clearGroupingPairCache() {
  pairCache.clear();
}

function score100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export function pairBlocks(a: GroupingPhoto, b: GroupingPhoto, visualScore: number): string[] {
  const blocks: string[] = [];
  const dayA = tokyoDay(a.capturedAt);
  const dayB = tokyoDay(b.capturedAt);
  if (!dayA || !dayB || dayA !== dayB) blocks.push("DIFFERENT_DAY");
  else if (timeGapMs(a.capturedAt, b.capturedAt) > PHOTO_GROUPING_CONFIG.maxGapMs) {
    blocks.push("TIME_GAP");
  }

  const tagsA = a.intelligence?.tags ?? null;
  const tagsB = b.intelligence?.tags ?? null;
  const sceneA = tagsA?.find((tag) =>
    ["home", "outdoors", "travel", "cafe", "park"].includes(tag),
  );
  const sceneB = tagsB?.find((tag) =>
    ["home", "outdoors", "travel", "cafe", "park"].includes(tag),
  );
  if (sceneA && sceneB && sceneA !== sceneB) blocks.push("SCENE_CONFLICT");

  const activities = ["sleeping", "playing", "eating", "looking_camera", "cuddling", "walking"];
  const activityA = tagsA?.find((tag) => activities.includes(tag)) ?? null;
  const activityB = tagsB?.find((tag) => activities.includes(tag)) ?? null;
  if (activityConflict(activityA, activityB) && visualScore < 90) {
    blocks.push("ACTIVITY_CONFLICT");
  }
  return blocks;
}

/** Pair score. Photo Intelligence overall is not an input. */
export function scorePhotoPair(a: GroupingPhoto, b: GroupingPhoto): PhotoPairSimilarity {
  const timeScore = scoreTimeProximity(a.capturedAt, b.capturedAt);
  const visualScore = scoreVisualSimilarity(a.visual, b.visual);
  const geometryScore = scoreGeometrySimilarity(a.analysis, b.analysis);
  const semanticScore = scoreSemanticSimilarity(
    a.intelligence?.tags ?? null,
    b.intelligence?.tags ?? null,
  );
  const backgroundScore = scoreBackgroundSimilarity(a.visual, b.visual);
  const weights = PHOTO_GROUPING_CONFIG.weights;
  const overall = score100(
    timeScore * weights.time +
      visualScore * weights.visual +
      geometryScore * weights.geometry +
      semanticScore * weights.semantic +
      backgroundScore * weights.background,
  );
  const [photoA, photoB] = a.photoId < b.photoId ? [a.photoId, b.photoId] : [b.photoId, a.photoId];
  return {
    photoA,
    photoB,
    timeScore,
    visualScore,
    geometryScore,
    semanticScore,
    backgroundScore,
    overall,
    blocks: pairBlocks(a, b, visualScore),
  };
}

export function cachedPhotoPair(
  a: GroupingPhoto,
  b: GroupingPhoto,
  version: string,
): PhotoPairSimilarity {
  const key = groupingPairCacheKey(a.photoId, b.photoId, version);
  const hit = pairCache.get(key);
  if (hit) return hit;
  const scored = scorePhotoPair(a, b);
  pairCache.set(key, scored);
  return scored;
}
