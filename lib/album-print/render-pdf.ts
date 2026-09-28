import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  clip,
  degrees,
  rotateRadians,
  translate,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ALBUM_DRAFT_CONFIG } from "../album-draft/config.ts";
import { getCoverColor } from "../album-cover-templates.ts";
import { textStylePreset } from "../album-polish/catalog.ts";
import type { DecorationId, TextStyleId } from "../album-polish/types.ts";
import { coverCropRect, orientedPixelSize } from "./crop.ts";
import { coverFontPt, spreadFontPt } from "./geometry.ts";
import { loadPrintFonts } from "./fonts.ts";
import { probeRaster } from "./images.ts";
import type { AlbumPrintSnapshot, PrintRect } from "./types.ts";

const INK = rgb(0.2, 0.18, 0.17);
const MARK = rgb(0.55, 0.45, 0.39);
const PAPER = rgb(0.973, 0.953, 0.933);

const MARK_PATH: Record<DecorationId, string> = {
  paw: "M16 24c4 0 6-2 6-4s-2-3-4-3-3 1-2 3c-2 0-4 1-4 3s2 4 4 1z M9 15a2 2 0 1 0 0.1 0z M14 11a2 2 0 1 0 0.1 0z M19 11a2 2 0 1 0 0.1 0z M23 15a2 2 0 1 0 0.1 0z",
  heart: "M16 26s-8-5.2-8-10a4.2 4.2 0 0 1 8-2 4.2 4.2 0 0 1 8 2c0 4.8-8 10-8 10z",
  star: "M16 6.5l2.2 6.2h6.3l-5 4 2 6.3-5.5-3.6-5.5 3.6 2-6.3-5-4h6.3z",
  tape: "M6 12h20v8H6z",
  leaf: "M8 22c8-1 14-8 16-14-6 1-13 6-16 14z",
  flower: "M16 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M16 10a3 3 0 1 0 0.1 0z M21 14a3 3 0 1 0 0.1 0z M19 20a3 3 0 1 0 0.1 0z M13 20a3 3 0 1 0 0.1 0z M11 14a3 3 0 1 0 0.1 0z",
  spark: "M16 7v4M16 21v4M7 16h4M21 16h4M10 10l2.2 2.2M19.8 19.8L22 22M22 10l-2.2 2.2M12.2 19.8L10 22",
};

function pdfRect(rect: PrintRect, pageWidth: number, pageHeight: number) {
  const x = rect.x * pageWidth;
  const height = rect.h * pageHeight;
  const y = pageHeight - rect.y * pageHeight - height;
  return { x, y, width: rect.w * pageWidth, height };
}

function clipRect(page: PDFPage, box: { x: number; y: number; width: number; height: number }) {
  page.pushOperators(pushGraphicsState(), rectangle(box.x, box.y, box.width, box.height), clip(), endPath());
}

function drawCoverImage(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
  drawn: { x: number; y: number; w: number; h: number },
  orientation: number,
) {
  const destX = box.x + drawn.x;
  const destY = box.y + box.height - drawn.y - drawn.h;
  if (orientation === 6) {
    page.drawImage(image, {
      x: destX + drawn.w,
      y: destY,
      width: drawn.h,
      height: drawn.w,
      rotate: degrees(90),
    });
    return;
  }
  if (orientation === 8) {
    page.drawImage(image, {
      x: destX,
      y: destY + drawn.h,
      width: drawn.h,
      height: drawn.w,
      rotate: degrees(-90),
    });
    return;
  }
  if (orientation === 3) {
    page.drawImage(image, {
      x: destX + drawn.w,
      y: destY + drawn.h,
      width: drawn.w,
      height: drawn.h,
      rotate: degrees(180),
    });
    return;
  }
  page.drawImage(image, { x: destX, y: destY, width: drawn.w, height: drawn.h });
}

async function embed(doc: PDFDocument, bytes: Uint8Array) {
  const probe = probeRaster(bytes);
  if (!probe) return null;
  const image = probe.kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  return { image, probe };
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  box: { x: number; y: number; width: number; height: number },
  align: "left" | "center",
) {
  const full = font.widthOfTextAtSize(text, size);
  // Editor titles are nowrap and captions are at most two lines. A line that is
  // only slightly wider than the slot stays one line, matching overflow:hidden
  // that still shows the glyphs. Longer copy wraps, and both lines are painted
  // even when the slot is shorter than the em size.
  const lines =
    full <= Math.max(box.width, size) * 1.25
      ? [text]
      : wrapLine(text, font, size, Math.max(box.width, size)).slice(0, 2);
  let cursor = box.y + box.height - size * 0.82;
  if (cursor < box.y) cursor = box.y;
  for (const line of lines) {
    const width = font.widthOfTextAtSize(line, size);
    const x = align === "center" ? box.x + (box.width - width) / 2 : box.x;
    page.drawText(line, { x, y: cursor, size, font, color: INK });
    cursor -= size * 1.25;
  }
}

