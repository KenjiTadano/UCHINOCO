export type DraftVersionStatus = "ready" | "editing" | "locked";

export type WriteStatus = "applied" | "stale" | "conflict" | "missing";

export type CropTriple = { x: number; y: number; scale: number };

export type DraftSpreadRow = {
  id: string;
  draftVersionId: string;
  storySpreadId: string;
  position: number;
  storyType: string;
  recommendedDensity: string;
  importance: number;
  coherence: number;
  aiLayoutId: string;
  userLayoutId: string | null;
  warnings: string[];
  revision: number;
  clientSeq: number;
};

export type DraftFrameRow = {
  id: string;
  draftSpreadId: string;
  frameId: string;
  role: string;
  position: number;
  aiPhotoId: string;
  aiCropX: number;
  aiCropY: number;
  aiCropScale: number;
  userPhotoId: string | null;
  userCropX: number | null;
  userCropY: number | null;
  userCropScale: number | null;
  matchTier: string | null;
  cropQuality: number | null;
  warnings: string[];
  revision: number;
  clientSeq: number;
};

export type EffectiveFrame = {
  photoId: string;
  crop: CropTriple;
  photoOverridden: boolean;
  cropOverridden: boolean;
};

export type EffectiveSpread = {
  layoutId: string;
  layoutOverridden: boolean;
};
