/** Cover design templates + colors for 07.3 (local edit state; no DB schema). */

export type CoverTemplateId =
  | "simple"
  | "natural"
  | "polaroid"
  | "seasonal"
  | "handwritten"
  | "custom";

export type CoverColorId =
  | "white"
  | "pink"
  | "blue"
  | "sage"
  | "beige"
  | "charcoal";

export type CoverTemplate = {
  id: CoverTemplateId;
  label: string;
  overlaySrc: string | null;
};

export type CoverColor = {
  id: CoverColorId;
  label: string;
  /** Tint applied via multiply layer on shell (not a global filter). */
  tint: string | null;
  /** Visible swatch fill (may differ from tint for white). */
  swatch: string;
};

export const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "simple",
    label: "シンプル",
    overlaySrc: "/album/cover-overlays/simple-overlay.png",
  },
  {
    id: "natural",
    label: "ナチュラル",
    overlaySrc: "/album/cover-overlays/natural-overlay.png",
  },
  {
    id: "polaroid",
    label: "ポラロイド",
    overlaySrc: "/album/cover-overlays/polaroid-overlay.png",
  },
  {
    id: "seasonal",
    label: "季節のデザイン",
    overlaySrc: "/album/cover-overlays/seasonal-overlay.png",
  },
  {
    id: "handwritten",
    label: "手書き風",
    overlaySrc: "/album/cover-overlays/handwritten-overlay.png",
  },
  {
    id: "custom",
    label: "カスタム",
    overlaySrc: "/album/cover-overlays/custom-overlay.png",
  },
];

export const COVER_COLORS: CoverColor[] = [
  { id: "white", label: "白", tint: null, swatch: "#ffffff" },
  { id: "pink", label: "ピンク", tint: "#f0c8cc", swatch: "#f0c8cc" },
  { id: "blue", label: "ブルー", tint: "#c5d5e8", swatch: "#c5d5e8" },
  { id: "sage", label: "セージ", tint: "#c5d0c0", swatch: "#c5d0c0" },
  { id: "beige", label: "ベージュ", tint: "#e4d5c4", swatch: "#e4d5c4" },
  { id: "charcoal", label: "チャコール", tint: "#6a625c", swatch: "#6a625c" },
];

export function getCoverTemplate(id: CoverTemplateId): CoverTemplate {
  return COVER_TEMPLATES.find((t) => t.id === id) ?? COVER_TEMPLATES[0];
}

export function getCoverColor(id: CoverColorId): CoverColor {
  return COVER_COLORS.find((c) => c.id === id) ?? COVER_COLORS[0];
}
