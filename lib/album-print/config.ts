/** Draft print renderer. Separate from the paid order PDF generator. */
export const ALBUM_PRINT_SCHEMA_VERSION = "print-render-v1";

/**
 * Editor column is 390px with 16px padding on each side, so the spread
 * is drawn at 358 CSS pixels. Cover edit uses a 292px book.
 * PDF type sizes are scaled from those CSS sizes so the relative type matches.
 */
export const ALBUM_PRINT_CONFIG = {
  schemaVersion: ALBUM_PRINT_SCHEMA_VERSION,
  /** One product page, millimetres. A spread is two of these side by side. */
  pageMm: 180,
  /** Phone-column spread width used by the page editor. */
  spreadDisplayPx: 358,
  /** Cover editor book width. */
  coverDisplayPx: 292,
  coverAspect: 709 / 941,
  dpi: {
    good: 250,
    warning: 180,
  },
  fonts: {
    editorial: { family: "Klee One", file: "KleeOne-Regular.ttf" },
    warm: { family: "Klee One", file: "KleeOne-Regular.ttf" },
    handwritten: { family: "Zen Kurenaido", file: "ZenKurenaido-Regular.ttf" },
    /** Geist has no Japanese file in this repo. The fallback is recorded, not silent. */
    minimal: { family: "Klee One", file: "KleeOne-Regular.ttf", explicitFallbackFrom: "Geist" },
  },
} as const;

export const PRINT_STALE_MESSAGE = "プレビュー作成後に編集されています";

export const ORDERED_PRINT_MESSAGE =
  "注文済みの印刷は、注文時のスナップショットを使います。編集中の下書きからは作り直しません。";
