import { ALBUM_DRAFT_CONFIG } from "../album-draft/config.ts";
import { bookPrintMetrics } from "../album-draft/pages.ts";
import { mmToPoints } from "../print/layout/units.ts";
import { ALBUM_PRINT_CONFIG } from "./config.ts";
import { ALBUM_PRINT_SPEC } from "./print-spec.ts";
import type { PrintGeometry, PrintLength, PrintRect } from "./types.ts";

function length(px: number, mmPerPx: number): PrintLength {
  const mm = px * mmPerPx;
  return { px, mm, pt: mmToPoints(mm) };
}

function rectFromPx(
  box: { x: number; y: number; w: number; h: number },
  canvas: { width: number; height: number },
  mmPerPx: number,
): PrintRect {
  return {
    x: box.x / canvas.width,
    y: box.y / canvas.height,
    w: box.w / canvas.width,
    h: box.h / canvas.height,
    xMm: box.x * mmPerPx,
    yMm: box.y * mmPerPx,
    wMm: box.w * mmPerPx,
    hMm: box.h * mmPerPx,
    xPt: mmToPoints(box.x * mmPerPx),
    yPt: mmToPoints(box.y * mmPerPx),
    wPt: mmToPoints(box.w * mmPerPx),
    hPt: mmToPoints(box.h * mmPerPx),
  };
}

/** Editor canvas mapped onto two product pages. Layout is not recomputed. */
export function buildPrintGeometry(): PrintGeometry {
  const metrics = bookPrintMetrics();
  const book = ALBUM_DRAFT_CONFIG.book;
  const widthMm = ALBUM_PRINT_SPEC.trimWidthMm * 2;
  const heightMm = ALBUM_PRINT_SPEC.trimHeightMm;
  const mmPerPx = widthMm / metrics.canvas.width;
  const coverWidthMm = ALBUM_PRINT_SPEC.pdfWidthMm;
  const coverHeightMm = ALBUM_PRINT_SPEC.pdfHeightMm;
  return {
    canvas: metrics.canvas,
    spread: {
      widthMm,
      heightMm,
      widthPt: mmToPoints(widthMm),
      heightPt: mmToPoints(heightMm),
    },
    cover: {
      widthMm: coverWidthMm,
      heightMm: coverHeightMm,
      widthPt: mmToPoints(coverWidthMm),
      heightPt: mmToPoints(coverHeightMm),
    },
    page: {
      widthMm: ALBUM_PRINT_SPEC.pdfWidthMm,
      heightMm: ALBUM_PRINT_SPEC.pdfHeightMm,
      widthPt: mmToPoints(ALBUM_PRINT_SPEC.pdfWidthMm),
      heightPt: mmToPoints(ALBUM_PRINT_SPEC.pdfHeightMm),
      trimWidthMm: ALBUM_PRINT_SPEC.trimWidthMm,
      trimHeightMm: ALBUM_PRINT_SPEC.trimHeightMm,
    },
    bleed: length(metrics.bleed, mmPerPx),
    trim: length(book.trim, mmPerPx),
    gutter: {
      x: length(metrics.gutter.x, mmPerPx),
      width: length(metrics.gutter.width, mmPerPx),
    },
    safeArea: {
      left: rectFromPx(metrics.safeArea.left, metrics.canvas, mmPerPx),
      right: rectFromPx(metrics.safeArea.right, metrics.canvas, mmPerPx),
    },
    pageMm: ALBUM_PRINT_SPEC.trimWidthMm,
  };
}

export function normRect(
  norm: { x: number; y: number; w: number; h: number },
  canvas: { width: number; height: number },
  mmPerPx: number,
): PrintRect {
  return rectFromPx(
    {
      x: norm.x * canvas.width,
      y: norm.y * canvas.height,
      w: norm.w * canvas.width,
      h: norm.h * canvas.height,
    },
    canvas,
    mmPerPx,
  );
}

export function spreadFontPt(cssPx: number, geometry: PrintGeometry) {
  return (cssPx / ALBUM_PRINT_CONFIG.spreadDisplayPx) * geometry.spread.widthPt;
}

export function coverFontPt(cssPx: number, geometry: PrintGeometry) {
  return (cssPx / ALBUM_PRINT_CONFIG.coverDisplayPx) * geometry.cover.widthPt;
}

/** CSS object-position percentages, shared by the editor and the PDF. */
export function gutterNorm(geometry: PrintGeometry) {
  return {
    x: geometry.gutter.x.px / geometry.canvas.width,
    y: 0,
    w: geometry.gutter.width.px / geometry.canvas.width,
    h: 1,
  };
}
