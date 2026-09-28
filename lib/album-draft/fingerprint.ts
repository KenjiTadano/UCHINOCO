import { ALBUM_DRAFT_CONFIG, ALBUM_DRAFT_VERSION } from "./config.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "./layouts.ts";
import { ALBUM_LAYOUTS } from "../smart-layout/layouts.ts";
import { SMART_CROP_CONFIG } from "../smart-crop/weights.ts";

export function albumDraftFingerprint() {
  return JSON.stringify({
    version: ALBUM_DRAFT_VERSION,
    bonus: ALBUM_DRAFT_CONFIG.bonus,
    heroSafety: ALBUM_DRAFT_CONFIG.heroSafety,
    gate: ALBUM_DRAFT_CONFIG.gate,
    book: ALBUM_DRAFT_CONFIG.book,
    layouts: [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS].map((layout) => layout.id),
    cropMaxScale: SMART_CROP_CONFIG.maxScale,
    hierarchyRevision: 3,
  });
}
