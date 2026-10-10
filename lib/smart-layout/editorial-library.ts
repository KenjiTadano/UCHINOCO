import type { AlbumFrameDefinition, AlbumLayoutDefinition, TemplateComposition } from "./types.ts";
import { COVER_TEMPLATES } from "../album-cover-templates.ts";

type Rect = [number, number, number, number];
export type EditorialTemplate = AlbumLayoutDefinition & {
  editorialRole: "hero" | "story" | "grid" | "quiet" | "closing";
  similarGroup: string;
  avoidAfter: string[];
  cropSafety: "strict";
  recommendedSceneTypes: string[];
};

// Coordinates describe real facing pages, split at .48/.52. Never cross the binding.
function make(id: string, rects: Rect[], composition: TemplateComposition, group: string): EditorialTemplate {
  const hero = !["equal", "grid"].includes(composition);
  return {
    id: `E_${id}`, grammarId: `E_${id}`, name: `${rects.length}枚・${id.includes("CLOSING") ? "結び" : id.includes("QUIET") ? "ひと休み" : composition === "grid" ? "グリッド" : composition === "equal" ? "バランス" : "大きな写真"}（${id.includes("RIGHT") || id.includes("REVERSE") ? "右" : id.includes("LEFT") ? "左" : "中央"}${id.includes("WIDE") ? "・横長" : id.includes("PORTRAIT") ? "・縦長" : id.includes("TOP") ? "・上" : ""}）`, photoCount: rects.length,
    scope: "spread", purpose: hero ? "story" : "collage", composition,
    editorialRole: id.includes("CLOSING") ? "closing" : composition === "quiet" ? "quiet" : rects.length === 1 ? "hero" : composition === "grid" ? "grid" : "story",
    similarGroup: group, avoidAfter: [group], cropSafety: "strict", recommendedSceneTypes: ["everyday", "same_day", "sequence", "event"],
    orientationAffinity: ["any"], heroAffinity: hero ? "preferred" : "neutral",
    density: rects.length >= 4 ? "dense" : rects.length === 1 ? "light" : "balanced",
    whitespaceIntent: composition === "quiet" ? "quiet" : "editorial", captionSupport: rects.length === 1 ? "prominent" : "optional", printSafe: true,
    frames: rects.map(([x,y,w,h], i): AlbumFrameDefinition => ({
      id: `E_${id}-${i}`, rect: {x,y,w,h}, preserveEditorialGeometry: true,
      cropShapeId: w * 2 / h > 1.15 ? "landscape" : w * 2 / h < .85 ? "portrait" : "square",
      slotRole: hero && i === 0 ? "hero" : "secondary", importance: i === 0 ? 1 : .55,
      cropTolerance: "low",
    })),
  };
}
const L: Rect = [.02,.02,.44,.96], R: Rect = [.54,.02,.44,.96];
const LT: Rect = [.02,.02,.44,.46], LB: Rect = [.02,.52,.44,.46];
const RT: Rect = [.54,.02,.44,.46], RB: Rect = [.54,.52,.44,.46];
const left3: Rect[] = [[.02,.02,.44,.29],[.02,.35,.44,.29],[.02,.69,.44,.29]];
const right3: Rect[] = [[.54,.02,.44,.29],[.54,.35,.44,.29],[.54,.69,.44,.29]];
const left4: Rect[] = [[.02,.02,.20,.46],[.26,.02,.20,.46],[.02,.52,.20,.46],[.26,.52,.20,.46]];
const right4: Rect[] = [[.54,.02,.20,.46],[.78,.02,.20,.46],[.54,.52,.20,.46],[.78,.52,.20,.46]];

