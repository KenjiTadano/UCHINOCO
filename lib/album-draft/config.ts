/** Task056 — rank story spreads onto existing layouts. */
export const ALBUM_DRAFT_VERSION = "album-draft-v1";

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
    left: { x: 115, y: 210, w: 414, h: 816 },
    right: { x: 548, y: 210, w: 414, h: 816 },
    /** Future print metrics. Not a PDF export. */
    bleed: 18,
    trim: 16,
    /** Keep frames off the spine. */
    gutterInset: 22,
  },
} as const;
