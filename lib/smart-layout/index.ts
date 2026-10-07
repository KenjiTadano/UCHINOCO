export type {
  AlbumSlotRole,
  LayoutPurpose,
  CropShapeId,
  TemplateScope,
  TemplateComposition,
  TemplateOrientation,
  TemplateDensity,
  WhitespaceIntent,
  CropTolerance,
  AlbumFrameDefinition,
  AlbumLayoutDefinition,
  LayoutPhotoInput,
  LayoutAssignment,
  LayoutScores,
  LayoutMatchTier,
  LayoutMatchResult,
  LayoutSelectionResult,
  SmartLayoutV2Debug,
} from "./types.ts";

export { SMART_LAYOUT_CONFIG } from "./config.ts";
export { ALBUM_LAYOUTS, getAlbumLayout, layoutsForPhotoCount } from "./layouts.ts";
export { resolveCropFrame } from "./frames.ts";
export { evaluateLayout, storyHierarchyDelta } from "./assign.ts";
export { findBestLayoutForPhotos } from "./select.ts";
export {
  TEMPLATE_GRAMMAR_VERSION,
  LEGACY_TEMPLATE_MAP,
  SPREAD_TEMPLATES,
  TEXT_ONLY_TEMPLATES,
  templateMetadata,
  filterTemplateCandidates,
  rankTemplateCandidates,
  automaticSpreadTemplates,
  spreadTemplateCrossesGutter,
} from "./template-system.ts";
export { withSmartLayoutV2Score } from "./v2.ts";
export type { SmartLayoutV2Context } from "./v2.ts";
export { scoreRoleFit } from "./role-fit.ts";
export { scoreLayoutBalance } from "./balance.ts";
export { scoreVisualVariety } from "./variety.ts";
export { scoreOrientationAffinity } from "./orientation.ts";
export { scoreHierarchyFit, weakPhotoHeroPenalty } from "./hierarchy.ts";
export {
  buildOrientationProfile,
  buildQualityProfile,
  buildPhotoSetQualityProfile,
  estimatePhotoQuality,
} from "./photo-set.ts";
