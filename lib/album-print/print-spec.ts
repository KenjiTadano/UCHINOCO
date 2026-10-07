/**
 * Physical specification shared by the album editor and draft PDF renderer.
 * A5 portrait candidate geometry. Provider-specific production requirements
 * stay explicitly unconfirmed until they are verified against a real contract.
 */
export const ALBUM_PRINT_SPEC = {
  provider: null,
  trimWidthMm: 148,
  trimHeightMm: 210,
  bleedMm: 3,
  safeInsetMm: 3,
  /** Binding-specific extra gutter is intentionally not guessed. */
  gutterMm: null,
  pageAspectRatio: 148 / 210,
  pdfWidthMm: 154,
  pdfHeightMm: 216,
  colorSpace: "RGB",
  requiredPdfStandard: null,
  iccProfile: null,
  binding: null,
  paper: null,
  productionReady: false,
} as const;

export type AlbumPrintSpec = typeof ALBUM_PRINT_SPEC;
