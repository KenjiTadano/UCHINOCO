/** Task048 / 048.1 / 049 — Smart Crop + Frame Matching types. */

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SmartCropPet = {
  bbox: NormalizedRect;
  face?: NormalizedRect;
  confidence?: number;
};

export type SmartCropPhotoAnalysis = {
  width: number;
  height: number;
  pets: SmartCropPet[];
  focalPoint: { x: number; y: number };
  orientation: "portrait" | "landscape" | "square";
  warning?: string;
  /** Task049.1 — detection confidence (0–1). */
  analysisConfidence?: {
    petDetection: number;
  };
};

export type IdealOccupancyRange = {
  min: number;
  max: number;
};

/** Shape / crop role (used by Smart Crop). */
export type SmartCropFrameShapeRole =
  | "landscape"
  | "portrait"
  | "square"
  | "circle";

/**
 * Future Layout Selection role (Task049 prepares the field only).
 * Does not strongly drive matchScore yet.
 */
export type FrameLayoutRole =
  | "hero"
  | "standard"
  | "detail"
  | "portrait"
  | "group";

export type SmartCropFrame = {
  id: string;
  aspectRatio: number;
  mask: "rect" | "circle";
  safeArea: NormalizedRect;
  role: SmartCropFrameShapeRole;
  /** Prep for album layout selection — weak influence on ranking for now. */
  layoutRole: FrameLayoutRole;
  label: string;
  /** Ideal head occupancy (max of w/h ratio vs visible window). */
  idealHeadOccupancy: IdealOccupancyRange;
  /** Soft max zoom for this frame. */
  maxScale: number;
  /** Prefer slightly upper focal for heads. */
  preferUpperFocal: boolean;
};

/**
 * Cover-based transform.
 * - x/y: focal / crop-center in normalized image coords (0–1)
 * - scale: zoom relative to object-fit:cover (≥1 zooms in)
 */
export type SmartCropTransform = {
  x: number;
  y: number;
  scale: number;
};

export type SmartCropQuality = {
  faceSafety: number;
  headSafety: number;
  earSafety: number;
  bodySafety: number;
  subjectScale: number;
  maskSafety: number;
  cropAmount: number;
  composition: number;
  /** Multi-pet combined coverage (also used in reject). */
  subjectCoverage: number;
  overall: number;
  rejected?: boolean;
  rejectReason?: string;
};

export type SmartCropState = {
  aiCrop: SmartCropTransform;
  crop: SmartCropTransform;
  userAdjusted: boolean;
};

export type SmartCropFrameResult = {
  frame: SmartCropFrame;
  /** Task048.1 winning crop */
  aiCrop: SmartCropTransform;
  quality: SmartCropQuality;
  candidatesEvaluated: number;
  /** Task048 baseline for Before/After */
  legacyCrop: SmartCropTransform;
  legacyQuality: SmartCropQuality;
};

/** Task049 — Photo × Frame Matching compatibility breakdown. */
export type FrameMatchCompatibility = {
  aspect: number;
  cropQuality: number;
  subjectFit: number;
  maskFit: number;
  compositionFit: number;
};

export type FrameMatchRejectReason =
  | "MASK_SAFETY_TOO_LOW"
  | "FACE_SAFETY_TOO_LOW"
  | "HEAD_SAFETY_TOO_LOW"
  | "MULTI_SUBJECT_COVERAGE_TOO_LOW"
  | "CROP_HARD_REJECT"
  | "CIRCLE_NOT_SUITABLE"
  | "FACE_MOSTLY_OUTSIDE"
  | "SUBJECT_INVISIBLE";

export type FrameMatchTier = "strict" | "fallback" | "unusable";

export type FrameMatchWarning =
  | "HEAD_SAFETY_LOW"
  | "FACE_SAFETY_LOW"
  | "MASK_SAFETY_LOW"
  | "PET_DETECTION_LOW_CONFIDENCE"
  | "FALLBACK_BEST"
  | "NEEDS_ADJUSTMENT"
  | "CIRCLE_MARGIN_TIGHT";

export type FrameMatchResult = {
  frameId: string;
  frame: SmartCropFrame;
  crop: SmartCropTransform;
  quality: SmartCropQuality;
  compatibility: FrameMatchCompatibility;
  matchScore: number;
  /** Safety-first score used when selecting among fallback candidates. */
  fallbackScore: number;
  /** Failed STRICT thresholds (Task049). Unusable also sets this. */
  rejected: boolean;
  rejectReasons: FrameMatchRejectReason[];
  matchTier: FrameMatchTier;
  warnings: FrameMatchWarning[];
  fallbackReason?: string;
  /** Hint for future editor: show “adjust position” copy. */
  needsAdjustment: boolean;
};

export type FrameMatchRanking = {
  best: FrameMatchResult | null;
  ranking: FrameMatchResult[];
  /** How best was selected. */
  mode: "strict" | "fallback" | "none";
};
