import type { AlbumLayoutDefinition, CropShapeId, TemplateComposition, TemplateOrientation } from "./types.ts";

type Slot = [string, CropShapeId, "hero" | "primary" | "secondary" | "detail", number, number, number, number, number];

function template(id: string, name: string, photoCount: number, composition: TemplateComposition, orientation: TemplateOrientation[], slots: Slot[], options: Partial<AlbumLayoutDefinition> = {}): AlbumLayoutDefinition {
  return {
    id,
    grammarId: id,
    name,
    photoCount,
    purpose: composition === "equal" || composition === "grid" ? "collage" : composition === "hero" || composition === "fullBleed" ? "hero" : "story",
    scope: "spread",
    composition,
    orientationAffinity: orientation,
    heroAffinity: composition === "hero" || composition === "fullBleed" ? "preferred" : composition === "equal" || composition === "grid" ? "avoid" : "neutral",
    density: photoCount >= 4 ? "dense" : photoCount === 1 ? "light" : "balanced",
    whitespaceIntent: composition === "quiet" ? "quiet" : composition === "editorial" ? "editorial" : composition === "fullBleed" ? "none" : "balanced",
    captionSupport: options.textSlots?.length ? "prominent" : "optional",
    printSafe: true,
    balanceProfile: options.balanceProfile ?? { heroWeight: composition === "hero" ? 0.9 : 0.45, symmetry: composition === "equal" || composition === "grid" ? 0.9 : 0.45, variety: composition === "editorial" ? 0.85 : 0.55 },
    ...options,
    frames: slots.map(([slotId, cropShapeId, slotRole, importance, x, y, w, h]) => ({ id: `${id}-${slotId}`, cropShapeId, slotRole, importance, rect: { x, y, w, h }, preferredOrientation: cropShapeId === "circle" ? "square" : cropShapeId, cropTolerance: slotRole === "hero" ? "low" : "medium" })),
  };
}

const captionBottom = [{ id: "caption-bottom", kind: "caption" as const, rect: { x: 0.08, y: 0.86, w: 0.84, h: 0.08 } }];
const captionSide = [{ id: "caption-side", kind: "caption" as const, rect: { x: 0.7, y: 0.18, w: 0.22, h: 0.52 } }];

