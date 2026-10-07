import { computeHeroConfidence } from "./hero.ts";
import { buildOrientationProfile } from "./photo-set.ts";
import type { AlbumLayoutDefinition, LayoutDecorationSlot, LayoutPhotoInput, LayoutPolishRect, LayoutTextSlot, TemplateComposition, TemplateDensity, TemplateOrientation, WhitespaceIntent } from "./types.ts";

export const TEMPLATE_GRAMMAR_VERSION = "uchinoco-layout-grammar-v1";

export const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  L01: "P1_HERO_LANDSCAPE",
  L01b: "P1_HERO_PORTRAIT",
  L02: "P2_EQUAL_PORTRAIT",
  L03: "P2_EQUAL_LANDSCAPE",
  L04: "P3_HERO_LEFT",
  L05: "P3_EQUAL_COLUMNS",
  L06: "P4_HERO_LEFT_MIXED",
  L07: "P4_GRID",
  L08: "P3_EDITORIAL_STORY",
  L09: "P3_PORTRAIT_DETAIL",
  L10: "P2_EQUAL_SQUARE",
  L11: "P3_HERO_PORTRAIT",
  L13: "P5_HERO_LEFT",
  L14: "P5_BALANCED",
  L15: "P5_HERO_TOP",
  L16: "P5_HERO_RIGHT",
  L17: "P5_TWO_PLUS_THREE",
  L18: "P5_EDITORIAL",
  L19: "P5_CENTER_HERO",
  L20: "P5_THREE_PLUS_TWO",
};

export type TemplateMetadata = {
  grammarId: string;
  scope: "page" | "spread";
  composition: TemplateComposition;
  orientationAffinity: TemplateOrientation[];
  heroAffinity: "required" | "preferred" | "neutral" | "avoid";
  density: TemplateDensity;
  whitespaceIntent: WhitespaceIntent;
  captionSupport: "none" | "optional" | "prominent";
  decorationSafeZones: LayoutDecorationSlot[];
  printSafe: boolean;
  legacyStatus: "KEEP" | "REDESIGN" | "LEGACY";
};

const DEFAULT_SAFE_ZONES: LayoutDecorationSlot[] = [
  { id: "safe-upper-right", rect: { x: 0.9, y: 0.03, w: 0.06, h: 0.06 } },
  { id: "safe-bottom-left", rect: { x: 0.04, y: 0.91, w: 0.06, h: 0.06 } },
];

