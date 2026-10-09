import { mmToPoints } from "../print/layout/units.ts";
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, clip, degrees, rotateRadians, translate, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { ELEMENT_COLORS, ELEMENT_BACKGROUNDS, type ElementDecorationId, type StampId } from "../album-elements/model.ts";
import { getCoverColor } from "../album-cover-templates.ts";
import { textStylePreset } from "../album-polish/catalog.ts";
import type { DecorationId, TextStyleId } from "../album-polish/types.ts";
import { coverCropRect, orientedPixelSize } from "./crop.ts";
import { coverFontPt, spreadFontPt } from "./geometry.ts";
import { loadPrintFonts } from "./fonts.ts";
import { probeRaster } from "./images.ts";
import { ALBUM_PRINT_SPEC } from "./print-spec.ts";
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

const PAGE_MARK_PATH: Partial<Record<StampId | ElementDecorationId, string>> = {
  ...MARK_PATH,
  sparkle: MARK_PATH.spark,
  bone: "M8 11c-3-3-7 1-4 4l11 11c3 3 7-1 4-4l2 2c3 3 7-1 4-4L14 5c-3-3-7 1-4 4z",
  fish: "M3 16c6-8 16-8 23 0-7 8-17 8-23 0z M3 16l-2-6v12z M18 14a1.5 1.5 0 1 0 0.1 0z",
  crown: "M5 10l7 6 4-10 4 10 7-6-2 16H7z M8 22h16",
  birthday: "M7 22h18v5H7z M10 22V12M16 22V8M22 22V12M10 8v3M16 4v3M22 8v3",
  "first-time": "M8 6h15v21H8z M12 12h7M12 17h7M12 22h5",
  outing: "M16 28s-9-10-9-16a9 9 0 1 1 18 0c0 6-9 16-9 16z M16 12a3 3 0 1 0 0.1 0z",
  spring: MARK_PATH.flower,
  summer: "M16 3v6M16 23v6M3 16h6M23 16h6M7 7l4 4M21 21l4 4M25 7l-4 4M11 21l-4 4M16 12a4 4 0 1 0 0.1 0z",
  autumn: MARK_PATH.leaf,
  winter: "M16 3v26M5 9l22 14M27 9L5 23M12 6l4 3 4-3M12 26l4-3 4 3M4 14l1-5 5 1M27 18l-1 5-5-1M27 14l-1-5-5 1M4 18l1 5 5-1",
  line: "M2 16h28",
  tape: MARK_PATH.tape,
  corner: "M6 18V6h12M26 14v12H14",
  bubble: "M5 7h22v15H16l-6 5v-5H5z",
  ribbon: "M3 18c5-10 9 10 14 0s9 10 12 0",
};

function pdfColor(hex: string) {
  const value = hex.replace("#", "");
  return rgb(Number.parseInt(value.slice(0, 2), 16) / 255, Number.parseInt(value.slice(2, 4), 16) / 255, Number.parseInt(value.slice(4, 6), 16) / 255);
}

function pdfRect(rect: PrintRect, pageWidth: number, pageHeight: number) {
  const x = rect.x * pageWidth;
  const height = rect.h * pageHeight;
  const y = pageHeight - rect.y * pageHeight - height;
  return { x, y, width: rect.w * pageWidth, height };
}

function clipRect(page: PDFPage, box: { x: number; y: number; width: number; height: number }) {
  page.pushOperators(pushGraphicsState(), rectangle(box.x, box.y, box.width, box.height), clip(), endPath());
}