/** New Grammar v1 photo templates. Existing Lxx layouts remain in the catalog. */
export const GRAMMAR_V1_PHOTO_TEMPLATES: AlbumLayoutDefinition[] = [
  template("P1_FULL_BLEED", "全面写真", 1, "fullBleed", ["landscape", "mixed"], [["hero", "landscape", "hero", 1, 0.01, 0.01, 0.98, 0.98]]),
  template("P1_CENTER_LANDSCAPE", "横写真を中央に", 1, "quiet", ["landscape"], [["hero", "landscape", "primary", 0.9, 0.12, 0.2, 0.76, 0.6]]),
  template("P1_CAPTION_BOTTOM", "写真とことば", 1, "editorial", ["any"], [["hero", "landscape", "hero", 1, 0.06, 0.06, 0.88, 0.72]], { textSlots: captionBottom }),
  template("P1_SIDE_TEXT", "写真とサイドノート", 1, "editorial", ["portrait", "mixed"], [["hero", "portrait", "hero", 1, 0.08, 0.08, 0.54, 0.84]], { textSlots: captionSide }),

  template("P2_LARGE_SMALL", "大きな写真と小さな写真", 2, "story", ["mixed"], [["hero", "landscape", "hero", 1, 0.04, 0.06, 0.62, 0.88], ["support", "portrait", "secondary", 0.62, 0.71, 0.28, 0.25, 0.54]]),
  template("P2_MIXED_PAIR", "縦と横のペア", 2, "editorial", ["mixed"], [["portrait", "portrait", "primary", 0.82, 0.06, 0.08, 0.37, 0.84], ["landscape", "landscape", "primary", 0.82, 0.5, 0.24, 0.44, 0.52]]),
  template("P2_CAPTION_PAIR", "2枚とキャプション", 2, "editorial", ["any"], [["a", "landscape", "primary", 0.8, 0.05, 0.06, 0.43, 0.7], ["b", "landscape", "primary", 0.8, 0.52, 0.06, 0.43, 0.7]], { textSlots: captionBottom }),

  template("P3_HERO_BOTTOM", "下に大きな写真", 3, "story", ["landscape", "mixed"], [["a", "square", "secondary", 0.58, 0.05, 0.05, 0.42, 0.32], ["b", "square", "secondary", 0.58, 0.53, 0.05, 0.42, 0.32], ["hero", "landscape", "hero", 1, 0.05, 0.43, 0.9, 0.52]]),
  template("P3_HERO_RIGHT", "右に大きな写真", 3, "story", ["portrait", "mixed"], [["a", "landscape", "secondary", 0.58, 0.05, 0.05, 0.38, 0.42], ["b", "landscape", "secondary", 0.58, 0.05, 0.53, 0.38, 0.42], ["hero", "portrait", "hero", 1, 0.49, 0.05, 0.46, 0.9]]),
  template("P3_LANDSCAPE_STACK", "横写真を3段に", 3, "equal", ["landscape"], [["a", "landscape", "primary", 0.75, 0.06, 0.04, 0.88, 0.28], ["b", "landscape", "primary", 0.75, 0.06, 0.36, 0.88, 0.28], ["c", "landscape", "primary", 0.75, 0.06, 0.68, 0.88, 0.28]]),

  template("P4_HERO_TOP", "上に大きな写真と3枚", 4, "story", ["landscape", "mixed"], [["hero", "landscape", "hero", 1, 0.04, 0.04, 0.92, 0.5], ["a", "square", "secondary", 0.55, 0.04, 0.59, 0.28, 0.36], ["b", "square", "secondary", 0.55, 0.36, 0.59, 0.28, 0.36], ["c", "square", "secondary", 0.55, 0.68, 0.59, 0.28, 0.36]]),
  template("P4_HERO_RIGHT", "右に大きな写真と3枚", 4, "story", ["portrait", "mixed"], [["a", "landscape", "secondary", 0.54, 0.04, 0.04, 0.4, 0.27], ["b", "landscape", "secondary", 0.54, 0.04, 0.365, 0.4, 0.27], ["c", "landscape", "secondary", 0.54, 0.04, 0.69, 0.4, 0.27], ["hero", "portrait", "hero", 1, 0.5, 0.04, 0.46, 0.92]]),
  template("P4_HERO_LEFT", "左に大きな写真と3枚", 4, "story", ["portrait", "mixed"], [["hero", "portrait", "hero", 1, 0.04, 0.04, 0.46, 0.92], ["a", "landscape", "secondary", 0.54, 0.56, 0.04, 0.4, 0.27], ["b", "landscape", "secondary", 0.54, 0.56, 0.365, 0.4, 0.27], ["c", "landscape", "secondary", 0.54, 0.56, 0.69, 0.4, 0.27]]),
  template("P4_EQUAL_COLUMNS", "4枚の縦リズム", 4, "equal", ["portrait"], [["a", "portrait", "primary", 0.72, 0.03, 0.1, 0.22, 0.8], ["b", "portrait", "primary", 0.72, 0.27, 0.1, 0.22, 0.8], ["c", "portrait", "primary", 0.72, 0.51, 0.1, 0.22, 0.8], ["d", "portrait", "primary", 0.72, 0.75, 0.1, 0.22, 0.8]]),
  template("P4_EDITORIAL", "4枚のエディトリアル", 4, "editorial", ["mixed"], [["hero", "landscape", "hero", 0.95, 0.04, 0.05, 0.55, 0.48], ["a", "portrait", "primary", 0.72, 0.65, 0.05, 0.31, 0.42], ["b", "portrait", "secondary", 0.58, 0.04, 0.6, 0.27, 0.35], ["c", "landscape", "secondary", 0.58, 0.37, 0.58, 0.59, 0.37]]),
  template("P4_CAPTION", "4枚とキャプション", 4, "grid", ["any"], [["a", "square", "primary", 0.7, 0.05, 0.05, 0.42, 0.34], ["b", "square", "primary", 0.7, 0.53, 0.05, 0.42, 0.34], ["c", "square", "primary", 0.7, 0.05, 0.45, 0.42, 0.34], ["d", "square", "primary", 0.7, 0.53, 0.45, 0.42, 0.34]], { textSlots: captionBottom }),
];
