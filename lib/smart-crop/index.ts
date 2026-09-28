export type {
  NormalizedRect,
  SmartCropPet,
  SmartCropPhotoAnalysis,
  SmartCropFrame,
  SmartCropFrameShapeRole,
  FrameLayoutRole,
  SmartCropTransform,
  SmartCropQuality,
  SmartCropState,
  SmartCropFrameResult,
  IdealOccupancyRange,
  FrameMatchCompatibility,
  FrameMatchRejectReason,
  FrameMatchTier,
  FrameMatchWarning,
  FrameMatchResult,
  FrameMatchRanking,
} from "./types.ts";

export { SMART_CROP_FRAMES, getSmartCropFrame } from "./frames.ts";
export { SMART_CROP_CONFIG, SMART_CROP_WEIGHTS } from "./weights.ts";
export {
  computeSmartCrop,
  fallbackCenterCrop,
  buildSubjectRect,
  buildSmartCropFrameResults,
  combinedSubjectArea,
  headSafeAreaFromFace,
  petHeadSafeAreas,
  combinedHeadSafeArea,
} from "./compute.ts";
export { computeSmartCropV0 } from "./compute-v0.ts";
export { scoreSmartCrop, isHardRejected } from "./quality.ts";
export { visibleWindow } from "./geometry.ts";
export { sanitizeCropTransform } from "./transform.ts";
export {
  findBestFrameForPhoto,
  rankFramesFromCropResults,
  scoreFrameMatch,
  scoreAspectCompatibility,
  scoreSubjectFit,
  scoreMaskFit,
  scoreCompositionFit,
  scoreCropQuality,
  scoreFallbackScore,
  FRAME_MATCH_REJECT_LABELS,
  FRAME_MATCH_WARNING_LABELS,
} from "./frame-match.ts";
