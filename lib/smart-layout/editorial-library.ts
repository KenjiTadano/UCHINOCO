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
    id: `E_${id}`,
    grammarId: `E_${id}`,
    name: `${rects.length}枚・${id.includes("CLOSING") ? "結び" : id.includes("QUIET") ? "ひと休み" : composition === "grid" ? "グリッド" : composition === "equal" ? "バランス" : "大きな写真"}（${id.includes("RIGHT") || id.includes("REVERSE") ? "右" : id.includes("LEFT") ? "左" : "中央"}${id.includes("WIDE") ? "・横長" : id.includes("PORTRAIT") ? "・縦長" : id.includes("TOP") ? "・上" : ""}）`,
    photoCount: rects.length,
    scope: "spread",
    purpose: hero ? "story" : "collage",
    composition,
    editorialRole: id.includes("CLOSING") ? "closing" : composition === "quiet" ? "quiet" : rects.length === 1 ? "hero" : composition === "grid" ? "grid" : "story",
    similarGroup: group,
    avoidAfter: [group],
    cropSafety: "strict",
    recommendedSceneTypes: ["everyday", "same_day", "sequence", "event"],
    orientationAffinity: ["any"],
    heroAffinity: hero ? "preferred" : "neutral",
    density: rects.length >= 4 ? "dense" : rects.length === 1 ? "light" : "balanced",
    whitespaceIntent: composition === "quiet" ? "quiet" : "editorial",
    captionSupport: rects.length === 1 ? "prominent" : "optional",
    printSafe: true,
    frames: rects.map(
      ([x, y, w, h], i): AlbumFrameDefinition => ({
        id: `E_${id}-${i}`,
        rect: { x, y, w, h },
        preserveEditorialGeometry: true,
        cropShapeId: (w * 2) / h > 1.15 ? "landscape" : (w * 2) / h < 0.85 ? "portrait" : "square",
        slotRole: hero && i === 0 ? "hero" : "secondary",
        importance: i === 0 ? 1 : 0.55,
        cropTolerance: "low",
      }),
    ),
  };
}
const L: Rect = [0.02, 0.02, 0.44, 0.96],
  R: Rect = [0.54, 0.02, 0.44, 0.96];
const LT: Rect = [0.02, 0.02, 0.44, 0.46],
  LB: Rect = [0.02, 0.52, 0.44, 0.46];
const RT: Rect = [0.54, 0.02, 0.44, 0.46],
  RB: Rect = [0.54, 0.52, 0.44, 0.46];
const left3: Rect[] = [
  [0.02, 0.02, 0.44, 0.29],
  [0.02, 0.35, 0.44, 0.29],
  [0.02, 0.69, 0.44, 0.29],
];
const right3: Rect[] = [
  [0.54, 0.02, 0.44, 0.29],
  [0.54, 0.35, 0.44, 0.29],
  [0.54, 0.69, 0.44, 0.29],
];
const left4: Rect[] = [
  [0.02, 0.02, 0.2, 0.46],
  [0.26, 0.02, 0.2, 0.46],
  [0.02, 0.52, 0.2, 0.46],
  [0.26, 0.52, 0.2, 0.46],
];
const right4: Rect[] = [
  [0.54, 0.02, 0.2, 0.46],
  [0.78, 0.02, 0.2, 0.46],
  [0.54, 0.52, 0.2, 0.46],
  [0.78, 0.52, 0.2, 0.46],
];

