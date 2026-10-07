export const ELEMENT_FONTS = [
  { id: "editorial", label: "エディトリアル" },
  { id: "warm", label: "あたたかい" },
  { id: "handwritten", label: "手書き" },
  { id: "minimal", label: "ミニマル" },
] as const;

export const ELEMENT_COLORS = [
  { id: "ink", label: "墨", hex: "#332f2b" },
  { id: "terracotta", label: "テラコッタ", hex: "#b36048" },
  { id: "sage", label: "セージ", hex: "#71836e" },
  { id: "sky", label: "空色", hex: "#6f91a5" },
  { id: "mustard", label: "マスタード", hex: "#bc9450" },
  { id: "rose", label: "ローズ", hex: "#c77e83" },
  { id: "white", label: "白", hex: "#ffffff" },
] as const;

export const ELEMENT_BACKGROUNDS = [
  { id: "white", label: "ホワイト", hex: "#ffffff" },
  { id: "warm", label: "ウォーム", hex: "#fbf8f3" },
  { id: "gray", label: "ライトグレー", hex: "#f1f2f1" },
  { id: "sage", label: "ペールセージ", hex: "#edf1e9" },
  { id: "sky", label: "ペールブルー", hex: "#edf3f6" },
  { id: "rose", label: "ペールローズ", hex: "#f8eeee" },
] as const;

export const ELEMENT_STAMPS = [
  { id: "paw", label: "肉球", glyph: "🐾" },
  { id: "heart", label: "ハート", glyph: "♥" },
  { id: "star", label: "星", glyph: "★" },
  { id: "sparkle", label: "きらめき", glyph: "✦" },
  { id: "bone", label: "骨", glyph: "⌁" },
  { id: "fish", label: "さかな", glyph: "◁" },
  { id: "crown", label: "王冠", glyph: "♛" },
  { id: "birthday", label: "誕生日", glyph: "♬" },
  { id: "first-time", label: "はじめて", glyph: "1st" },
  { id: "outing", label: "おでかけ", glyph: "⌖" },
  { id: "spring", label: "春", glyph: "❀" },
  { id: "summer", label: "夏", glyph: "☼" },
  { id: "autumn", label: "秋", glyph: "❧" },
  { id: "winter", label: "冬", glyph: "❄" },
] as const;

export const ELEMENT_DECORATIONS = [
  { id: "line", label: "ライン", glyph: "━" },
  { id: "tape", label: "テープ", glyph: "▰" },
  { id: "corner", label: "コーナー", glyph: "⌜" },
  { id: "bubble", label: "ふきだし", glyph: "☁" },
  { id: "ribbon", label: "リボン", glyph: "〰" },
] as const;

export type ElementFontId = (typeof ELEMENT_FONTS)[number]["id"];
export type ElementColorId = (typeof ELEMENT_COLORS)[number]["id"];
export type ElementBackgroundId = (typeof ELEMENT_BACKGROUNDS)[number]["id"];
export type StampId = (typeof ELEMENT_STAMPS)[number]["id"];
export type ElementDecorationId = (typeof ELEMENT_DECORATIONS)[number]["id"];
export type ElementType = "text" | "stamp" | "decoration";
export type ElementAlignment = "left" | "center" | "right";
export type PrintTarget = "print" | "digital-only";
export type PageSide = "left" | "right";
export type PageBackgroundState = {
  backgroundId: ElementBackgroundId | null;
  revision: number;
  clientSeq: number;
};
export type PageSnapRect = { x: number; y: number; w: number; h: number };
export type PageSnapGuides = { x: number | null; y: number | null };

type ElementBase = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  printTarget: PrintTarget;
  revision: number;
  clientSeq: number;
  recommendationId?: string;
  recommendationBackgroundsBefore?: Partial<Record<PageSide, ElementBackgroundId | null>>;
  recommendationBackgroundsAfter?: Partial<Record<PageSide, ElementBackgroundId | null>>;
};

export type PageTextElement = ElementBase & {
  type: "text";
  text: string;
  fontId: ElementFontId;
  fontSize: number;
  bold: boolean;
  colorId: ElementColorId;
  align: ElementAlignment;
};

export type PageStampElement = ElementBase & { type: "stamp"; stampId: StampId; colorId: ElementColorId };
export type PageDecorationElement = ElementBase & { type: "decoration"; decorationId: ElementDecorationId; colorId: ElementColorId };
export type PageElement = PageTextElement | PageStampElement | PageDecorationElement;

