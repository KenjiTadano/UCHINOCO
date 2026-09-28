import { photoIntelligenceCacheKey } from "../photo-intelligence/cache.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../photo-intelligence/config.ts";
import { smartCropCacheKey } from "../smart-crop/cache.ts";
import { SUBJECT_GEOMETRY_VERSION } from "./constants.ts";
import { sourceFingerprint, type PhotoSource } from "./fingerprint.ts";

export function intelligenceMemoryKey(photo: PhotoSource & { id: string }) {
  return photoIntelligenceCacheKey(
    photo.id,
    photo.storage_path,
    PHOTO_INTELLIGENCE_VERSION,
    sourceFingerprint(photo),
  );
}

export function geometryMemoryKey(photo: PhotoSource & { id: string }) {
  return smartCropCacheKey(
    photo.id,
    photo.storage_path,
    sourceFingerprint(photo),
    SUBJECT_GEOMETRY_VERSION,
  );
}
