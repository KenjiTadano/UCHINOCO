/** Task050 — Smart Layout Selection types. */

import type { FrameMatchResult, SmartCropFrame, SmartCropPhotoAnalysis, SmartCropQuality, SmartCropTransform } from "../smart-crop/types.ts";
import type { BestShotCandidate, BestShotResult } from "../best-shot/types.ts";
import type { PhotoIntelligence } from "../photo-intelligence/types.ts";

export type LayoutPhotoIntelligence = Pick<PhotoIntelligence, "overallScore" | "composition" | "technicalQuality" | "petVisibility" | "expression" | "memoryValue" | "status">;

/** Existing Best Shot candidate axes plus its result-level confidence. */
export type LayoutBestShot = {
  candidate: Pick<BestShotCandidate, "role"> & {
    scores: Pick<BestShotCandidate["scores"], "overall" | "sceneRepresentativeness">;
  };
  confidence: BestShotResult["confidence"];
};

export type AlbumSlotRole = "hero" | "primary" | "secondary" | "detail";

export type LayoutPurpose = "hero" | "story" | "sequence" | "collage" | "detail";

/** Crop shape key shared with SMART_CROP_FRAMES. */
export type CropShapeId = "landscape" | "portrait" | "square" | "circle";
export type TemplateScope = "page" | "spread";
export type TemplateComposition = "hero" | "equal" | "story" | "grid" | "editorial" | "quiet" | "fullBleed";
export type TemplateOrientation = "portrait" | "landscape" | "square" | "mixed" | "any";
export type TemplateDensity = "quiet" | "light" | "balanced" | "dense";
export type WhitespaceIntent = "none" | "balanced" | "editorial" | "quiet";
export type CropTolerance = "low" | "medium" | "high";

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
  preferredOrientation?: TemplateOrientation;
  cropTolerance?: CropTolerance;
  /** Task078.2 coordinates on real facing pages; keep the authored geometry. */
  preserveEditorialGeometry?: boolean;
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
  grammarId?: string;
  scope?: TemplateScope;
  composition?: TemplateComposition;
  orientationAffinity?: TemplateOrientation[];
  heroAffinity?: "required" | "preferred" | "neutral" | "avoid";
  density?: TemplateDensity;
  whitespaceIntent?: WhitespaceIntent;
  captionSupport?: "none" | "optional" | "prominent";
  decorationSafeZones?: LayoutDecorationSlot[];
  printSafe?: boolean;
  legacyStatus?: "KEEP" | "REDESIGN" | "LEGACY";
};

export type LayoutPhotoInput = {
  photoId: string;
  petId?: string;
  /** Full original URL (optional for analysis continuity). */
  imageUrl: string;
  /** Thumbnail-preferred URL for layout preview rendering. */
  previewUrl: string;
  analysis: SmartCropPhotoAnalysis;
  /** Optional PI values; omitted callers keep existing Smart Layout behavior. */
  photoIntelligence?: LayoutPhotoIntelligence;
  /** Optional Best Shot candidate and its result-level confidence. */
  bestShot?: LayoutBestShot;
  /**
   * Optional album role from Story Spread.
   * Omitted callers keep Task050 scoring unchanged.
   */
  storyRole?: "primary" | "secondary";
  /** True when the surrounding story has user-visible copy to place. */
  captionAvailable?: boolean;
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
  photoIntelligence?: LayoutPhotoIntelligence;
  bestShot?: LayoutBestShot;
  heroSuitability: number;
};

export type LayoutScores = {
  frameMatching: number;
  roleFit: number;
  balance: number;
  variety: number;
  cropQuality: number;
  orientationAffinity: number;
  hierarchyFit: number;
  hierarchyNeed: number;
  overall: number;
};

export type LayoutMatchTier = "strict" | "fallback" | "unusable";

export type SmartLayoutV2Debug = {
  family: TemplateComposition;
  orientationFit: number;
  heroFit: number;
  captionFit: number;
  storyFit: number;
  cropFit: number;
  spreadSafety: number;
  templateAffinity: number;
  finalScore: number;
};

export type LayoutMatchResult = {
  layoutId: string;
  layout: AlbumLayoutDefinition;
  assignments: LayoutAssignment[];
  scores: LayoutScores;
  tier: LayoutMatchTier;
  invalid: boolean;
  /** 0–1 confidence for a clear hero in the input photo set. */
  heroConfidence: number;
  needsAdjustment: boolean;
  warnings: string[];
  /** Explainable, additive v2 signals. The Task050 engine score remains intact. */
  v2?: SmartLayoutV2Debug;
};

export type LayoutSelectionResult = {
  best: LayoutMatchResult | null;
  ranking: LayoutMatchResult[];
  alternatives: LayoutMatchResult[];
};
