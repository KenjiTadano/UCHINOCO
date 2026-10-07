import { ALBUM_PRINT_SPEC } from "../album-print/print-spec.ts";

/** Task056 — rank story spreads onto existing layouts. */
export const ALBUM_DRAFT_VERSION = "album-draft-v3";

export const ALBUM_DRAFT_CONFIG = {
  /** Ranking bonuses only. Photo count still comes from the layout catalog. */
  bonus: {
    density: 4,
    story: 3,
    heroUnsafe: 18,
    /** Primary + secondary: prefer a larger lead frame when the crop stays strict. */
    supportLead: 8,
  },
  heroSafety: {
    face: 62,
    head: 62,
    ear: 45,
    subjectScale: 35,
  },
  gate: {
    face: 50,
    head: 45,
    ear: 35,
    maxScale: 2.2,
    /** Two primaries: smaller frame / larger frame. */
    evenPrimaryRatio: 0.72,
    /** One photo should fill a meaningful part of its page. */
    minSinglePageRatio: 0.32,
  },
  book: {
    canvas: { width: 1076, height: 1264 },
    left: { x: 115, y: (1264 - 414 / ALBUM_PRINT_SPEC.pageAspectRatio) / 2, w: 414, h: 414 / ALBUM_PRINT_SPEC.pageAspectRatio },
    right: { x: 548, y: (1264 - 414 / ALBUM_PRINT_SPEC.pageAspectRatio) / 2, w: 414, h: 414 / ALBUM_PRINT_SPEC.pageAspectRatio },
    /** Display units derived from the physical A5 trim width. */
    bleed: (414 * ALBUM_PRINT_SPEC.bleedMm) / ALBUM_PRINT_SPEC.trimWidthMm,
    trim: (414 * ALBUM_PRINT_SPEC.safeInsetMm) / ALBUM_PRINT_SPEC.trimWidthMm,
    /** Extra binding gutter is not confirmed; use the common safe inset only. */
    gutterInset: (414 * ALBUM_PRINT_SPEC.safeInsetMm) / ALBUM_PRINT_SPEC.trimWidthMm,
  },
} as const;
