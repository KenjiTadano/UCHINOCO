export type BestShotRole = "primary" | "secondary" | "alternate";

export type BestShotIntelligence = {
  overallScore: number;
  expression: number;
  petVisibility: number;
  technicalQuality: number;
  composition: number;
  memoryValue: number;
  confidence: number;
  tags: string[];
  warnings: string[];
  status: "ok" | "low_quality";
};

/** One photo inside a scene group, ready to rank. */
export type BestShotPhoto = {
  photoId: string;
  intelligence: BestShotIntelligence | null;
  relativeUniqueness: number;
  /** Normalized focus, 0–100. Same scale as Photo Intelligence sharpness. */
  sharpness: number;
};

export type BestShotGroupInput = {
  id: string;
  scene?: string;
  activity?: string;
  tags: string[];
  groupConfidence: number;
  warnings: string[];
  /**
   * Visual similarity 0–100.
   * Key is the two photo ids in sorted order, joined by "|".
   */
  visualSimilarity: Record<string, number>;
  /** Pet-placement similarity 0–100, same key as visualSimilarity. */
  geometrySimilarity?: Record<string, number>;
};

export type BestShotScores = {
  photoIntelligence: number;
  expression: number;
  petVisibility: number;
  technical: number;
  composition: number;
  memoryValue: number;
  relativeUniqueness: number;
  sharpness: number;
  duplicationPenalty: number;
  sceneRepresentativeness: number;
  overall: number;
};

export type BestShotCandidate = {
  photoId: string;
  scores: BestShotScores;
  rank: number;
  role: BestShotRole;
};

export type BestShotResult = {
  groupId: string;
  primaryPhotoId: string;
  secondaryPhotoId?: string;
  ranking: BestShotCandidate[];
  confidence: number;
  reason: string;
  secondaryReason?: string;
  warnings: string[];
  analysisVersion: string;
};
