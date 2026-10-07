import type { ElementBackgroundId, ElementColorId, ElementDecorationId, PageSide, StampId } from "../album-elements/model.ts";
import type { AlbumPageRole, AlbumKnownEvent } from "../album-draft/composition.ts";

export type DecorationStyleId = "CLEAN" | "WARM" | "PLAYFUL" | "SEASONAL" | "CELEBRATION";
export type DecorationBudget = "NONE" | "LOW" | "MEDIUM";
export type AlbumSeason = "spring" | "summer" | "autumn" | "winter";
export type DecorationRect = { x: number; y: number; w: number; h: number };

export const DECORATION_STYLE_PRESETS: Array<{ id: DecorationStyleId; label: string; description: string; budget: DecorationBudget }> = [
  { id: "CLEAN", label: "装飾なし", description: "写真をそのまま見せます。", budget: "NONE" },
  { id: "WARM", label: "あたたかく", description: "温かい色と小さなlineで整えます。", budget: "LOW" },
  { id: "PLAYFUL", label: "あそび心", description: "既存のpaw/stampをひとつだけ使います。", budget: "LOW" },
  { id: "SEASONAL", label: "季節の色", description: "日付から分かる季節の色を控えめに使います。", budget: "LOW" },
  { id: "CELEBRATION", label: "お祝い", description: "確認済みeventに小さなstampと日付案を添えます。", budget: "LOW" },
];

export type RecommendedMark = {
  type: "stamp" | "decoration";
  id: StampId | ElementDecorationId;
  colorId: ElementColorId;
  rect: DecorationRect;
  printTarget: "print" | "digital-only";
};

export type DecorationRecommendation = {
  id: string;
  styleId: DecorationStyleId;
  confidence: number;
  reason: string;
  budget: DecorationBudget;
  backgrounds: Partial<Record<PageSide, ElementBackgroundId>>;
  marks: RecommendedMark[];
  textSuggestion?: string;
  textRect?: DecorationRect;
  applyScope: "page" | "spread" | "event";
};

export type DecorationRecommendationContext = {
  role: AlbumPageRole;
  storyType: string;
  density: "LOW" | "MEDIUM" | "HIGH";
  whitespaceIntent: string;
  photoCount: number;
  event?: AlbumKnownEvent & { dateLabel: string };
  season?: AlbumSeason | null;
  albumTheme: DecorationStyleId;
  photoTone?: "warm" | "cool" | "bright" | "dark" | "colorful" | "neutral" | null;
  confidence: number;
  userElementCount: number;
  hasUserBackground: boolean;
  safePages: Array<{ side: PageSide; rect: DecorationRect }>;
  occupiedRects: DecorationRect[];
  gutter: DecorationRect;
};

