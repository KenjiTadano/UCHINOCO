import { bookPrintMetrics } from "../album-draft/pages.ts";
import { DECORATION_PER_SPREAD, TEXT_LENGTH_LIMIT } from "../album-persistence/config.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "../album-draft/layouts.ts";
import { ALBUM_LAYOUTS } from "../smart-layout/layouts.ts";
import type {
  AlbumLayoutDefinition,
  LayoutDecorationSlot,
  LayoutPolishRect,
  LayoutTextSlot,
} from "../smart-layout/types.ts";
import type {
  DecorationId,
  DecorationKitId,
  DecorationSlotId,
  DraftDecoration,
  DraftTextElement,
  EffectiveDecoration,
  EffectiveText,
  OverrideMode,
  ScalePreset,
  TextKind,
  TextSlotId,
  TextStyleId,
} from "./types.ts";

const LAYOUTS: AlbumLayoutDefinition[] = [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS];

const GUTTER: LayoutPolishRect = { x: 0.47, y: 0, w: 0.06, h: 1 };

const TEXT_CANDIDATES: LayoutTextSlot[] = [
  { id: "top-left", kind: "title", rect: { x: 0.05, y: 0.008, w: 0.38, h: 0.04 } },
  { id: "top-center", kind: "title", rect: { x: 0.56, y: 0.008, w: 0.36, h: 0.04 } },
  { id: "bottom-left", kind: "caption", rect: { x: 0.05, y: 0.952, w: 0.38, h: 0.038 } },
  { id: "bottom-center", kind: "caption", rect: { x: 0.56, y: 0.952, w: 0.36, h: 0.038 } },
  { id: "margin-note", kind: "date", rect: { x: 0.56, y: 0.9, w: 0.34, h: 0.032 } },
  { id: "gutter-note", kind: "caption", rect: { x: 0.08, y: 0.484, w: 0.34, h: 0.03 } },
];

const DECORATION_CANDIDATES: LayoutDecorationSlot[] = [
  { id: "deco-top-left", rect: { x: 0.008, y: 0.006, w: 0.028, h: 0.036 } },
  { id: "deco-top-right", rect: { x: 0.964, y: 0.006, w: 0.028, h: 0.036 } },
  { id: "deco-bottom-left", rect: { x: 0.008, y: 0.956, w: 0.028, h: 0.034 } },
  { id: "deco-bottom-right", rect: { x: 0.964, y: 0.956, w: 0.028, h: 0.034 } },
];

export const TEXT_STYLES: { id: TextStyleId; label: string; fontFamily: string; fontSize: string }[] = [
  {
    id: "editorial",
    label: "エディトリアル",
    fontFamily: 'var(--font-book-title), "Klee One", "Noto Serif JP", ui-serif, serif',
    fontSize: "13px",
  },
  {
    id: "warm",
    label: "あたたかい",
    fontFamily: 'var(--font-book-title), "Klee One", sans-serif',
    fontSize: "13px",
  },
  {
    id: "handwritten",
    label: "手書き",
    fontFamily: 'var(--font-cover-handwrite), "Zen Kurenaido", "Klee One", cursive',
    fontSize: "14px",
  },
  {
    id: "minimal",
    label: "ミニマル",
    fontFamily: 'var(--font-geist-sans), "Noto Sans JP", sans-serif',
    fontSize: "12px",
  },
];

export const DECORATIONS: { id: DecorationId; label: string }[] = [
  { id: "paw", label: "肉球" },
  { id: "heart", label: "ハート" },
  { id: "star", label: "星" },
  { id: "tape", label: "テープ" },
  { id: "leaf", label: "葉" },
  { id: "flower", label: "花" },
  { id: "spark", label: "季節" },
];

export const DECORATION_KITS: { id: DecorationKitId; label: string; items: DecorationId[] }[] = [
  { id: "minimal", label: "控えめ", items: ["star", "tape"] },
  { id: "warm", label: "あたたかい", items: ["heart", "paw", "leaf"] },
  { id: "playful", label: "遊び", items: ["paw", "star", "flower"] },
  { id: "seasonal", label: "季節", items: ["leaf", "flower", "spark"] },
];

export const TEXT_SLOT_LABEL: Record<TextSlotId, string> = {
  "top-left": "左上のタイトル",
  "top-center": "右上のタイトル",
  "bottom-left": "左下のキャプション",
  "bottom-center": "右下のキャプション",
  "margin-note": "余白の日付",
  "gutter-note": "あいだのキャプション",
};