function overlaps(a: LayoutPolishRect, b: LayoutPolishRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function safeDecorationZones(layout: AlbumLayoutDefinition) {
  return DEFAULT_SAFE_ZONES.filter((zone) => !layout.frames.some((frame) => overlaps(zone.rect, frame.rect)));
}

function legacyComposition(layout: AlbumLayoutDefinition): TemplateComposition {
  if (layout.purpose === "hero") return "hero";
  if (layout.purpose === "collage") return "grid";
  if (layout.purpose === "detail") return "editorial";
  return "story";
}

export function templateMetadata(layout: AlbumLayoutDefinition): TemplateMetadata {
  const composition = layout.composition ?? legacyComposition(layout);
  return {
    grammarId: layout.grammarId ?? LEGACY_TEMPLATE_MAP[layout.id] ?? layout.id,
    scope: layout.scope ?? "spread",
    composition,
    orientationAffinity: layout.orientationAffinity ?? ["any"],
    heroAffinity: layout.heroAffinity ?? (composition === "hero" ? "preferred" : composition === "grid" || composition === "equal" ? "avoid" : "neutral"),
    density: layout.density ?? (layout.photoCount >= 4 ? "dense" : layout.photoCount === 1 ? "light" : "balanced"),
    whitespaceIntent: layout.whitespaceIntent ?? (composition === "quiet" ? "quiet" : composition === "editorial" ? "editorial" : "balanced"),
    captionSupport: layout.captionSupport ?? (layout.textSlots?.length ? "prominent" : "optional"),
    decorationSafeZones: layout.decorationSafeZones ?? safeDecorationZones(layout),
    printSafe: layout.printSafe ?? true,
    legacyStatus: layout.legacyStatus ?? (layout.id === "L01b" || layout.id === "L14" ? "REDESIGN" : layout.id === "L08" || layout.id === "L10" ? "LEGACY" : "KEEP"),
  };
}

/** Materialize Grammar v1 metadata on legacy and new photo definitions. */
export function withTemplateMetadata(layout: AlbumLayoutDefinition): AlbumLayoutDefinition {
  const metadata = templateMetadata(layout);
  return {
    ...layout,
    ...metadata,
    frames: layout.frames.map((frame) => ({
      ...frame,
      preferredOrientation: frame.preferredOrientation ?? (frame.cropShapeId === "circle" ? "square" : frame.cropShapeId),
      cropTolerance: frame.cropTolerance ?? (frame.slotRole === "hero" ? "low" : frame.slotRole === "detail" ? "high" : "medium"),
    })),
  };
}

export type TemplateCandidateContext = { captionAvailable?: boolean; maxCandidates?: number; storyType?: string; preserveLegacy?: boolean };

export type RankedTemplateCandidate = { layout: AlbumLayoutDefinition; score: number; reasons: string[] };

export function rankTemplateCandidates(layouts: AlbumLayoutDefinition[], photos: LayoutPhotoInput[], context: TemplateCandidateContext = {}): RankedTemplateCandidate[] {
  const orientation = buildOrientationProfile(photos).dominant;
  const heroConfidence = computeHeroConfidence(photos);
  return layouts.filter((layout) => layout.photoCount === photos.length).map((layout, index) => {
    const meta = templateMetadata(layout);
    let score = 0;
    const reasons: string[] = [];
    if (meta.orientationAffinity.includes("any") || meta.orientationAffinity.includes("mixed")) { score += 2; reasons.push("ORIENTATION_FLEXIBLE"); }
    if (meta.orientationAffinity.includes(orientation)) { score += 5; reasons.push("ORIENTATION_MATCH"); }
    if (heroConfidence >= 0.65 && (meta.heroAffinity === "preferred" || meta.heroAffinity === "required")) { score += 5; reasons.push("HERO_MATCH"); }
    if (heroConfidence < 0.35 && meta.heroAffinity === "avoid") { score += 4; reasons.push("NO_FORCED_HERO"); }
    if (context.captionAvailable && meta.captionSupport === "prominent") { score += 4; reasons.push("CAPTION_MATCH"); }
    if (!context.captionAvailable && meta.captionSupport === "prominent") { score -= 3; reasons.push("CAPTION_UNUSED"); }
    if ((context.storyType === "sequence" || context.storyType === "same_day") && (meta.composition === "story" || meta.composition === "editorial")) { score += 3; reasons.push("STORY_MATCH"); }
    if (context.storyType === "single" && (meta.composition === "hero" || meta.composition === "fullBleed")) { score += 3; reasons.push("STORY_MATCH"); }
    return { layout, score, reasons, index };
  }).sort((a, b) => b.score - a.score || a.layout.id.localeCompare(b.layout.id)).map(({ layout, score, reasons }) => ({ layout, score, reasons }));
}

/** Cheap semantic prefilter before crop/permutation scoring. */
export function filterTemplateCandidates(layouts: AlbumLayoutDefinition[], photos: LayoutPhotoInput[], context: TemplateCandidateContext = {}): AlbumLayoutDefinition[] {
  const countMatched = layouts.filter((layout) => layout.photoCount === photos.length);
  if (countMatched.length <= 1) return countMatched;
  const ranked = rankTemplateCandidates(countMatched, photos, context);
  const max = Math.max(4, context.maxCandidates ?? 6);
  const selected = ranked.slice(0, max).map((item) => item.layout);
  if (context.preserveLegacy === false) return selected;
  for (const layout of countMatched) {
    if (layout.id.startsWith("L") && !selected.some((item) => item.id === layout.id)) selected.push(layout);
  }
  return selected;
}

const GUTTER_MIN = 0.48;
const GUTTER_MAX = 0.52;
export function spreadTemplateCrossesGutter(template: NonPhotoTemplate) {
  return template.photoSlots.some(({ rect }) => rect.x < GUTTER_MAX && rect.x + rect.w > GUTTER_MIN);
}

/** Safe staged subset; crossing-gutter templates are excluded from automatic use. */
export function automaticSpreadTemplates() {
  return SPREAD_TEMPLATES.filter((template) => template.printSafe && !spreadTemplateCrossesGutter(template));
}

type NonPhotoTemplate = {
  id: string;
  scope: "page" | "spread";
  composition: TemplateComposition;
  photoSlots: Array<{ id: string; rect: LayoutPolishRect; role: "hero" | "primary" | "secondary" | "detail"; preferredOrientation: TemplateOrientation; cropTolerance: "low" | "medium" | "high"; importance: number }>;
  textSlots: LayoutTextSlot[];
  whitespaceIntent: WhitespaceIntent;
  printSafe: boolean;
};

const spreadSlots = (id: string, rects: LayoutPolishRect[]): NonPhotoTemplate => ({
  id,
  scope: "spread",
  composition: id.includes("QUIET") ? "quiet" : id.includes("EDITORIAL") || id.includes("TIMELINE") ? "editorial" : id.includes("FULL") ? "fullBleed" : "story",
  photoSlots: rects.map((rect, index) => ({ id: `${id}-${index + 1}`, rect, role: index === 0 ? "hero" : "secondary", preferredOrientation: index === 0 ? "landscape" : "mixed", cropTolerance: index === 0 ? "low" : "medium", importance: index === 0 ? 1 : 0.55 })),
  textSlots: [],
  whitespaceIntent: id.includes("QUIET") ? "quiet" : id.includes("EDITORIAL") ? "editorial" : "balanced",
  printSafe: true,
});

export const SPREAD_TEMPLATES: NonPhotoTemplate[] = [
  spreadSlots("S_HERO_FULL", [{ x: 0.01, y: 0.01, w: 0.98, h: 0.98 }]),
  spreadSlots("S_LEFT_HERO_STORY", [{ x: 0.03, y: 0.04, w: 0.45, h: 0.92 }, { x: 0.55, y: 0.08, w: 0.4, h: 0.38 }, { x: 0.55, y: 0.54, w: 0.4, h: 0.38 }]),
  spreadSlots("S_LEFT_STORY_RIGHT_HERO", [{ x: 0.52, y: 0.04, w: 0.45, h: 0.92 }, { x: 0.05, y: 0.08, w: 0.4, h: 0.38 }, { x: 0.05, y: 0.54, w: 0.4, h: 0.38 }]),
  spreadSlots("S_ONE_PLUS_FOUR", [{ x: 0.03, y: 0.05, w: 0.54, h: 0.9 }, { x: 0.62, y: 0.05, w: 0.16, h: 0.42 }, { x: 0.81, y: 0.05, w: 0.16, h: 0.42 }, { x: 0.62, y: 0.53, w: 0.16, h: 0.42 }, { x: 0.81, y: 0.53, w: 0.16, h: 0.42 }]),
  spreadSlots("S_TWO_PLUS_THREE", [{ x: 0.03, y: 0.05, w: 0.45, h: 0.42 }, { x: 0.52, y: 0.05, w: 0.45, h: 0.42 }, { x: 0.03, y: 0.53, w: 0.29, h: 0.42 }, { x: 0.355, y: 0.53, w: 0.29, h: 0.42 }, { x: 0.68, y: 0.53, w: 0.29, h: 0.42 }]),
  spreadSlots("S_TIMELINE", [{ x: 0.04, y: 0.08, w: 0.27, h: 0.34 }, { x: 0.365, y: 0.33, w: 0.27, h: 0.34 }, { x: 0.69, y: 0.58, w: 0.27, h: 0.34 }]),
  spreadSlots("S_EDITORIAL_ASYMMETRIC", [{ x: 0.04, y: 0.06, w: 0.56, h: 0.6 }, { x: 0.66, y: 0.06, w: 0.3, h: 0.4 }, { x: 0.12, y: 0.72, w: 0.35, h: 0.23 }, { x: 0.58, y: 0.55, w: 0.38, h: 0.4 }]),
  spreadSlots("S_QUIET", [{ x: 0.24, y: 0.17, w: 0.52, h: 0.66 }]),
];

const textTemplate = (id: string, kind: "title" | "caption", rect: LayoutPolishRect): NonPhotoTemplate => ({ id, scope: "page", composition: "quiet", photoSlots: [], textSlots: [{ id: `${id}-text`, kind, rect }], whitespaceIntent: "quiet", printSafe: true });

export const TEXT_ONLY_TEMPLATES: NonPhotoTemplate[] = [
  textTemplate("T_CENTER_SHORT", "title", { x: 0.15, y: 0.42, w: 0.7, h: 0.12 }),
  textTemplate("T_CENTER_LONG", "caption", { x: 0.16, y: 0.3, w: 0.68, h: 0.4 }),
  textTemplate("T_TOP", "title", { x: 0.12, y: 0.12, w: 0.76, h: 0.14 }),
  textTemplate("T_BOTTOM", "caption", { x: 0.12, y: 0.7, w: 0.76, h: 0.18 }),
  textTemplate("T_EDITORIAL_VERTICAL", "caption", { x: 0.64, y: 0.12, w: 0.2, h: 0.72 }),
];