/** 34 editorial body templates plus the six existing cover designs = 40 designs. */
export const EDITORIAL_TEMPLATES: EditorialTemplate[] = [
  make("1_LEFT_FULL", [L], "hero", "single-left"), make("1_RIGHT_FULL", [R], "hero", "single-right"),
  make("1_LEFT_WIDE", [[.02,.18,.44,.64]], "hero", "single-wide"), make("1_RIGHT_WIDE", [[.54,.18,.44,.64]], "hero", "single-wide"),
  make("1_LEFT_PORTRAIT", [[.05,.02,.38,.96]], "hero", "single-portrait"), make("1_RIGHT_PORTRAIT", [[.57,.02,.38,.96]], "hero", "single-portrait"),
  make("2_EQUAL", [L,R], "equal", "pair-equal"), make("2_LEFT_HERO", [L,[.56,.25,.40,.50]], "story", "pair-left"),
  make("2_RIGHT_HERO", [R,[.04,.25,.40,.50]], "story", "pair-right"), make("2_STAGGER", [[.02,.02,.44,.65],[.54,.33,.44,.65]], "editorial", "pair-stagger"),
  make("2_REVERSE_STAGGER", [[.54,.02,.44,.65],[.02,.33,.44,.65]], "editorial", "pair-stagger"), make("2_WIDE", [[.02,.18,.44,.64],[.54,.18,.44,.64]], "quiet", "pair-wide"),
  make("3_LEFT_HERO", [L,RT,RB], "story", "triple-left"), make("3_RIGHT_HERO", [R,LT,LB], "story", "triple-right"),
  make("3_LEFT_TOP", [LT,LB,R], "equal", "triple-left"), make("3_RIGHT_TOP", [RT,RB,L], "equal", "triple-right"),
  make("3_STEP", [[.02,.02,.44,.6],[.54,.02,.44,.3],[.54,.38,.44,.60]], "editorial", "triple-step"),
  make("3_REVERSE_STEP", [[.54,.02,.44,.6],[.02,.02,.44,.3],[.02,.38,.44,.60]], "editorial", "triple-step"),
  make("4_GRID", [LT,LB,RT,RB], "grid", "four-grid"), make("4_LEFT_HERO", [L,...right3], "story", "four-left"),
  make("4_RIGHT_HERO", [R,...left3], "story", "four-right"),
  make("4_TWO_LARGE", [[.02,.02,.44,.62],[.54,.02,.44,.62],[.02,.70,.44,.28],[.54,.70,.44,.28]], "editorial", "four-two"),
  make("4_TWO_LOW", [[.02,.36,.44,.62],[.54,.36,.44,.62],[.02,.02,.44,.28],[.54,.02,.44,.28]], "editorial", "four-two"),
  make("5_LEFT_HERO", [L,...right4], "story", "five-left"), make("5_RIGHT_HERO", [R,...left4], "story", "five-right"),
  make("5_TWO_THREE", [LT,LB,...right3], "editorial", "five-two-three"), make("5_THREE_TWO", [RT,RB,...left3], "editorial", "five-two-three"),
  make("6_ROWS", [...left3,...right3], "grid", "six-rows"), make("6_COLUMNS", [...left4,RT,RB], "grid", "six-columns"),
  make("6_REVERSE_COLUMNS", [...right4,LT,LB], "grid", "six-columns"),
  make("STORY_LEFT", [[.02,.02,.44,.72],[.54,.04,.44,.42],[.54,.56,.44,.42]], "editorial", "story-left"),
  make("STORY_RIGHT", [[.54,.02,.44,.72],[.02,.04,.44,.42],[.02,.56,.44,.42]], "editorial", "story-right"),
  make("QUIET", [[.04,.14,.40,.72]], "quiet", "quiet"),
  make("CLOSING", [[.56,.14,.40,.72]], "quiet", "closing"),
];

const SAFE_FALLBACK_RECTS: Record<number, Rect[]> = {
  1: [[.05,.06,.38,.88]],
  2: [[.05,.06,.38,.88],[.57,.06,.38,.88]],
  3: [[.05,.06,.38,.88],[.55,.06,.20,.42],[.77,.52,.20,.42]],
  4: [[.02,.04,.20,.44],[.26,.04,.20,.44],[.54,.52,.20,.44],[.78,.52,.20,.44]],
  5: [[.02,.04,.20,.44],[.26,.52,.20,.44],[.54,.04,.20,.44],[.78,.04,.20,.44],[.54,.52,.44,.44]],
  6: [[.02,.04,.20,.44],[.26,.04,.20,.44],[.02,.52,.20,.44],[.54,.04,.20,.44],[.78,.04,.20,.44],[.54,.52,.44,.44]],
};

const BASE_SAFE_FALLBACK_TEMPLATES: EditorialTemplate[] = Object.entries(SAFE_FALLBACK_RECTS).flatMap(([count, rects]) => {
  const composition = Number(count) === 1 ? "quiet" : "editorial";
  const mirrored = rects.map(([x, y, w, h]) => [1 - x - w, y, w, h] as Rect);
  return [
    make(`SAFE_FALLBACK_${count}`, rects, composition, `safe-fallback-${count}-a`),
    make(`SAFE_FALLBACK_${count}_MIRRORED`, mirrored, composition, `safe-fallback-${count}-b`),
  ];
});

export const SAFE_FALLBACK_TEMPLATES: EditorialTemplate[] = [
  ...BASE_SAFE_FALLBACK_TEMPLATES,
  make("SAFE_FALLBACK_1_LANDSCAPE", [[.02,.30,.44,.40]], "quiet", "safe-fallback-1-landscape-left"),
  make("SAFE_FALLBACK_1_LANDSCAPE_MIRRORED", [[.54,.30,.44,.40]], "quiet", "safe-fallback-1-landscape-right"),
];

EDITORIAL_TEMPLATES.push(...SAFE_FALLBACK_TEMPLATES);
export const EDITORIAL_LIBRARY_SIZE = EDITORIAL_TEMPLATES.length + COVER_TEMPLATES.length;
export function editorialTemplate(id: string) { return EDITORIAL_TEMPLATES.find(t => t.id === id); }
