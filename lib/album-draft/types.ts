import type { AlbumCandidatePeriod } from "../album-candidates/types.ts";
import type { StorySpread } from "../album-story/types.ts";
import type { SmartCropFrame } from "../smart-crop/types.ts";
import type { LayoutPhotoInput, TemplateComposition } from "../smart-layout/types.ts";
import type { LayoutRhythmContext, LayoutRhythmDebug } from "./rhythm.ts";

export type DraftMatchTier = "STRICT" | "FALLBACK" | "UNUSABLE";

export type DraftStatus = "ready" | "needs_adjustment" | "unusable";

export type FramePlacement = {
  side: "left" | "right";
  /** Pixels on the 1076×1264 blank spread. */
  rect: { x: number; y: number; w: number; h: number };
  /** 0–1 of the blank spread, for preview positioning. */
  norm: { x: number; y: number; w: number; h: number };
  gutterClearance: number;
  crossesGutter: boolean;
};

export type SpreadFrameAssignment = {
  frameId: string;
  role: "hero" | "primary" | "secondary" | "detail";
  photoId: string;
  frameMatchScore: number;
  crop: { x: number; y: number; scale: number };
  cropQuality: number;
  safety: {
    faceSafety: number;
    headSafety: number;
    earSafety: number;
    bodySafety: number;
    subjectScale: number;
    maskSafety: number;
  };
  matchTier: DraftMatchTier;
  warnings: string[];
  placement: FramePlacement;
  cropFrame: SmartCropFrame;
  previewUrl: string;
};

export type SpreadQuality = {
  cropSafety: number;
  hierarchy: number;
  balance: number;
  storyFit: number;
  overall: number;
};

export type LayoutAlternative = {
  layoutId: string;
  score: number;
  layoutScore: number;
  finalScore: number;
  tier: DraftMatchTier;
  matchTier: DraftMatchTier;
  composition: TemplateComposition;
  orientationFit: number | null;
  heroFit: number | null;
  captionFit: number | null;
  storyFit: number | null;
  debugReasons: string[];
};

export type SpreadLayoutRanking = {
  selectedLayout: LayoutAlternative | null;
  alternatives: LayoutAlternative[];
};

export type BookPrintMetrics = {
  canvas: { width: number; height: number };
  bleed: number;
  gutter: { x: number; width: number };
  safeArea: {
    left: { x: number; y: number; w: number; h: number };
    right: { x: number; y: number; w: number; h: number };
  };
};

export type AlbumSpreadDraft = {
  spreadId: string;
  storySpreadId: string;
  layoutId: string;
  layoutScore: number;
  engineScore: number;
  selectedLayout: LayoutAlternative | null;
  assignments: SpreadFrameAssignment[];
  quality: SpreadQuality;
  alternatives: LayoutAlternative[];
  status: DraftStatus;
  warnings: string[];
  analysisVersion: string;
  print: BookPrintMetrics;
  story: Pick<StorySpread, "storyType" | "recommendedDensity" | "importance" | "coherenceScore" | "primaryPhotoIds" | "secondaryPhotoIds" | "startedAt">;
  rhythm?: LayoutRhythmDebug;
  heroConfidence?: number;
};

export type AlbumDraftResult = {
  period: AlbumCandidatePeriod;
  spreads: AlbumSpreadDraft[];
  warnings: string[];
  analysisVersion: string;
};

export type AlbumDraftRequest = {
  period: AlbumCandidatePeriod;
  spreads: StorySpread[];
  photos: LayoutPhotoInput[];
  rhythmContext?: LayoutRhythmContext;
};