/** 34 editorial body templates plus the six existing cover designs = 40 designs. */
export const EDITORIAL_TEMPLATES: EditorialTemplate[] = [
  make("1_LEFT_FULL", [L], "hero", "single-left"),
  make("1_RIGHT_FULL", [R], "hero", "single-right"),
  make("1_LEFT_WIDE", [[0.02, 0.18, 0.44, 0.64]], "hero", "single-wide"),
  make("1_RIGHT_WIDE", [[0.54, 0.18, 0.44, 0.64]], "hero", "single-wide"),
  make("1_LEFT_PORTRAIT", [[0.05, 0.02, 0.38, 0.96]], "hero", "single-portrait"),
  make("1_RIGHT_PORTRAIT", [[0.57, 0.02, 0.38, 0.96]], "hero", "single-portrait"),
  make("2_EQUAL", [L, R], "equal", "pair-equal"),
  make("2_LEFT_HERO", [L, [0.56, 0.25, 0.4, 0.5]], "story", "pair-left"),
  make("2_RIGHT_HERO", [R, [0.04, 0.25, 0.4, 0.5]], "story", "pair-right"),
  make(
    "2_STAGGER",
    [
      [0.02, 0.02, 0.44, 0.65],
      [0.54, 0.33, 0.44, 0.65],
    ],
    "editorial",
    "pair-stagger",
  ),
  make(
    "2_REVERSE_STAGGER",
    [
      [0.54, 0.02, 0.44, 0.65],
      [0.02, 0.33, 0.44, 0.65],
    ],
    "editorial",
    "pair-stagger",
  ),
  make(
    "2_WIDE",
    [
      [0.02, 0.18, 0.44, 0.64],
      [0.54, 0.18, 0.44, 0.64],
    ],
    "quiet",
    "pair-wide",
  ),
  make("3_LEFT_HERO", [L, RT, RB], "story", "triple-left"),
  make("3_RIGHT_HERO", [R, LT, LB], "story", "triple-right"),
  make("3_LEFT_TOP", [LT, LB, R], "equal", "triple-left"),
  make("3_RIGHT_TOP", [RT, RB, L], "equal", "triple-right"),
  make(
    "3_STEP",
    [
      [0.02, 0.02, 0.44, 0.6],
      [0.54, 0.02, 0.44, 0.3],
      [0.54, 0.38, 0.44, 0.6],
    ],
    "editorial",
    "triple-step",
  ),
  make(
    "3_REVERSE_STEP",
    [
      [0.54, 0.02, 0.44, 0.6],
      [0.02, 0.02, 0.44, 0.3],
      [0.02, 0.38, 0.44, 0.6],
    ],
    "editorial",
    "triple-step",
  ),
  make("4_GRID", [LT, LB, RT, RB], "grid", "four-grid"),
  make("4_LEFT_HERO", [L, ...right3], "story", "four-left"),
  make("4_RIGHT_HERO", [R, ...left3], "story", "four-right"),
  make(
    "4_TWO_LARGE",
    [
      [0.02, 0.02, 0.44, 0.62],
      [0.54, 0.02, 0.44, 0.62],
      [0.02, 0.7, 0.44, 0.28],
      [0.54, 0.7, 0.44, 0.28],
    ],
    "editorial",
    "four-two",
  ),
  make(
    "4_TWO_LOW",
    [
      [0.02, 0.36, 0.44, 0.62],
      [0.54, 0.36, 0.44, 0.62],
      [0.02, 0.02, 0.44, 0.28],
      [0.54, 0.02, 0.44, 0.28],
    ],
    "editorial",
    "four-two",
  ),
  make("5_LEFT_HERO", [L, ...right4], "story", "five-left"),
  make("5_RIGHT_HERO", [R, ...left4], "story", "five-right"),
  make("5_TWO_THREE", [LT, LB, ...right3], "editorial", "five-two-three"),
  make("5_THREE_TWO", [RT, RB, ...left3], "editorial", "five-two-three"),
  make("6_ROWS", [...left3, ...right3], "grid", "six-rows"),
  make("6_COLUMNS", [...left4, RT, RB], "grid", "six-columns"),
  make("6_REVERSE_COLUMNS", [...right4, LT, LB], "grid", "six-columns"),
  make(
    "STORY_LEFT",
    [
      [0.02, 0.02, 0.44, 0.72],
      [0.54, 0.04, 0.44, 0.42],
      [0.54, 0.56, 0.44, 0.42],
    ],
    "editorial",
    "story-left",
  ),
  make(
    "STORY_RIGHT",
    [
      [0.54, 0.02, 0.44, 0.72],
      [0.02, 0.04, 0.44, 0.42],
      [0.02, 0.56, 0.44, 0.42],
    ],
    "editorial",
    "story-right",
  ),
  make("QUIET", [[0.04, 0.14, 0.4, 0.72]], "quiet", "quiet"),
  make("CLOSING", [[0.56, 0.14, 0.4, 0.72]], "quiet", "closing"),
];

