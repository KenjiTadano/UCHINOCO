export type OverrideMode = "inherit" | "replace" | "hidden";

export type TextKind = "title" | "caption" | "date";

export type TextStyleId = "editorial" | "warm" | "handwritten" | "minimal";

export type TextSlotId = "top-left" | "top-center" | "bottom-left" | "bottom-center" | "margin-note" | "gutter-note";

export type DecorationId = "paw" | "heart" | "star" | "tape" | "leaf" | "flower" | "spark";

export type DecorationSlotId = "deco-top-left" | "deco-top-right" | "deco-bottom-left" | "deco-bottom-right";

export type ScalePreset = "small" | "medium";

export type DecorationKitId = "minimal" | "warm" | "playful" | "seasonal";

export type DraftTextElement = {
  id: string;
  draftSpreadId: string;
  slotId: string;
  kind: TextKind;
  aiText: string | null;
  userText: string | null;
  aiStyleId: TextStyleId;
  userStyleId: TextStyleId | null;
  overrideMode: OverrideMode;
  position: number;
  revision: number;
  clientSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type DraftDecoration = {
  id: string;
  draftSpreadId: string;
  slotId: string;
  aiDecorationId: DecorationId | null;
  userDecorationId: DecorationId | null;
  aiScalePreset: ScalePreset;
  userScalePreset: ScalePreset | null;
  overrideMode: OverrideMode;
  position: number;
  revision: number;
  clientSeq: number;
  createdAt: string;
  updatedAt: string;
};

export type EffectiveText = {
  visible: boolean;
  text: string;
  styleId: TextStyleId;
  mode: OverrideMode;
};

export type EffectiveDecoration = {
  visible: boolean;
  decorationId: DecorationId | null;
  scale: ScalePreset;
  mode: OverrideMode;
};

/** User Override snapshot. null text with replace is an intentional blank, not AI. */
export type TextOverrideSnapshot = {
  mode: OverrideMode;
  text: string | null;
};

export type DecorationOverrideSnapshot = {
  mode: OverrideMode;
  decorationId: DecorationId | null;
  scale: ScalePreset | null;
};
