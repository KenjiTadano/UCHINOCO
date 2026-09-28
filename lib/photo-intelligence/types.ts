/** Task051 — per-photo keeper scoring. Not grouping or best-shot selection. */

export type PhotoIntelligenceStatus = "ok" | "low_quality";

export type PhotoIntelligence = {
  photoId: string;
  technicalQuality: number;
  petVisibility: number;
  expression: number;
  composition: number;
  uniqueness: number;
  memoryValue: number;
  overallScore: number;
  confidence: number;
  tags: string[];
  reasons: string[];
  warnings: string[];
  analysisVersion: string;
  status: PhotoIntelligenceStatus;
};

export type TechnicalParts = {
  /** How acceptable focus is (100 = not blurry). */
  blur: number;
  sharpness: number;
  exposure: number;
  contrast: number;
  noise: number;
  resolution: number;
};

export type TechnicalSignals = {
  width: number;
  height: number;
  readable: boolean;
  /** Pixel stats were measured. False → exposure/blur are neutral placeholders. */
  pixelsKnown: boolean;
  meanLuma: number;
  lumaStd: number;
  laplacianVar: number;
  neighborDiff: number;
};

export type TechnicalFlag = "CORRUPT_IMAGE" | "BLACK_IMAGE" | "EXTREME_BLUR";

export type TechnicalQualityResult = {
  technicalQuality: number;
  parts: TechnicalParts;
  signals: TechnicalSignals;
  flags: TechnicalFlag[];
};

export type PhotoIntelligenceScene =
  | "home"
  | "outdoors"
  | "travel"
  | "cafe"
  | "park"
  | "unknown";

export type PhotoIntelligenceActivity =
  | "sleeping"
  | "playing"
  | "eating"
  | "looking_camera"
  | "cuddling"
  | "walking"
  | "other"
  | "none";

export type PhotoIntelligenceMoment =
  | "funny"
  | "calm"
  | "action"
  | "portrait"
  | "everyday"
  | "event"
  | "unknown";

export type PhotoIntelligenceSeason =
  | "spring"
  | "summer"
  | "autumn"
  | "winter"
  | "unknown";

/** Semantic scores from Vision. Overall is computed in UCHINOCO, not here. */
export type PhotoIntelligenceVision = {
  expressionScore: number;
  uniquenessScore: number;
  memoryValueScore: number;
  confidence: number;
  scene: PhotoIntelligenceScene;
  petActivity: PhotoIntelligenceActivity;
  expressionTags: string[];
  memoryTags: string[];
  moment: PhotoIntelligenceMoment;
  season: PhotoIntelligenceSeason;
  petPresent: boolean;
  peoplePresent: boolean;
  eyesVisible: boolean;
  reason: string;
};

export type ScoreAxes = {
  technicalQuality: number;
  petVisibility: number;
  expression: number;
  composition: number;
  uniqueness: number;
  memoryValue: number;
};
