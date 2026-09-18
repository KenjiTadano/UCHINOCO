/**
 * Provider-independent document model for print generation.
 * No "server-only" — pure types used in tests and build tooling.
 */

export type FitMode = "contain" | "cover";

export type PrintPageItem = {
  photoId: string | null;
  /** original_path from order_photos snapshot; null for blank pages */
  imagePath: string | null;
  /** Resolved at PDF generation time from image bytes */
  sourceWidthPx: number | null;
  sourceHeightPx: number | null;
  fit: FitMode;
};

export type PrintPage = {
  /** 1-indexed page number */
  pageNumber: number;
  /** null = blank page */
  item: PrintPageItem | null;
};

export type PrintCover = {
  /** cover_original_path_snapshot */
  imagePath: string | null;
  /** album_title_snapshot — ASCII only in v1 (Japanese font not embedded) */
  titleText: string | null;
  fit: FitMode;
};

export type PrintDocumentSpec = {
  orderId: string;
  /** album_title_snapshot */
  title: string | null;
  productId: string;
  /** Trimmed print size in mm (excluding bleed) */
  printWidthMm: number;
  printHeightMm: number;
  /** Bleed in mm; 0 until Provider specs confirmed */
  bleedMm: number;
  cover: PrintCover;
  /** Content pages ordered by pageNumber ascending */
  pages: PrintPage[];
  /** From orders.pages */
  totalPageCount: number;
};

export type GeneratedPrintFile = {
  type: "cover" | "content" | "book";
  /** PII-free path: "orders/{orderId}/cover.pdf" */
  filename: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
  pageCount: number;
};

export type PrintGenerationResult = {
  cover: GeneratedPrintFile;
  content: GeneratedPrintFile;
};

export type DpiWarning = {
  photoId: string | null;
  imagePath: string;
  estimatedDpi: number;
  threshold: number;
};
