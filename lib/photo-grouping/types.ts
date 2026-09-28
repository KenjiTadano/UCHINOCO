import type { PhotoIntelligence } from "../photo-intelligence/types.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

export type VisualDescriptor = {
  dHash: string;
  aHash: string;
  /** 64-bin RGB histogram, sums to 1. */
  colorHist: number[];
  /** Histogram of the area outside the pet, when there is enough background. */
  backgroundHist: number[] | null;
};

/** One photo ready for grouping. Intelligence score is not a join signal. */
export type GroupingPhoto = {
  photoId: string;
  capturedAt: string;
  width: number;
  height: number;
  intelligence: PhotoIntelligence | null;
  analysis: SmartCropPhotoAnalysis | null;
  visual: VisualDescriptor | null;
};

export type PhotoPairSimilarity = {
  photoA: string;
  photoB: string;
  timeScore: number;
  visualScore: number;
  geometryScore: number;
  semanticScore: number;
  backgroundScore: number;
  overall: number;
  /** Hard reasons this pair must not share a scene. */
  blocks: string[];
};

export type SceneGroupMember = {
  photoId: string;
  capturedAt: string;
  overallScore: number | null;
  relativeUniqueness: number;
  representative: boolean;
};

export type PhotoSceneGroup = {
  id: string;
  photoIds: string[];
  representativePhotoId?: string;
  startedAt: string;
  endedAt: string;
  scene?: string;
  activity?: string;
  similarityScore: number;
  groupConfidence: number;
  tags: string[];
  reason: string;
  analysisVersion: string;
  burst: boolean;
  warnings: string[];
  members: SceneGroupMember[];
  pairs: PhotoPairSimilarity[];
  /** Pair against the previous photo in time, including when it was not merged. */
  boundaryPair?: PhotoPairSimilarity;
  /** Pair that stopped this photo from joining the previous group. */
  blockingPair?: PhotoPairSimilarity;
};
