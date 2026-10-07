/**
 * Physical specification shared by the album editor and draft PDF renderer.
 * Values are based on the current A5 portrait candidate from 製本直送.com.
 */
export const ALBUM_PRINT_SPEC = {
  provider: "製本直送.com",
  trimWidthMm: 148,
  trimHeightMm: 210,
  bleedMm: 3,
  safeInsetMm: 3,
  /** Binding-specific extra gutter is intentionally not guessed. */
  gutterMm: 0,
  pageAspectRatio: 148 / 210,
  pdfWidthMm: 154,
  pdfHeightMm: 216,
  colorSpace: "CMYK",
} as const;

export type AlbumPrintSpec = typeof ALBUM_PRINT_SPEC;
