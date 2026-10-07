import { DECORATIONS, textStylePreset } from "../album-polish/catalog.ts";
import type { TextStyleId } from "../album-polish/types.ts";
import { ALBUM_PRINT_CONFIG } from "./config.ts";
import { visibleSourcePixels } from "./crop.ts";
import { gutterNorm, spreadFontPt } from "./geometry.ts";
import { fontPlan } from "./fonts.ts";
import { estimateDpi, mmToPoints } from "../print/layout/units.ts";
import { ALBUM_PRINT_SPEC } from "./print-spec.ts";
import type { AlbumPrintSnapshot, PrintIssue, PrintRect } from "./types.ts";

export type PrintImageFact = {
  width: number;
  height: number;
  broken: boolean;
};

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function outside(rect: { x: number; y: number; w: number; h: number }) {
  return rect.x < -0.001 || rect.y < -0.001 || rect.x + rect.w > 1.001 || rect.y + rect.h > 1.001 || rect.w <= 0 || rect.h <= 0;
}

function inside(rect: { x: number; y: number; w: number; h: number }, area: { x: number; y: number; w: number; h: number }) {
  return rect.x >= area.x && rect.y >= area.y && rect.x + rect.w <= area.x + area.w && rect.y + rect.h <= area.y + area.h;
}

function pageSafeArea(rect: { x: number; y: number; w: number; h: number }, snapshot: AlbumPrintSnapshot) {
  const side = rect.x + rect.w / 2 < 0.5 ? "left" : "right";
  return inside(rect, snapshot.geometry.safeArea[side]);
}

function cssFontPx(styleId: TextStyleId) {
  const parsed = Number.parseFloat(textStylePreset(styleId).fontSize);
  return Number.isFinite(parsed) ? parsed : 13;
}

function slotCss(rect: PrintRect) {
  const width = rect.w * ALBUM_PRINT_CONFIG.spreadDisplayPx;
  const height = rect.h * ALBUM_PRINT_CONFIG.spreadDisplayPx * (1264 / 1076);
  return { width, height };
}

/** Japanese glyphs are a little under one em in Klee One. More than two lines exceeds the editor clamp. */
export function textOverflows(text: string, slotWidthPx: number, slotHeightPx: number, fontPx: number) {
  if (!text) return false;
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? fontPx * 0.9 : fontPx * 0.56;
  if (width <= slotWidthPx + 1) return false;
  const lines = Math.ceil(width / Math.max(slotWidthPx, fontPx));
  return lines > 2 || lines * fontPx * 1.35 > slotHeightPx + fontPx * 2;
}

function printTextOverflows(text: string, widthPt: number, heightPt: number, fontPt: number) {
  let lines = 1;
  let lineWidth = 0;
  for (const character of text) {
    if (character === "\n") {
      lines++;
      lineWidth = 0;
      continue;
    }
    const glyphWidth = character.charCodeAt(0) > 255 ? fontPt * 0.9 : fontPt * 0.56;
    if (lineWidth > 0 && lineWidth + glyphWidth > widthPt) {
      lines++;
      lineWidth = glyphWidth;
    } else {
      lineWidth += glyphWidth;
    }
  }
  return lines * fontPt * 1.25 > heightPt + fontPt * 0.2;
}

function dpiLevel(dpi: number): "good" | "warning" | "low_resolution" {
  if (dpi >= ALBUM_PRINT_CONFIG.dpi.good) return "good";
  if (dpi >= ALBUM_PRINT_CONFIG.dpi.warning) return "warning";
  return "low_resolution";
}

