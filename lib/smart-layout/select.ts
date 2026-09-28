/**
 * Task050 — Select best spread layout for a photo set.
 */
import { evaluateLayout } from "./assign.ts";
import { layoutsForPhotoCount, ALBUM_LAYOUTS } from "./layouts.ts";
import type {
  AlbumLayoutDefinition,
  LayoutMatchResult,
  LayoutPhotoInput,
  LayoutSelectionResult,
} from "./types.ts";

function tierRank(t: LayoutMatchResult["tier"]): number {
  if (t === "strict") return 0;
  if (t === "fallback") return 1;
  return 2;
}

/**
 * Photos-first layout selection:
 * filter by count → evaluate each layout → rank.
 * Does NOT pick a layout first and fill empty slots.
 */
export function findBestLayoutForPhotos(
  photos: LayoutPhotoInput[],
  layouts: AlbumLayoutDefinition[] = ALBUM_LAYOUTS,
): LayoutSelectionResult {
  if (photos.length === 0) {
    return { best: null, ranking: [], alternatives: [] };
  }

  const candidates =
    layouts.filter((l) => l.photoCount === photos.length).length > 0
      ? layouts.filter((l) => l.photoCount === photos.length)
      : layoutsForPhotoCount(photos.length);

  const ranking: LayoutMatchResult[] = candidates.map((layout) =>
    evaluateLayout(layout, photos),
  );

  ranking.sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier);
    if (tr !== 0) return tr;
    return b.scores.overall - a.scores.overall;
  });

  const usable = ranking.filter((r) => r.tier !== "unusable");
  const best = usable[0] ?? null;
  const alternatives = usable.slice(1, 3);

  return { best, ranking, alternatives };
}