const FONT_IDS = new Set<string>(ELEMENT_FONTS.map((item) => item.id));
const COLOR_IDS = new Set<string>(ELEMENT_COLORS.map((item) => item.id));
const BACKGROUND_IDS = new Set<string>(ELEMENT_BACKGROUNDS.map((item) => item.id));
const STAMP_IDS = new Set<string>(ELEMENT_STAMPS.map((item) => item.id));
const DECORATION_IDS = new Set<string>(ELEMENT_DECORATIONS.map((item) => item.id));
const ALIGNMENTS = new Set<string>(["left", "center", "right"]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeText(value: unknown): value is string {
  return typeof value === "string" && [...value].length > 0 && [...value].length <= 120 && !/[<>\u0000-\u0009\u000b-\u001f\u007f]/.test(value);
}

export function isElementBackgroundId(value: unknown): value is ElementBackgroundId {
  return typeof value === "string" && BACKGROUND_IDS.has(value);
}

export function normalizePageElement(value: unknown): PageElement | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || !["text", "stamp", "decoration"].includes(String(item.type))) return null;
  if (!finite(item.x) || !finite(item.y) || !finite(item.width) || !finite(item.height) || !finite(item.rotation)) return null;
  if (!finite(item.zIndex) || !finite(item.revision) || !finite(item.clientSeq)) return null;
  const type = item.type as ElementType;
  let width = clamp(item.width, type === "text" ? 0.08 : 0.035, 0.96);
  let height = clamp(item.height, type === "text" ? 0.025 : 0.035, 0.96);
  if (type !== "text") {
    const aspect = item.width / item.height;
    if (!Number.isFinite(aspect) || aspect < 0.04 || aspect > 24) return null;
    const factor = Math.min(1, 0.96 / width, 0.96 / height);
    width *= factor;
    height *= factor;
    if (width < 0.035 || height < 0.035) return null;
  }
  const x = clamp(item.x, -width + 0.08, 0.92);
  const y = clamp(item.y, -height + 0.08, 0.92);
  const common = {
    id: item.id,
    type,
    x: Number(x.toFixed(5)),
    y: Number(y.toFixed(5)),
    width: Number(width.toFixed(5)),
    height: Number(height.toFixed(5)),
    rotation: Number(clamp(item.rotation, -180, 180).toFixed(2)),
    zIndex: Math.round(clamp(item.zIndex, -100, 100)),
    printTarget: item.printTarget === "digital-only" ? "digital-only" : "print",
    revision: Math.max(0, Math.floor(item.revision)),
    clientSeq: Math.max(0, Math.floor(item.clientSeq)),
    ...(typeof item.recommendationId === "string" && item.recommendationId.startsWith("task059:") ? { recommendationId: item.recommendationId } : {}),
    ...(isRecommendationBackgrounds(item.recommendationBackgroundsBefore) ? { recommendationBackgroundsBefore: item.recommendationBackgroundsBefore } : {}),
    ...(isRecommendationBackgrounds(item.recommendationBackgroundsAfter) ? { recommendationBackgroundsAfter: item.recommendationBackgroundsAfter } : {}),
  } as const;

  if (type === "text") {
    if (!safeText(item.text) || typeof item.fontId !== "string" || !FONT_IDS.has(item.fontId)) return null;
    if (!finite(item.fontSize) || item.fontSize < 10 || item.fontSize > 48) return null;
    if (typeof item.bold !== "boolean" || typeof item.align !== "string" || !ALIGNMENTS.has(item.align)) return null;
    if (typeof item.colorId !== "string" || !COLOR_IDS.has(item.colorId)) return null;
    return { ...common, type, text: item.text, fontId: item.fontId as ElementFontId, fontSize: item.fontSize, bold: item.bold, align: item.align as ElementAlignment, colorId: item.colorId as ElementColorId };
  }

  if (typeof item.colorId !== "string" || !COLOR_IDS.has(item.colorId)) return null;
  if (type === "stamp") {
    if (typeof item.stampId !== "string" || !STAMP_IDS.has(item.stampId)) return null;
    return { ...common, type, stampId: item.stampId as StampId, colorId: item.colorId as ElementColorId };
  }
  if (typeof item.decorationId !== "string" || !DECORATION_IDS.has(item.decorationId)) return null;
  return { ...common, type, decorationId: item.decorationId as ElementDecorationId, colorId: item.colorId as ElementColorId };
}

function isRecommendationBackgrounds(value: unknown): value is Partial<Record<PageSide, ElementBackgroundId | null>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.every(([side, id]) => (side === "left" || side === "right") && (id === null || isElementBackgroundId(id)));
}

export function mapPageElementRow(value: unknown): PageElement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const element = normalizePageElement(row.element_data);
  if (!element || row.element_type !== element.type || typeof row.id !== "string" || !row.id) return null;
  if (!finite(row.revision) || !finite(row.client_seq)) return null;
  return { ...element, id: row.id, revision: Math.max(0, Math.floor(row.revision)), clientSeq: Math.max(0, Math.floor(row.client_seq)) };
}

export function mapPageBackgroundRow(value: unknown): { spreadId: string; side: PageSide; state: PageBackgroundState } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.draft_spread_id !== "string" || !row.draft_spread_id || (row.page_side !== "left" && row.page_side !== "right")) return null;
  if (!finite(row.revision) || !finite(row.client_seq)) return null;
  return {
    spreadId: row.draft_spread_id,
    side: row.page_side,
    state: {
      backgroundId: isElementBackgroundId(row.background_id) ? row.background_id : null,
      revision: Math.max(0, Math.floor(row.revision)),
      clientSeq: Math.max(0, Math.floor(row.client_seq)),
    },
  };
}

export function elementAspectLocked(element: PageElement) {
  return element.type !== "text";
}

export function pageElementOrder(elements: PageElement[]) {
  return [...elements].sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
}

export function snapPageElement(element: PageElement, pages: PageSnapRect[], threshold = 0.012) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const xCenters = pages.map((page) => page.x + page.w / 2);
  const yCenters = pages.map((page) => page.y + page.h / 2);
  const closest = (value: number, candidates: number[]) => {
    const candidate = candidates.reduce<number | null>((best, current) => (best === null || Math.abs(current - value) < Math.abs(best - value) ? current : best), null);
    return candidate !== null && Math.abs(candidate - value) <= threshold ? candidate : null;
  };
  const x = closest(centerX, xCenters);
  const y = closest(centerY, yCenters);
  return {
    element:
      normalizePageElement({
        ...element,
        x: x === null ? element.x : x - element.width / 2,
        y: y === null ? element.y : y - element.height / 2,
      }) ?? element,
    guides: { x, y } satisfies PageSnapGuides,
  };
}