export function assessPrintQuality(snapshot: AlbumPrintSnapshot, images: Record<string, PrintImageFact | null>, options?: { fontsReady?: Partial<Record<TextStyleId, boolean>> }): PrintIssue[] {
  const issues: PrintIssue[] = [];
  const geometry = snapshot.geometry;
  if (geometry.canvas.width < 1 || geometry.spread.widthPt < 1 || geometry.cover.widthPt < 1) {
    issues.push({ code: "INVALID_PRINT_GEOMETRY", severity: "blocking", message: "印刷サイズが不正です。" });
  }
  const gutter = gutterNorm(geometry);
  const knownDecorations = new Set(DECORATIONS.map((item) => item.id));
  const styles = new Set<TextStyleId>();

  const coverPhoto = snapshot.cover.photoId;
  if (coverPhoto) {
    const fact = images[coverPhoto];
    if (!snapshot.cover.storagePath || fact == null) {
      issues.push({ code: "MISSING_IMAGE", severity: "blocking", message: "表紙の元画像がありません。", photoId: coverPhoto });
    } else if (fact.broken || fact.width < 1) {
      issues.push({ code: "BROKEN_IMAGE", severity: "blocking", message: "表紙の画像を読めません。", photoId: coverPhoto });
    } else {
      const visible = visibleSourcePixels(snapshot.cover.photoRect.wMm, snapshot.cover.photoRect.hMm, fact.width, fact.height, snapshot.cover.crop);
      const dpi = Math.min(estimateDpi(visible.width, snapshot.cover.photoRect.wMm), estimateDpi(visible.height, snapshot.cover.photoRect.hMm));
      const level = dpiLevel(dpi);
      if (level !== "good") {
        issues.push({
          code: "LOW_DPI",
          severity: "warning",
          message: level === "low_resolution" ? "表紙写真の解像度が足りません。" : "表紙写真の解像度が推奨を下回っています。",
          photoId: coverPhoto,
          dpi,
          level,
        });
      }
    }
  }
  if (textOverflows(snapshot.cover.title, 21.5 * 10.5, 21.5 * 2.4, 21.5) || textOverflows(snapshot.cover.subtitle, 12.5 * 16, 12.5 * 2, 12.5)) {
    issues.push({ code: "TEXT_OVERFLOW", severity: "blocking", message: "表紙の文字が枠を超えています。" });
  }

  for (const item of snapshot.compositionPlan?.items ?? []) {
    if (item.kind !== "title" && item.kind !== "event") continue;
    styles.add("editorial");
    const inset = mmToPoints(ALBUM_PRINT_SPEC.safeInsetMm);
    const safeWidth = mmToPoints(ALBUM_PRINT_SPEC.trimWidthMm) - inset * 2;
    const blocks =
      item.kind === "title"
        ? [
            { text: item.title, size: mmToPoints(7), height: mmToPoints(18) },
            { text: item.petName, size: mmToPoints(4.2), height: mmToPoints(10) },
            { text: item.period, size: mmToPoints(3.8), height: mmToPoints(9) },
          ]
        : [
            { text: item.title, size: mmToPoints(6), height: mmToPoints(16) },
            { text: item.dateLabel, size: mmToPoints(4.2), height: mmToPoints(10) },
          ];
    for (const block of blocks) {
      if (block.size < 8) {
        issues.push({ code: "MIN_FONT_SIZE", severity: "blocking", message: "イベントページの文字が印刷に必要な大きさを下回っています。" });
      }
      if (printTextOverflows(block.text, safeWidth, block.height, block.size)) {
        issues.push({ code: "TEXT_OVERFLOW", severity: "blocking", message: "タイトル/イベントページの文字が安全な枠に収まりません。" });
      }
    }
  }

  for (const spread of snapshot.spreads) {
    const photos = spread.frames.filter((frame) => frame.photoId);
    if (photos.length === 0) {
      issues.push({ code: "EMPTY_SPREAD", severity: "warning", message: "写真のない見開きです。", spreadId: spread.id });
    } else if (photos.length === 1) {
      issues.push({ code: "SPARSE_SPREAD", severity: "warning", message: "写真が1枚の見開きです。", spreadId: spread.id });
    }
    const sides = new Set(spread.frames.map((frame) => frame.side));
    if (photos.length > 0 && (sides.size < 2 || !sides.has("left") || !sides.has("right"))) {
      issues.push({
        code: "EMPTY_OPPOSITE_PAGE",
        severity: "warning",
        message: "向かいのページは白紙のままです。",
        spreadId: spread.id,
      });
    }
    for (const frame of spread.frames) {
      if (frame.rect.w <= 0 || frame.rect.h <= 0 || frame.crossesGutter) {
        issues.push({
          code: frame.crossesGutter ? "GUTTER_VIOLATION" : "INVALID_PRINT_GEOMETRY",
          severity: "blocking",
          message: frame.crossesGutter ? "写真がノドにかかっています。" : "写真の配置サイズが不正です。",
          spreadId: spread.id,
          photoId: frame.photoId,
        });
      }
      const fact = images[frame.photoId];
      if (!frame.storagePath || fact == null) {
        issues.push({ code: "MISSING_IMAGE", severity: "blocking", message: "元画像がありません。", spreadId: spread.id, photoId: frame.photoId });
        continue;
      }
      if (fact.broken || fact.width < 1 || fact.height < 1) {
        issues.push({ code: "BROKEN_IMAGE", severity: "blocking", message: "画像を読めません。", spreadId: spread.id, photoId: frame.photoId });
        continue;
      }
      const visible = visibleSourcePixels(frame.rect.wMm, frame.rect.hMm, fact.width, fact.height, frame.crop);
      const dpi = Math.min(estimateDpi(visible.width, frame.rect.wMm), estimateDpi(visible.height, frame.rect.hMm));
      const level = dpiLevel(dpi);
      if (level !== "good") {
        issues.push({
          code: "LOW_DPI",
          severity: "warning",
          message: level === "low_resolution" ? "印刷解像度が足りません。" : "印刷解像度が推奨を下回っています。",
          spreadId: spread.id,
          photoId: frame.photoId,
          dpi,
          level,
        });
      }
    }
    for (const text of spread.texts) {
      styles.add(text.styleId);
      const slot = slotCss(text.rect);
      if (textOverflows(text.text, slot.width, slot.height, cssFontPx(text.styleId))) {
        issues.push({ code: "TEXT_OVERFLOW", severity: "blocking", message: "文字が枠を超えています。", spreadId: spread.id });
      }
      if (outside(text.rect)) {
        issues.push({ code: "SAFE_AREA_VIOLATION", severity: "blocking", message: "文字が安全領域の外です。", spreadId: spread.id });
      }
      if (!pageSafeArea(text.rect, snapshot)) {
        issues.push({ code: "SAFE_AREA_VIOLATION", severity: "blocking", message: "文字が仕上がり安全域の外です。", spreadId: spread.id });
      }
      if (intersects(text.rect, gutter)) {
        issues.push({ code: "GUTTER_VIOLATION", severity: "blocking", message: "文字がノドに入っています。", spreadId: spread.id });
      }
      if (spreadFontPt(cssFontPx(text.styleId), geometry) < 8) {
        issues.push({ code: "MIN_FONT_SIZE", severity: "blocking", message: "文字が印刷に必要な大きさを下回っています。", spreadId: spread.id });
      }
      if (spread.frames.some((frame) => intersects(text.rect, frame.rect))) {
        issues.push({ code: "TEXT_PHOTO_COLLISION", severity: "blocking", message: "文字が写真に重なっています。", spreadId: spread.id });
      }
      if (spread.decorations.some((decoration) => intersects(text.rect, decoration.rect))) {
        issues.push({ code: "TEXT_DECORATION_COLLISION", severity: "blocking", message: "文字が装飾に重なっています。", spreadId: spread.id });
      }
    }
    for (const decoration of spread.decorations) {
      if (!knownDecorations.has(decoration.decorationId)) {
        issues.push({ code: "INVALID_DECORATION", severity: "blocking", message: "印刷できない装飾です。", spreadId: spread.id });
      }
      if (outside(decoration.rect) || intersects(decoration.rect, gutter)) {
        issues.push({
          code: intersects(decoration.rect, gutter) ? "GUTTER_VIOLATION" : "SAFE_AREA_VIOLATION",
          severity: "blocking",
          message: "装飾がノドまたは安全領域の外に出ています。",
          spreadId: spread.id,
        });
      }
      const hitsPhoto = spread.frames.some((frame) => intersects(decoration.rect, frame.rect));
      const hitsText = spread.texts.some((text) => intersects(decoration.rect, text.rect));
      if (hitsPhoto || hitsText) {
        issues.push({ code: "DECORATION_COLLISION", severity: "blocking", message: "装飾が写真または文字に重なっています。", spreadId: spread.id });
      }
    }
    for (const element of spread.elements) {
      if (outside(element.rect) || !pageSafeArea(element.rect, snapshot)) {
        issues.push({ code: "SAFE_AREA_VIOLATION", severity: "blocking", message: "ページ要素が仕上がり安全域の外です。", spreadId: spread.id });
      }
      if (element.type === "text") {
        styles.add(element.fontId);
        if (spreadFontPt(element.fontSize, geometry) < 8) {
          issues.push({ code: "MIN_FONT_SIZE", severity: "blocking", message: "文字が印刷に必要な大きさを下回っています。", spreadId: spread.id });
        }
        if (spread.frames.some((frame) => intersects(element.rect, frame.rect))) {
          issues.push({ code: "TEXT_PHOTO_COLLISION", severity: "blocking", message: "ページ文字が写真に重なっています。", spreadId: spread.id });
        }
      } else if (spread.frames.some((frame) => intersects(element.rect, frame.rect))) {
        issues.push({ code: "DECORATION_COLLISION", severity: "blocking", message: "ページ装飾が写真に重なっています。", spreadId: spread.id });
      }
    }
  }

  for (const styleId of styles) {
    const ready = options?.fontsReady?.[styleId] === true;
    const plan = fontPlan(styleId);
    if (!ready) {
      issues.push({ code: "FONT_MISSING", severity: "blocking", message: `${plan.family} が印刷環境にありません。` });
    } else if (plan.explicitFallbackFrom) {
      issues.push({
        code: "FONT_FALLBACK",
        severity: "warning",
        message: `${plan.explicitFallbackFrom} の日本語字形がないため ${plan.family} を使います。`,
      });
    }
  }
  if ((snapshot.cover.title || snapshot.cover.subtitle) && options?.fontsReady?.handwritten !== true) {
    issues.push({ code: "FONT_MISSING", severity: "blocking", message: "表紙の書体が印刷環境にありません。" });
  }
  return issues;
}

export function printQualityBlocks(issues: PrintIssue[]) {
  return issues.some((issue) => issue.severity === "blocking");
}
