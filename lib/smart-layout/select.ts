/**
 * Task050 — Select best spread layout for a photo set.
 */
import { evaluateLayout } from "./assign.ts";
import { layoutsForPhotoCount, ALBUM_LAYOUTS } from "./layouts.ts";
import { filterTemplateCandidates } from "./template-system.ts";
import { withSmartLayoutV2Score, type SmartLayoutV2Context } from "./v2.ts";
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
  context: SmartLayoutV2Context = {},
): LayoutSelectionResult {
  if (photos.length === 0) {
    return { best: null, ranking: [], alternatives: [] };
  }

  const candidates =
    layouts.filter((l) => l.photoCount === photos.length).length > 0
      ? layouts.filter((l) => l.photoCount === photos.length)
      : layoutsForPhotoCount(photos.length);

  const shortlist = filterTemplateCandidates(candidates, photos, { ...context, preserveLegacy: true });
  const ranking: LayoutMatchResult[] = shortlist.map((layout) => withSmartLayoutV2Score(evaluateLayout(layout, photos), photos, context));
  // Crop viability is authoritative. Expand only when the cheap shortlist found no strict result.
  if (!ranking.some((result) => result.tier === "strict" && !result.invalid)) {
    const selected = new Set(shortlist.map((layout) => layout.id));
    ranking.push(...candidates.filter((layout) => !selected.has(layout.id)).map((layout) => withSmartLayoutV2Score(evaluateLayout(layout, photos), photos, context)));
  }

  ranking.sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier);
    if (tr !== 0) return tr;
    return (b.v2?.finalScore ?? b.scores.overall) - (a.v2?.finalScore ?? a.scores.overall) || a.layoutId.localeCompare(b.layoutId);
  });

  const usable = ranking.filter(
    (r) => r.tier !== "unusable" && !r.invalid,
  );
  const best = usable[0] ?? null;
  const alternatives = usable.slice(1, 3);

  return { best, ranking, alternatives };
}
