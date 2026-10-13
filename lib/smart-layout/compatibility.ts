import type { PhotoLayoutSuitability } from "./suitability.ts";
import type { TemplateFrameMetadata } from "./frame-metadata.ts";

export type PhotoFrameCompatibility = {
  score: number;
  orientationScore: number;
  aspectRatioScore: number;
  roleScore: number;
  fullBleedScore: number;
  anchorPlacementScore: number;
  cropSafetyPreference: number;
  gutterRiskPenalty: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function orientationSuitability(photo: PhotoLayoutSuitability, orientation: TemplateFrameMetadata["orientation"]) {
  if (orientation === "portrait") return photo.portraitScore;
  if (orientation === "landscape") return photo.landscapeScore;
  return photo.squareScore;
}

function orientationCropSafe(photo: PhotoLayoutSuitability, orientation: TemplateFrameMetadata["orientation"]) {
  if (orientation === "portrait") return photo.portraitCropSafe;
  if (orientation === "landscape") return photo.landscapeCropSafe;
  return photo.squareCropSafe;
}

function anchorPlacementScore(anchor: PhotoLayoutSuitability["subjectAnchor"], placement: TemplateFrameMetadata["placement"]) {
  if (placement === "full") return 0.85;
  if (anchor === "unknown" || placement === "unknown") return 0.5;
  if (anchor === "center") return placement === "center" ? 1 : 0.72;
  if (anchor === "left" || anchor === "right") return placement === anchor ? 1 : placement === "center" ? 0.78 : 0.48;
  return placement === "center" ? 0.82 : 0.62;
}

/** Ranking preference only; safety acceptance remains in the crop/frame gates. */
export function scorePhotoFrameCompatibility(photo: PhotoLayoutSuitability | null | undefined, frame: TemplateFrameMetadata): PhotoFrameCompatibility | null {
  if (!photo) return null;
  const orientation = orientationSuitability(photo, frame.orientation) / 100;
  const aspectRatio = clamp01(Math.exp(-Math.abs(Math.log(photo.sourceAspectRatio / frame.aspectRatio)) * 1.5));
  const bestOrientation = Math.max(photo.portraitScore, photo.landscapeScore, photo.squareScore);
  const role = frame.role === "hero" ? photo.heroScore / 100 : bestOrientation / 100;
  const fullBleed = frame.fullBleed ? photo.fullBleedScore / 100 : 0.5;
  const anchor = anchorPlacementScore(photo.subjectAnchor, frame.placement);
  const cropSafe = photo.sourceSubjectClipped ? 0 : orientationCropSafe(photo, frame.orientation) ? 1 : frame.allowContain ? 0.65 : 0.2;
  const gutterPenalty = frame.gutterRisk === "high" ? 0.3 : frame.gutterRisk === "medium" ? 0.12 : 0;
  const score = clamp01(
    orientation * 0.22 + aspectRatio * 0.18 + role * 0.16 + fullBleed * 0.1 + anchor * 0.12 + cropSafe * 0.22 - gutterPenalty,
  );
  return {
    score,
    orientationScore: orientation,
    aspectRatioScore: aspectRatio,
    roleScore: role,
    fullBleedScore: fullBleed,
    anchorPlacementScore: anchor,
    cropSafetyPreference: cropSafe,
    gutterRiskPenalty: gutterPenalty,
  };
}