function drawCoverImage(page: PDFPage, image: PDFImage, box: { x: number; y: number; width: number; height: number }, drawn: { x: number; y: number; w: number; h: number }, orientation: number) {
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

function drawLines(page: PDFPage, text: string, font: PDFFont, size: number, box: { x: number; y: number; width: number; height: number }, align: "left" | "center" | "right", color = INK) {
  const maxWidth = Math.max(box.width, size);
  const lines = text.includes("\n") ? text.split("\n").flatMap((paragraph) => (paragraph ? wrapLine(paragraph, font, size, maxWidth) : [""])) : font.widthOfTextAtSize(text, size) <= maxWidth * 1.25 ? [text] : wrapLine(text, font, size, maxWidth);
  // Editor titles are nowrap and captions are at most two lines. A line that is
  // only slightly wider than the slot stays one line, matching overflow:hidden
  // that still shows the glyphs. Longer copy wraps; the box remains the clip guide.
  let cursor = box.y + box.height - size * 0.82;
  if (cursor < box.y) cursor = box.y;
  for (const line of lines) {
    if (!line) {
      cursor -= size * 1.25;
      continue;
    }
    const width = font.widthOfTextAtSize(line, size);
    const x = align === "center" ? box.x + (box.width - width) / 2 : align === "right" ? box.x + box.width - width : box.x;
    page.drawText(line, { x, y: cursor, size, font, color });
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

export async function renderDraftPrintPdf(snapshot: AlbumPrintSnapshot, images: Record<string, Uint8Array>, assets?: { spreadBackground?: Uint8Array; coverBackground?: Uint8Array; coverOverlay?: Uint8Array }) {
  const styleIds = new Set<TextStyleId>(["handwritten"]);
  if (snapshot.compositionPlan?.items.some((item) => item.kind === "title" || item.kind === "event")) styleIds.add("editorial");
  for (const spread of snapshot.spreads) {
    for (const text of spread.texts) styleIds.add(text.styleId);
    for (const element of spread.elements) if (element.type === "text") styleIds.add(element.fontId);
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

  const imageCache = new Map<string, Awaited<ReturnType<typeof embed>>>();
  const embeddedPhoto = async (photoId: string) => {
    if (imageCache.has(photoId)) return imageCache.get(photoId) ?? null;
    const bytes = images[photoId];
    if (!bytes) throw new Error("MISSING_IMAGE");
    const value = await embed(doc, bytes);
    imageCache.set(photoId, value);
    return value;
  };

  const geometry = snapshot.geometry;
  const coverSize: [number, number] = [geometry.cover.widthPt, geometry.cover.heightPt];
  const coverPage = doc.addPage(coverSize);
  const coverBleed = mmToPoints(ALBUM_PRINT_SPEC.bleedMm);
  coverPage.setTrimBox(coverBleed, coverBleed, mmToPoints(ALBUM_PRINT_SPEC.trimWidthMm), mmToPoints(ALBUM_PRINT_SPEC.trimHeightMm));
  coverPage.setBleedBox(0, 0, coverSize[0], coverSize[1]);
  const tint = getCoverColor(snapshot.cover.colorId).tint;
  if (assets?.coverBackground) {
    const background = await embed(doc, assets.coverBackground);
    if (background) coverPage.drawImage(background.image, { x: 0, y: 0, width: coverSize[0], height: coverSize[1] });
  } else {
    coverPage.drawRectangle({ x: 0, y: 0, width: coverSize[0], height: coverSize[1], color: PAPER });
  }
  if (tint) {
    const hex = tint.replace("#", "");
    const color = rgb(Number.parseInt(hex.slice(0, 2), 16) / 255, Number.parseInt(hex.slice(2, 4), 16) / 255, Number.parseInt(hex.slice(4, 6), 16) / 255);
    coverPage.drawRectangle({ x: 0, y: 0, width: coverSize[0], height: coverSize[1], color, opacity: 0.28 });
  }
  const coverPhoto = snapshot.cover.photoId ? images[snapshot.cover.photoId] : undefined;
  if (coverPhoto) {
    const coverImage = await embeddedPhoto(snapshot.cover.photoId!);
    if (!coverImage) throw new Error("BROKEN_IMAGE");
    const oriented = orientedPixelSize(coverImage.probe.width, coverImage.probe.height, coverImage.probe.orientation);
    const box = pdfRect(snapshot.cover.photoRect, coverSize[0], coverSize[1]);
    const drawn = coverCropRect(box.width, box.height, oriented.width, oriented.height, snapshot.cover.crop);
    clipRect(coverPage, box);
    drawCoverImage(coverPage, coverImage.image, box, drawn, coverImage.probe.orientation);
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
    drawLines(
      coverPage,
      snapshot.cover.dateLabel,
      coverFont,
      dateSize,
      {
        x: coverSize[0] * 0.12,
        y: titleTop - dateSize * 1.4,
        width: coverSize[0] * 0.76,
        height: dateSize * 1.4,
      },
      "center",
    );
  }
  const titleBlockTop = titleTop - dateSize * 1.6;
  const titleBlockBottom = titleTop - dateSize * 1.6 - subSize * 1.8 - titleSize * 1.4;
  const titleCx = coverSize[0] / 2;
  const titleCy = (titleBlockTop + titleBlockBottom) / 2;
  // .album-cover-book-title uses rotate(-5deg). CSS's clockwise-positive
  // matches a small counterclockwise tilt in PDF coordinates.
  coverPage.pushOperators(pushGraphicsState(), translate(titleCx, titleCy), rotateRadians((5 * Math.PI) / 180), translate(-titleCx, -titleCy));
  drawLines(
    coverPage,
    snapshot.cover.subtitle,
    coverFont,
    subSize,
    {
      x: coverSize[0] * 0.14,
      y: titleTop - dateSize * 1.6 - subSize * 1.5,
      width: coverSize[0] * 0.72,
      height: subSize * 1.5,
    },
    "center",
  );
  drawLines(
    coverPage,
    snapshot.cover.title,
    coverFont,
    titleSize,
    {
      x: coverSize[0] * 0.12,
      y: titleTop - dateSize * 1.6 - subSize * 1.8 - titleSize * 1.4,
      width: coverSize[0] * 0.76,
      height: titleSize * 1.5,
    },
    "center",
  );
  coverPage.pushOperators(popGraphicsState());

  const pageWidth = geometry.page.widthPt;
  const pageHeight = geometry.page.heightPt;
  const trimWidth = mmToPoints(ALBUM_PRINT_SPEC.trimWidthMm);
  const trimHeight = mmToPoints(ALBUM_PRINT_SPEC.trimHeightMm);
  const bleed = mmToPoints(ALBUM_PRINT_SPEC.bleedMm);
  const spreadWidth = trimWidth * 2;
  const spreadHeight = trimHeight;
  const spreadBackground = assets?.spreadBackground ? await embed(doc, assets.spreadBackground) : null;

  const pageBox = (rect: PrintRect, side: 0 | 1) => {
    const logical = pdfRect(rect, spreadWidth, spreadHeight);
    return { ...logical, x: logical.x + bleed - side * trimWidth, y: logical.y + bleed };
  };
  const intersectsSide = (rect: PrintRect, side: 0 | 1) => rect.x < (side + 1) / 2 && rect.x + rect.w > side / 2;
  const clippedToTrim = (box: { x: number; y: number; width: number; height: number }) => {
    const left = Math.max(bleed, box.x);
    const right = Math.min(bleed + trimWidth, box.x + box.width);
    const bottom = Math.max(bleed, box.y);
    const top = Math.min(bleed + trimHeight, box.y + box.height);
    if (right <= left || top <= bottom) return null;
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  };

  const sequence = snapshot.compositionPlan?.items ?? snapshot.spreads.map((spread) => ({ kind: "spread" as const, role: "STORY" as const, density: "MEDIUM" as const, storySpreadId: spread.storySpreadId }));
  for (const item of sequence) {
    if (item.kind === "title" || item.kind === "event") {
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: PAPER });
      const font = embedded.get("editorial");
      if (!font) throw new Error("FONT_MISSING");
      const safeWidth = trimWidth - mmToPoints(ALBUM_PRINT_SPEC.safeInsetMm * 2);
      const safeHeight = trimHeight - mmToPoints(ALBUM_PRINT_SPEC.safeInsetMm * 2);
      const safeX = (pageWidth - trimWidth) / 2 + bleed + mmToPoints(ALBUM_PRINT_SPEC.safeInsetMm);
      if (item.kind === "title") {
        drawLines(page, item.title, font, mmToPoints(7), { x: safeX, y: bleed + safeHeight * 0.58, width: safeWidth, height: mmToPoints(18) }, "center");
        drawLines(page, item.petName, font, mmToPoints(4.2), { x: safeX, y: bleed + safeHeight * 0.46, width: safeWidth, height: mmToPoints(10) }, "center");
        drawLines(page, item.period, font, mmToPoints(3.8), { x: safeX, y: bleed + safeHeight * 0.39, width: safeWidth, height: mmToPoints(9) }, "center");
      } else {
        drawLines(page, item.title, font, mmToPoints(6), { x: safeX, y: bleed + safeHeight * 0.54, width: safeWidth, height: mmToPoints(16) }, "center");
        drawLines(page, item.dateLabel, font, mmToPoints(4.2), { x: safeX, y: bleed + safeHeight * 0.44, width: safeWidth, height: mmToPoints(10) }, "center");
      }
      page.setTrimBox(bleed, bleed, trimWidth, trimHeight);
      page.setBleedBox(0, 0, pageWidth, pageHeight);
      continue;
    }
    const spread = snapshot.spreads.find((candidate) => candidate.storySpreadId === item.storySpreadId);
    if (!spread) continue;
    for (const side of [0, 1] as const) {
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: PAPER });
      if (spreadBackground) {
        clipRect(page, { x: bleed, y: bleed, width: trimWidth, height: trimHeight });
        page.drawImage(spreadBackground.image, { x: bleed - side * trimWidth, y: bleed, width: spreadWidth, height: spreadHeight });
        page.pushOperators(popGraphicsState());
      }
      for (const background of spread.backgrounds) {
        if (!intersectsSide(background.rect, side)) continue;
        const color = ELEMENT_BACKGROUNDS.find((item) => item.id === background.backgroundId)?.hex;
        const box = clippedToTrim(pageBox(background.rect, side));
        if (color && box) page.drawRectangle({ ...box, color: pdfColor(color) });
      }
      for (const frame of spread.frames) {
        if (!intersectsSide(frame.rect, side)) continue;
        const photo = await embeddedPhoto(frame.photoId);
        if (!photo) throw new Error("BROKEN_IMAGE");
        const oriented = orientedPixelSize(photo.probe.width, photo.probe.height, photo.probe.orientation);
        const box = pageBox(frame.rect, side);
        const clipBox = clippedToTrim(box);
        if (!clipBox) continue;
        const drawn = coverCropRect(box.width, box.height, oriented.width, oriented.height, frame.crop);
        clipRect(page, clipBox);
        drawCoverImage(page, photo.image, box, drawn, photo.probe.orientation);
        page.pushOperators(popGraphicsState());
      }
      for (const text of spread.texts) {
        if (!intersectsSide(text.rect, side) || (text.rect.x + text.rect.w / 2 < 0.5 ? 0 : 1) !== side) continue;
        const font = embedded.get(text.styleId);
        if (!font) throw new Error("FONT_MISSING");
        const css = Number.parseFloat(textStylePreset(text.styleId).fontSize) || 13;
        drawLines(page, text.text, font, spreadFontPt(css, geometry), pageBox(text.rect, side), "center");
      }
      for (const decoration of spread.decorations) {
        if ((decoration.rect.x + decoration.rect.w / 2 < 0.5 ? 0 : 1) !== side) continue;
        const markPath = MARK_PATH[decoration.decorationId];
        if (!markPath) throw new Error("INVALID_DECORATION");
        const box = pageBox(decoration.rect, side);
        const mark = Math.min(box.width, box.height) * (decoration.scale === "small" ? 0.7 : 1);
        page.drawEllipse({ x: box.x + box.width / 2, y: box.y + box.height / 2, xScale: box.width / 2, yScale: box.height / 2, color: rgb(1, 0.98, 0.96), opacity: 0.82 });
        page.drawSvgPath(markPath, { x: box.x + (box.width - mark) / 2, y: box.y + box.height - (box.height - mark) / 2, scale: mark / 32, borderColor: MARK, borderWidth: 1.2, color: rgb(0.55, 0.45, 0.39), opacity: 0.9 });
      }
      for (const element of spread.elements) {
        if ((element.rect.x + element.rect.w / 2 < 0.5 ? 0 : 1) !== side) continue;
        const box = pageBox(element.rect, side);
        const colorId = "colorId" in element ? element.colorId : "ink";
        const color = ELEMENT_COLORS.find((item) => item.id === colorId)?.hex ?? "#332f2b";
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        page.pushOperators(pushGraphicsState(), translate(centerX, centerY), rotateRadians((-element.rotation * Math.PI) / 180), translate(-centerX, -centerY));
        if (element.type === "text") {
          const font = embedded.get(element.fontId);
          if (!font) throw new Error("FONT_MISSING");
          const fontSize = spreadFontPt(element.fontSize, geometry);
          if (element.bold) {
            drawLines(page, element.text, font, fontSize, { ...box, x: box.x - 0.2 }, element.align, pdfColor(color));
            drawLines(page, element.text, font, fontSize, { ...box, x: box.x + 0.2 }, element.align, pdfColor(color));
          }
          drawLines(page, element.text, font, fontSize, box, element.align, pdfColor(color));
        } else {
          const markPath = PAGE_MARK_PATH[element.type === "stamp" ? element.stampId : element.decorationId];
          if (!markPath) throw new Error("INVALID_DECORATION");
          const mark = Math.min(box.width, box.height) * 0.88;
          page.drawSvgPath(markPath, { x: centerX - mark / 2, y: centerY - mark / 2, scale: mark / 32, borderColor: pdfColor(color), borderWidth: element.type === "decoration" && element.decorationId === "line" ? 2 : 1, color: pdfColor(color), opacity: element.type === "stamp" ? 0.92 : 0.76 });
        }
        page.pushOperators(popGraphicsState());
      }
      page.setTrimBox(bleed, bleed, trimWidth, trimHeight);
      page.setBleedBox(0, 0, pageWidth, pageHeight);
    }
  }
  if (snapshot.spreads.some(spread => spread.layoutId.startsWith("E_"))) {
    const back = doc.addPage([pageWidth,pageHeight]);
    back.drawRectangle({x:0,y:0,width:pageWidth,height:pageHeight,color:PAPER});
    const font = embedded.get("handwritten");
    if (font) {
      drawLines(back,"UCHINOCO",font,mmToPoints(4),{x:bleed,y:bleed+mmToPoints(25),width:trimWidth,height:mmToPoints(10)},"center");
      drawLines(back,"うちの子との、大切な日々。",font,mmToPoints(3),{x:bleed,y:bleed+mmToPoints(15),width:trimWidth,height:mmToPoints(10)},"center");
    }
    back.setTrimBox(bleed,bleed,trimWidth,trimHeight);
    back.setBleedBox(0,0,pageWidth,pageHeight);
  }
  const bytes = await doc.save();
  return { bytes, contentHash: renderContentHash(snapshot, images), pageCount: doc.getPageCount() };
}
