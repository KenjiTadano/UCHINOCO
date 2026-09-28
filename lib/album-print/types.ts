import type { CoverColorId, CoverTemplateId } from "../album-cover-templates.ts";
import type { DecorationId, TextKind, TextStyleId } from "../album-polish/types.ts";

export type PrintLength = { px: number; mm: number; pt: number };

export type PrintRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  xPt: number;
  yPt: number;
  wPt: number;
  hPt: number;
};

export type PrintGeometry = {
  canvas: { width: number; height: number };
  spread: { widthMm: number; heightMm: number; widthPt: number; heightPt: number };
  cover: { widthMm: number; heightMm: number; widthPt: number; heightPt: number };
  bleed: PrintLength;
  trim: PrintLength;
  gutter: { x: PrintLength; width: PrintLength };
  safeArea: { left: PrintRect; right: PrintRect };
  pageMm: number;
};

export type PrintCrop = { x: number; y: number; scale: number };

export type PrintFrame = {
  id: string;
  frameId: string;
  revision: number;
  side: "left" | "right";
  photoId: string;
  storagePath: string | null;
  imageKind: "original";
  crop: PrintCrop;
  rect: PrintRect;
  crossesGutter: boolean;
};

export type PrintText = {
  id: string;
  revision: number;
  slotId: string;
  kind: TextKind;
  text: string;
  styleId: TextStyleId;
  fontFamily: string;
  rect: PrintRect;
};

export type PrintDecoration = {
  id: string;
  revision: number;
  slotId: string;
  decorationId: DecorationId;
  scale: "small" | "medium";
  rect: PrintRect;
};

export type PrintSpread = {
  id: string;
  position: number;
  revision: number;
  layoutId: string;
  frames: PrintFrame[];
  texts: PrintText[];
  decorations: PrintDecoration[];
};

export type PrintCover = {
  revision: number;
  photoId: string | null;
  storagePath: string | null;
  imageKind: "original";
  title: string;
  subtitle: string;
  dateLabel: string;
  templateId: CoverTemplateId;
  colorId: CoverColorId;
  /** object-fit cover, centered. The cover editor does not store a crop. */
  crop: PrintCrop;
  photoRect: PrintRect;
};

export type PrintRevisionRecord = {
  draft: number;
  cover: number;
  spreads: Array<{
    id: string;
    revision: number;
    frames: Array<{ id: string; revision: number }>;
    texts: Array<{ id: string; revision: number }>;
    decorations: Array<{ id: string; revision: number }>;
  }>;
};

export type AlbumPrintSnapshot = {
  albumId: string;
  draftVersionId: string;
  cover: PrintCover;
  spreads: PrintSpread[];
  generatedAt: string;
  sourceRevision: number;
  schemaVersion: string;
  fingerprint: string;
  revisionDigest: string;
  revisions: PrintRevisionRecord;
  geometry: PrintGeometry;
};

export type PrintIssueCode =
  | "MISSING_IMAGE"
  | "BROKEN_IMAGE"
  | "FONT_MISSING"
  | "FONT_FALLBACK"
  | "TEXT_OVERFLOW"
  | "INVALID_PRINT_GEOMETRY"
  | "GUTTER_VIOLATION"
  | "SAFE_AREA_VIOLATION"
  | "INVALID_DECORATION"
  | "DECORATION_COLLISION"
  | "LOW_DPI"
  | "EMPTY_OPPOSITE_PAGE"
  | "SPARSE_SPREAD"
  | "EMPTY_SPREAD";

export type PrintIssue = {
  code: PrintIssueCode;
  severity: "blocking" | "warning";
  message: string;
  spreadId?: string;
  photoId?: string;
  dpi?: number;
  level?: "good" | "warning" | "low_resolution";
};