export function renderContentHash(snapshot: AlbumPrintSnapshot, images: Record<string, Uint8Array>) {
  const hash = createHash("sha256");
  hash.update(snapshot.schemaVersion);
  hash.update(snapshot.fingerprint);
  for (const id of Object.keys(images).sort()) {
    hash.update(id);
    hash.update(createHash("sha256").update(images[id]).digest());
  }
  return hash.digest("hex");
}

export async function renderDraftPrintPdf(
  snapshot: AlbumPrintSnapshot,
  images: Record<string, Uint8Array>,
  assets?: { spreadBackground?: Uint8Array; coverBackground?: Uint8Array; coverOverlay?: Uint8Array },
) {
  const styleIds = new Set<TextStyleId>(["handwritten"]);
  for (const spread of snapshot.spreads) {
    for (const text of spread.texts) styleIds.add(text.styleId);
  }
  const fonts = await loadPrintFonts([...styleIds]);
  for (const font of fonts.values()) {
    if (!font.bytes) throw new Error("FONT_MISSING");
  }
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const embedded = new Map<TextStyleId, PDFFont>();
  for (const [styleId, font] of fonts) {
    embedded.set(styleId, await doc.embedFont(font.bytes!, { subset: false }));
  }
  const created = new Date(snapshot.generatedAt);
  doc.setCreationDate(created);
  doc.setModificationDate(created);
  doc.setProducer(snapshot.schemaVersion);
  doc.setCreator(snapshot.schemaVersion);

  const geometry = snapshot.geometry;
  const coverSize: [number, number] = [geometry.cover.widthPt, geometry.cover.heightPt];
  const coverPage = doc.addPage(coverSize);
  const tint = getCoverColor(snapshot.cover.colorId).tint;
  if (assets?.coverBackground) {
    const background = await embed(doc, assets.coverBackground);
    if (background) coverPage.drawImage(background.image, { x: 0, y: 0, width: coverSize[0], height: coverSize[1] });
  } else {
    coverPage.drawRectangle({ x: 0, y: 0, width: coverSize[0], height: coverSize[1], color: PAPER });
  }
  if (tint) {
    const hex = tint.replace("#", "");
    const color = rgb(
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    );
    coverPage.drawRectangle({ x: 0, y: 0, width: coverSize[0], height: coverSize[1], color, opacity: 0.28 });
  }
  const coverPhoto = snapshot.cover.photoId ? images[snapshot.cover.photoId] : undefined;
  if (coverPhoto) {
    const embeddedPhoto = await embed(doc, coverPhoto);
    if (!embeddedPhoto) throw new Error("BROKEN_IMAGE");
    const oriented = orientedPixelSize(embeddedPhoto.probe.width, embeddedPhoto.probe.height, embeddedPhoto.probe.orientation);
    const box = pdfRect(snapshot.cover.photoRect, coverSize[0], coverSize[1]);
    const drawn = coverCropRect(box.width, box.height, oriented.width, oriented.height, snapshot.cover.crop);
    clipRect(coverPage, box);
    drawCoverImage(coverPage, embeddedPhoto.image, box, drawn, embeddedPhoto.probe.orientation);
    coverPage.pushOperators(popGraphicsState());
  }
  if (assets?.coverOverlay) {
    const overlay = await embed(doc, assets.coverOverlay);
    if (overlay) coverPage.drawImage(overlay.image, { x: 0, y: 0, width: coverSize[0], height: coverSize[1] });
  }
  const coverFont = embedded.get("handwritten");
  if (!coverFont) throw new Error("FONT_MISSING");
  const titleSize = coverFontPt(21.5, geometry);
  const subSize = coverFontPt(12.5, geometry);
  const dateSize = coverFontPt(9.5, geometry);
  const titleTop = coverSize[1] * (1 - 0.09);
  if (snapshot.cover.dateLabel) {
    drawLines(coverPage, snapshot.cover.dateLabel, coverFont, dateSize, {
      x: coverSize[0] * 0.12,
      y: titleTop - dateSize * 1.4,
      width: coverSize[0] * 0.76,
      height: dateSize * 1.4,
    }, "center");
  }
  const titleBlockTop = titleTop - dateSize * 1.6;
  const titleBlockBottom = titleTop - dateSize * 1.6 - subSize * 1.8 - titleSize * 1.4;
  const titleCx = coverSize[0] / 2;
  const titleCy = (titleBlockTop + titleBlockBottom) / 2;
  // .album-cover-book-title uses rotate(-5deg). CSS's clockwise-positive
  // matches a small counterclockwise tilt in PDF coordinates.
  coverPage.pushOperators(
    pushGraphicsState(),
    translate(titleCx, titleCy),
    rotateRadians((5 * Math.PI) / 180),
    translate(-titleCx, -titleCy),
  );
  drawLines(coverPage, snapshot.cover.subtitle, coverFont, subSize, {
    x: coverSize[0] * 0.14,
    y: titleTop - dateSize * 1.6 - subSize * 1.5,
    width: coverSize[0] * 0.72,
    height: subSize * 1.5,
  }, "center");
  drawLines(coverPage, snapshot.cover.title, coverFont, titleSize, {
    x: coverSize[0] * 0.12,
    y: titleTop - dateSize * 1.6 - subSize * 1.8 - titleSize * 1.4,
    width: coverSize[0] * 0.76,
    height: titleSize * 1.5,
  }, "center");
  coverPage.pushOperators(popGraphicsState());

  const spreadSize: [number, number] = [geometry.spread.widthPt, geometry.spread.heightPt];
  for (const spread of snapshot.spreads) {
    const page = doc.addPage(spreadSize);
    if (assets?.spreadBackground) {
      const background = await embed(doc, assets.spreadBackground);
      if (background) page.drawImage(background.image, { x: 0, y: 0, width: spreadSize[0], height: spreadSize[1] });
    } else {
      page.drawRectangle({ x: 0, y: 0, width: spreadSize[0], height: spreadSize[1], color: PAPER });
    }
    for (const frame of spread.frames) {
      const bytes = images[frame.photoId];
      if (!bytes) throw new Error("MISSING_IMAGE");
      const embeddedPhoto = await embed(doc, bytes);
      if (!embeddedPhoto) throw new Error("BROKEN_IMAGE");
      const oriented = orientedPixelSize(embeddedPhoto.probe.width, embeddedPhoto.probe.height, embeddedPhoto.probe.orientation);
      const box = pdfRect(frame.rect, spreadSize[0], spreadSize[1]);
      const drawn = coverCropRect(box.width, box.height, oriented.width, oriented.height, frame.crop);
      clipRect(page, box);
      drawCoverImage(page, embeddedPhoto.image, box, drawn, embeddedPhoto.probe.orientation);
      page.pushOperators(popGraphicsState());
    }
    for (const text of spread.texts) {
      const font = embedded.get(text.styleId);
      if (!font) throw new Error("FONT_MISSING");
      const css = Number.parseFloat(textStylePreset(text.styleId).fontSize) || 13;
      const box = pdfRect(text.rect, spreadSize[0], spreadSize[1]);
      drawLines(page, text.text, font, spreadFontPt(css, geometry), box, "center");
    }
    for (const decoration of spread.decorations) {
      const path = MARK_PATH[decoration.decorationId];
      if (!path) throw new Error("INVALID_DECORATION");
      const box = pdfRect(decoration.rect, spreadSize[0], spreadSize[1]);
      const mark = Math.min(box.width, box.height) * (decoration.scale === "small" ? 0.7 : 1);
      const scale = mark / 32;
      page.drawEllipse({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        xScale: box.width / 2,
        yScale: box.height / 2,
        color: rgb(1, 0.98, 0.96),
        opacity: 0.82,
      });
      page.drawSvgPath(path, {
        x: box.x + (box.width - mark) / 2,
        y: box.y + box.height - (box.height - mark) / 2,
        scale,
        borderColor: MARK,
        borderWidth: 1.2,
        color: rgb(0.55, 0.45, 0.39),
        opacity: 0.9,
      });
    }
    const book = ALBUM_DRAFT_CONFIG.book;
    const unit = spreadSize[0] / geometry.canvas.width;
    const trimX = book.left.x * unit;
    const trimW = (book.right.x + book.right.w - book.left.x) * unit;
    const trimH = book.left.h * unit;
    const trimY = spreadSize[1] - (book.left.y + book.left.h) * unit;
    page.setTrimBox(trimX, trimY, trimW, trimH);
    page.setBleedBox(0, 0, spreadSize[0], spreadSize[1]);
  }

  const bytes = await doc.save();
  return { bytes, contentHash: renderContentHash(snapshot, images), pageCount: doc.getPageCount() };
}