const CONFIDENCE_THRESHOLD = 0.62;
const MARK_SIZE = 0.055;
const PAGE_INSET = 0.08;

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function validDate(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function intersects(left: DecorationRect, right: DecorationRect) {
  return left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y;
}

function contains(area: DecorationRect, rect: DecorationRect) {
  return rect.x >= area.x && rect.y >= area.y && rect.x + rect.w <= area.x + area.w && rect.y + rect.h <= area.y + area.h;
}

function clean(context: DecorationRecommendationContext, reason: string, confidence = 1): DecorationRecommendation {
  return {
    id: "clean",
    styleId: "CLEAN",
    confidence: clampConfidence(confidence),
    reason,
    budget: "NONE",
    backgrounds: {},
    marks: [],
    applyScope: context.role === "EVENT" ? "event" : "spread",
  };
}

function safeMark(context: DecorationRecommendationContext, mark: Omit<RecommendedMark, "rect" | "printTarget">): RecommendedMark | null {
  for (const page of context.safePages) {
    const size = Math.min(MARK_SIZE, page.rect.w * 0.16, page.rect.h * 0.16);
    const insets = [
      { x: page.rect.x + page.rect.w * PAGE_INSET, y: page.rect.y + page.rect.h * PAGE_INSET },
      { x: page.rect.x + page.rect.w * (1 - PAGE_INSET) - size, y: page.rect.y + page.rect.h * PAGE_INSET },
      { x: page.rect.x + page.rect.w * PAGE_INSET, y: page.rect.y + page.rect.h * (1 - PAGE_INSET) - size },
      { x: page.rect.x + page.rect.w * (1 - PAGE_INSET) - size, y: page.rect.y + page.rect.h * (1 - PAGE_INSET) - size },
    ];
    for (const point of insets) {
      const rect = { ...point, w: size, h: size };
      if (!contains(page.rect, rect) || intersects(rect, context.gutter)) continue;
      if (context.occupiedRects.some((occupied) => intersects(rect, occupied))) continue;
      return { ...mark, rect, printTarget: "print" };
    }
  }
  return null;
}

function safeTextRect(context: DecorationRecommendationContext): DecorationRect | null {
  for (const page of context.safePages) {
    const rect = {
      x: page.rect.x + page.rect.w * 0.2,
      y: page.rect.y + page.rect.h * 0.82,
      w: page.rect.w * 0.6,
      h: page.rect.h * 0.08,
    };
    if (!contains(page.rect, rect) || intersects(rect, context.gutter)) continue;
    if (context.occupiedRects.some((occupied) => intersects(rect, occupied))) continue;
    return rect;
  }
  return null;
}

function option(context: DecorationRecommendationContext, input: Omit<DecorationRecommendation, "confidence" | "applyScope">, confidence: number): DecorationRecommendation {
  return {
    ...input,
    confidence: clampConfidence(confidence),
    applyScope: context.role === "EVENT" ? "event" : "spread",
  };
}

export function recommendAlbumDecoration(context: DecorationRecommendationContext): DecorationRecommendation[] {
  const cleanOption = clean(context, "写真の見せ方を変えず、そのまま残します。");
  if (context.confidence < CONFIDENCE_THRESHOLD) return [clean(context, "判断材料が少ないため、装飾は加えません。", context.confidence)];
  if (context.userElementCount > 0 || context.hasUserBackground) return [clean(context, "手動の装飾を保護するため、追加提案は控えます。")];
  if (context.role === "QUIET" || context.whitespaceIntent === "quiet") return [clean(context, "余白を活かすため、装飾は加えません。")];

  const options: DecorationRecommendation[] = [cleanOption];
  const canUseBackground = context.safePages.length > 0 && context.photoTone !== "dark" && context.photoTone !== "colorful";

  if (context.role === "HERO") {
    return options;
  }

  if (context.role === "GRID" || context.density === "HIGH") {
    return options;
  }

  if (context.event && validDate(context.event.date) && (context.role === "EVENT" || context.storyType === "event")) {
    const textRect = safeTextRect(context);
    const markContext = textRect ? { ...context, occupiedRects: [...context.occupiedRects, textRect] } : context;
    const mark = safeMark(markContext, { type: "stamp", id: context.event.kind === "birthday" ? "birthday" : "first-time", colorId: "terracotta" });
    if (mark || textRect) {
      options.push(
        option(
          context,
          {
            id: "known-event",
            styleId: "CELEBRATION",
            reason: context.event.kind === "birthday" ? "確認済みの誕生日に、小さなお祝いを添えます。" : "確認済みの記念日に、小さな印を添えます。",
            budget: "LOW",
            backgrounds: {},
            marks: mark ? [mark] : [],
            textSuggestion: context.event.dateLabel,
            textRect: textRect ?? undefined,
          },
          context.confidence * 0.92,
        ),
      );
    }
    return options;
  }

  if (context.season && context.albumTheme === "SEASONAL") {
    const seasonalStamps: Record<AlbumSeason, StampId> = { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" };
    const seasonalBackgrounds: Record<AlbumSeason, ElementBackgroundId> = { spring: "rose", summer: "sky", autumn: "warm", winter: "gray" };
    const mark = context.role === "STORY" ? safeMark(context, { type: "stamp", id: seasonalStamps[context.season], colorId: context.season === "summer" || context.season === "winter" ? "sky" : "sage" }) : null;
    if (mark) {
      options.push(
        option(
          context,
          {
            id: `season-${context.season}`,
            styleId: "SEASONAL",
            reason: "撮影時期に合わせて、控えめな季節色を提案します。",
            budget: "LOW",
            backgrounds: canUseBackground ? { left: seasonalBackgrounds[context.season], right: seasonalBackgrounds[context.season] } : {},
            marks: [mark],
          },
          context.confidence * 0.82,
        ),
      );
    }
    return options;
  }

  if (context.albumTheme === "PLAYFUL" && context.role === "STORY" && context.storyType === "everyday") {
    const mark = safeMark(context, { type: "stamp", id: "paw", colorId: "terracotta" });
    if (mark) {
      options.push(
        option(
          context,
          {
            id: "playful-paw",
            styleId: "PLAYFUL",
            reason: "日常のページに、小さな肉球をひとつ添えます。",
            budget: "LOW",
            backgrounds: {},
            marks: [mark],
          },
          context.confidence * 0.75,
        ),
      );
    }
  } else if (context.albumTheme === "WARM" && context.role === "STORY" && canUseBackground) {
    const mark = safeMark(context, { type: "decoration", id: "line", colorId: "sage" });
    if (mark) {
      options.push(
        option(
          context,
          {
            id: "warm-line",
            styleId: "WARM",
            reason: "アルバム全体の温度感に合わせ、背景と小さなラインを添えます。",
            budget: "LOW",
            backgrounds: { left: "warm", right: "warm" },
            marks: [mark],
          },
          context.confidence * 0.78,
        ),
      );
    }
  }

  return options.slice(0, 4);
}

export function recommendationSeason(date: string | null | undefined): AlbumSeason | null {
  if (!date || !validDate(date)) return null;
  const month = Number(date.slice(5, 7));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  if (month === 12 || month <= 2) return "winter";
  return null;
}

export function recommendAlbumTheme(input: { dates: Array<string | null | undefined>; hasEvent: boolean; storyTypes: string[] }): DecorationStyleId {
  const seasons = input.dates.map(recommendationSeason).filter((season): season is AlbumSeason => season != null);
  if (input.hasEvent) return "WARM";
  if (seasons.length > 0 && seasons.every((season) => season === seasons[0])) return "SEASONAL";
  if (input.storyTypes.some((storyType) => storyType === "everyday" || storyType === "same_day")) return "WARM";
  return "CLEAN";
}