export const DECORATION_SLOT_LABEL: Record<DecorationSlotId, string> = {
  "deco-top-left": "左上",
  "deco-top-right": "右上",
  "deco-bottom-left": "左下",
  "deco-bottom-right": "右下",
};

const TEXT_SLOT_IDS = new Set<string>(TEXT_CANDIDATES.map((slot) => slot.id));
const DECORATION_SLOT_IDS = new Set<string>(DECORATION_CANDIDATES.map((slot) => slot.id));
const STYLE_IDS = new Set<string>(TEXT_STYLES.map((style) => style.id));
const DECORATION_IDS = new Set<string>(DECORATIONS.map((item) => item.id));

export function textLengthLimit(kind: TextKind) {
  return TEXT_LENGTH_LIMIT[kind];
}

export function intersects(a: LayoutPolishRect, b: LayoutPolishRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function insidePage(rect: LayoutPolishRect) {
  return rect.x >= 0.004 && rect.y >= 0.004 && rect.x + rect.w <= 0.996 && rect.y + rect.h <= 0.996;
}

function clearOfFrames(rect: LayoutPolishRect, layout: AlbumLayoutDefinition) {
  return insidePage(rect) && !intersects(rect, GUTTER) && !layout.frames.some((frame) => intersects(rect, frame.rect));
}

function keepClear<T extends { rect: LayoutPolishRect }>(slots: T[]) {
  const kept: T[] = [];
  for (const slot of slots) {
    if (kept.some((item) => intersects(item.rect, slot.rect))) continue;
    kept.push(slot);
  }
  return kept;
}

export function findPolishLayout(layoutId: string) {
  return LAYOUTS.find((layout) => layout.id === layoutId);
}

/** Slots that stay in the margin, off the fold, and off the photos. Scoring layouts are not mutated. */
export function polishForLayout(layoutId: string): { text: LayoutTextSlot[]; decoration: LayoutDecorationSlot[] } {
  const layout = findPolishLayout(layoutId);
  if (!layout) return { text: [], decoration: [] };
  return {
    text: keepClear(TEXT_CANDIDATES.filter((slot) => clearOfFrames(slot.rect, layout))),
    decoration: keepClear(DECORATION_CANDIDATES.filter((slot) => clearOfFrames(slot.rect, layout))),
  };
}

export function layoutWithPolish(layout: AlbumLayoutDefinition): AlbumLayoutDefinition {
  const polish = polishForLayout(layout.id);
  return { ...layout, textSlots: polish.text, decorationSlots: polish.decoration };
}

export function isTextSlotId(value: string): value is TextSlotId {
  return TEXT_SLOT_IDS.has(value);
}

export function isDecorationSlotId(value: string): value is DecorationSlotId {
  return DECORATION_SLOT_IDS.has(value);
}

export function isTextStyleId(value: string | null | undefined): value is TextStyleId {
  return typeof value === "string" && STYLE_IDS.has(value);
}

export function isDecorationId(value: string | null | undefined): value is DecorationId {
  return typeof value === "string" && DECORATION_IDS.has(value);
}

export function isOverrideMode(value: string): value is OverrideMode {
  return value === "inherit" || value === "replace" || value === "hidden";
}

export function isScalePreset(value: string | null | undefined): value is ScalePreset {
  return value === "small" || value === "medium";
}

export function slotKind(slotId: string): TextKind | null {
  return TEXT_CANDIDATES.find((slot) => slot.id === slotId)?.kind ?? null;
}

/** Plain text only. Rejects markup rather than interpreting it. */
export function plainTextIssue(kind: TextKind, value: string | null): string | null {
  if (value == null) return null;
  if (/[<>]/.test(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return "テキストはプレーンテキストのみです。";
  }
  if ([...value].length > textLengthLimit(kind)) return "文字数が上限を超えています。";
  return null;
}

export function textSlotIssue(layoutId: string, slotId: string, kind: TextKind): string | null {
  if (!isTextSlotId(slotId) || slotKind(slotId) !== kind) return "このレイアウトには使えない位置です。";
  const available = polishForLayout(layoutId).text.some((slot) => slot.id === slotId);
  if (!available) return "このレイアウトには使えない位置です。";
  return null;
}

export function decorationSlotIssue(layoutId: string, slotId: string): string | null {
  if (!isDecorationSlotId(slotId)) return "このレイアウトには使えない位置です。";
  const available = polishForLayout(layoutId).decoration.some((slot) => slot.id === slotId);
  if (!available) return "このレイアウトには使えない位置です。";
  return null;
}

export function styleIssue(styleId: string | null): string | null {
  if (styleId == null) return null;
  if (!isTextStyleId(styleId)) return "未対応の文字スタイルです。";
  return null;
}

export function decorationIdIssue(decorationId: string | null): string | null {
  if (decorationId == null) return null;
  if (!isDecorationId(decorationId)) return "未対応の装飾です。";
  return null;
}

export function resolveEffectiveText(row: DraftTextElement | null): EffectiveText {
  const styleId = isTextStyleId(row?.userStyleId) ? row.userStyleId : row?.aiStyleId && isTextStyleId(row.aiStyleId) ? row.aiStyleId : "editorial";
  if (!row || row.overrideMode === "hidden") {
    return { visible: false, text: "", styleId, mode: row?.overrideMode ?? "inherit" };
  }
  if (row.overrideMode === "replace") {
    const text = row.userText ?? "";
    return { visible: text.length > 0, text, styleId, mode: "replace" };
  }
  const text = row.aiText ?? "";
  return { visible: text.length > 0, text, styleId, mode: "inherit" };
}

export function resolveEffectiveDecoration(row: DraftDecoration | null): EffectiveDecoration {
  const scale = isScalePreset(row?.userScalePreset) ? row.userScalePreset : row?.aiScalePreset === "medium" ? "medium" : "small";
  if (!row || row.overrideMode === "hidden") {
    return { visible: false, decorationId: null, scale, mode: row?.overrideMode ?? "inherit" };
  }
  if (row.overrideMode === "replace") {
    const decorationId = isDecorationId(row.userDecorationId) ? row.userDecorationId : null;
    return { visible: decorationId != null, decorationId, scale, mode: "replace" };
  }
  const decorationId = isDecorationId(row.aiDecorationId) ? row.aiDecorationId : null;
  return { visible: decorationId != null, decorationId, scale, mode: "inherit" };
}

export function visibleDecorationCount(rows: DraftDecoration[]) {
  return rows.filter((row) => resolveEffectiveDecoration(row).visible).length;
}

export function canPlaceDecoration(rows: DraftDecoration[], slotId: string, next: DraftDecoration) {
  const others = rows.filter((row) => row.slotId !== slotId);
  const nextCount = visibleDecorationCount(others) + (resolveEffectiveDecoration(next).visible ? 1 : 0);
  return nextCount <= DECORATION_PER_SPREAD;
}

/** Layout slots are 0–1 on a spread. Render them inside the book page safe area. */
export function toSpreadNorm(rect: LayoutPolishRect): LayoutPolishRect {
  const metrics = bookPrintMetrics();
  const side = rect.x + rect.w / 2 >= 0.53 ? "right" : "left";
  const box = metrics.safeArea[side];
  const origin = side === "left" ? 0 : 0.53;
  const span = 0.47;
  const localX = Math.min(1, Math.max(0, (rect.x - origin) / span));
  const localW = Math.min(1 - localX, rect.w / span);
  const localY = Math.min(1, Math.max(0, rect.y));
  const localH = Math.min(1 - localY, rect.h);
  return {
    x: (box.x + localX * box.w) / metrics.canvas.width,
    y: (box.y + localY * box.h) / metrics.canvas.height,
    w: Math.max(0.02, (localW * box.w) / metrics.canvas.width),
    h: Math.max(0.018, (localH * box.h) / metrics.canvas.height),
  };
}

export function textStylePreset(styleId: string) {
  return TEXT_STYLES.find((style) => style.id === styleId) ?? TEXT_STYLES[0];
}

export function visibleTextLayers(layoutId: string, rows: DraftTextElement[]) {
  return polishForLayout(layoutId).text.flatMap((slot) => {
    const row = rows.find((item) => item.slotId === slot.id) ?? null;
    const effective = resolveEffectiveText(row);
    if (!effective.visible) return [];
    return [{ slotId: slot.id, kind: slot.kind, rect: toSpreadNorm(slot.rect), text: effective.text, styleId: effective.styleId }];
  });
}

export function visibleDecorationLayers(layoutId: string, rows: DraftDecoration[]) {
  return polishForLayout(layoutId).decoration.flatMap((slot) => {
    const row = rows.find((item) => item.slotId === slot.id) ?? null;
    const effective = resolveEffectiveDecoration(row);
    if (!effective.visible || !effective.decorationId) return [];
    return [{ slotId: slot.id, rect: toSpreadNorm(slot.rect), decorationId: effective.decorationId, scale: effective.scale }];
  });
}
