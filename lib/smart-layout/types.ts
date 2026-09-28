/** Task050 — Smart Layout Selection types. */

import type {
  FrameMatchResult,
  SmartCropFrame,
  SmartCropPhotoAnalysis,
  SmartCropQuality,
  SmartCropTransform,
} from "../smart-crop/types.ts";

export type AlbumSlotRole = "hero" | "primary" | "secondary" | "detail";

export type LayoutPurpose =
  | "hero"
  | "story"
  | "sequence"
  | "collage"
  | "detail";

/** Crop shape key shared with SMART_CROP_FRAMES. */
export type CropShapeId = "landscape" | "portrait" | "square" | "circle";

/**
 * Layout slot = Frame Matching shape + page role + preview rect.
 * Reuses Task048/049 crop frames via cropShapeId.
 */
export type AlbumFrameDefinition = {
  id: string;
  cropShapeId: CropShapeId;
  slotRole: AlbumSlotRole;
  /** 0–1; hero ≈ 1.0 */
  importance: number;
  /** Normalized page rect for preview (0–1). */
  rect: { x: number; y: number; w: number; h: number };
};

/** Optional polish slots. Scoring ignores these. */
export type LayoutPolishRect = { x: number; y: number; w: number; h: number };

export type LayoutTextSlot = {
  id: string;
  kind: "title" | "caption" | "date";
  rect: LayoutPolishRect;
};

export type LayoutDecorationSlot = {
  id: string;
  rect: LayoutPolishRect;
};

export type AlbumLayoutDefinition = {
  id: string;
  name: string;
  photoCount: number;
  purpose: LayoutPurpose;
  frames: AlbumFrameDefinition[];
  balanceProfile?: {
    heroWeight: number;
    symmetry: number;
    variety: number;
  };
  textSlots?: LayoutTextSlot[];
  decorationSlots?: LayoutDecorationSlot[];
};

export type LayoutPhotoInput = {
  photoId: string;
  /** Full original URL (optional for analysis continuity). */
  imageUrl: string;
  /** Thumbnail-preferred URL for layout preview rendering. */
  previewUrl: string;
  analysis: SmartCropPhotoAnalysis;
  /**
   * Optional album role from Story Spread.
   * Omitted callers keep Task050 scoring unchanged.
   */
  storyRole?: "primary" | "secondary";
};

export type LayoutAssignment = {
  photoId: string;
  frameId: string;
  cropShapeId: CropShapeId;
  slotRole: AlbumSlotRole;
  importance: number;
  frameMatch: FrameMatchResult;
  crop: SmartCropTransform;
  quality: SmartCropQuality;
  cropFrame: SmartCropFrame;
};

export type LayoutScores = {
  frameMatching: number;
  roleFit: number;
  balance: number;
  variety: number;
  cropQuality: number;
  overall: number;
};

export type LayoutMatchTier = "strict" | "fallback" | "unusable";

export type LayoutMatchResult = {
  layoutId: string;
  layout: AlbumLayoutDefinition;
  assignments: LayoutAssignment[];
  scores: LayoutScores;
  tier: LayoutMatchTier;
  needsAdjustment: boolean;
  warnings: string[];
};

export type LayoutSelectionResult = {
  best: LayoutMatchResult | null;
  ranking: LayoutMatchResult[];
  alternatives: LayoutMatchResult[];
};