function makeNoCropFinal(id: string, rect: Rect, orientation: "portrait" | "landscape", group: string): EditorialTemplate {
  const template = make(`FINAL_NO_CROP_${id}`, [rect], "hero", group);
  return {
    ...template,
    name: orientation === "portrait" ? "全体表示・縦長" : "全体表示・横長",
    imageFit: "contain",
    orientationAffinity: [orientation],
    heroAffinity: "required",
    whitespaceIntent: "quiet",
    frames: template.frames.map((frame) => ({ ...frame, cropShapeId: orientation })),
  };
}

export const NO_CROP_FINAL_TEMPLATES: EditorialTemplate[] = [
  makeNoCropFinal("PORTRAIT_LEFT", [0.04, 0.04, 0.4, 0.92], "portrait", "no-crop-portrait"),
  makeNoCropFinal("PORTRAIT_RIGHT", [0.56, 0.04, 0.4, 0.92], "portrait", "no-crop-portrait"),
  makeNoCropFinal("LANDSCAPE_LEFT", [0.04, 0.24, 0.4, 0.52], "landscape", "no-crop-landscape"),
  makeNoCropFinal("LANDSCAPE_RIGHT", [0.56, 0.24, 0.4, 0.52], "landscape", "no-crop-landscape"),
];

const SAFE_FALLBACK_RECTS: Record<number, Rect[]> = {
  1: [[0.05, 0.06, 0.38, 0.88]],
  2: [
    [0.05, 0.06, 0.38, 0.88],
    [0.57, 0.06, 0.38, 0.88],
  ],
  3: [
    [0.05, 0.06, 0.38, 0.88],
    [0.55, 0.06, 0.2, 0.42],
    [0.77, 0.52, 0.2, 0.42],
  ],
  4: [
    [0.02, 0.04, 0.2, 0.44],
    [0.26, 0.04, 0.2, 0.44],
    [0.54, 0.52, 0.2, 0.44],
    [0.78, 0.52, 0.2, 0.44],
  ],
  5: [
    [0.02, 0.04, 0.2, 0.44],
    [0.26, 0.52, 0.2, 0.44],
    [0.54, 0.04, 0.2, 0.44],
    [0.78, 0.04, 0.2, 0.44],
    [0.54, 0.52, 0.44, 0.44],
  ],
  6: [
    [0.02, 0.04, 0.2, 0.44],
    [0.26, 0.04, 0.2, 0.44],
    [0.02, 0.52, 0.2, 0.44],
    [0.54, 0.04, 0.2, 0.44],
    [0.78, 0.04, 0.2, 0.44],
    [0.54, 0.52, 0.44, 0.44],
  ],
};

const BASE_SAFE_FALLBACK_TEMPLATES: EditorialTemplate[] = Object.entries(SAFE_FALLBACK_RECTS).flatMap(([count, rects]) => {
  const composition = Number(count) === 1 ? "quiet" : "editorial";
  const mirrored = rects.map(([x, y, w, h]) => [1 - x - w, y, w, h] as Rect);
  return [make(`SAFE_FALLBACK_${count}`, rects, composition, `safe-fallback-${count}-a`), make(`SAFE_FALLBACK_${count}_MIRRORED`, mirrored, composition, `safe-fallback-${count}-b`)];
});

export const SAFE_FALLBACK_TEMPLATES: EditorialTemplate[] = [...BASE_SAFE_FALLBACK_TEMPLATES, make("SAFE_FALLBACK_1_LANDSCAPE", [[0.02, 0.3, 0.44, 0.4]], "quiet", "safe-fallback-1-landscape-left"), make("SAFE_FALLBACK_1_LANDSCAPE_MIRRORED", [[0.54, 0.3, 0.44, 0.4]], "quiet", "safe-fallback-1-landscape-right")];

EDITORIAL_TEMPLATES.push(...SAFE_FALLBACK_TEMPLATES);
export const EDITORIAL_LIBRARY_SIZE = EDITORIAL_TEMPLATES.length + COVER_TEMPLATES.length;
export function editorialTemplate(id: string) {
  return EDITORIAL_TEMPLATES.find((t) => t.id === id) ?? NO_CROP_FINAL_TEMPLATES.find((t) => t.id === id);
}
