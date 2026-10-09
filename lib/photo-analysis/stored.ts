import type { PhotoIntelligenceVision } from "../photo-intelligence/types.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";
import type { TechnicalQualityResult } from "../photo-intelligence/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function stringList(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const SCENES = new Set(["home", "outdoors", "travel", "cafe", "park", "unknown"]);
const ACTIVITIES = new Set(["sleeping", "playing", "eating", "looking_camera", "cuddling", "walking", "other", "none"]);
const MOMENTS = new Set(["funny", "calm", "action", "portrait", "everyday", "event", "unknown"]);
const SEASONS = new Set(["spring", "summer", "autumn", "winter", "unknown"]);

export function parseStoredSemantic(value: unknown): PhotoIntelligenceVision | null {
  if (!isRecord(value)) return null;
  if (!numberIn(value.expressionScore, 0, 100)) return null;
  if (!numberIn(value.uniquenessScore, 0, 100)) return null;
  if (!numberIn(value.memoryValueScore, 0, 100)) return null;
  if (!numberIn(value.confidence, 0, 1)) return null;
  if (typeof value.scene !== "string" || !SCENES.has(value.scene)) return null;
  if (typeof value.petActivity !== "string" || !ACTIVITIES.has(value.petActivity)) return null;
  if (typeof value.moment !== "string" || !MOMENTS.has(value.moment)) return null;
  if (typeof value.season !== "string" || !SEASONS.has(value.season)) return null;
  if (!stringList(value.expressionTags) || !stringList(value.memoryTags)) return null;
  if (typeof value.petPresent !== "boolean") return null;
  if (typeof value.peoplePresent !== "boolean") return null;
  if (typeof value.eyesVisible !== "boolean") return null;
  if (typeof value.reason !== "string") return null;
  return value as PhotoIntelligenceVision;
}

function rect(value: unknown) {
  if (!isRecord(value)) return false;
  return numberIn(value.x, 0, 1) && numberIn(value.y, 0, 1) && numberIn(value.width, 0, 1) && numberIn(value.height, 0, 1);
}

export function parseStoredGeometry(value: unknown): SmartCropPhotoAnalysis | null {
  if (!isRecord(value)) return null;
  if (typeof value.width !== "number" || typeof value.height !== "number") return null;
  if (!isRecord(value.focalPoint) || !numberIn(value.focalPoint.x, 0, 1) || !numberIn(value.focalPoint.y, 0, 1)) {
    return null;
  }
  if (value.orientation !== "portrait" && value.orientation !== "landscape" && value.orientation !== "square") {
    return null;
  }
  if (!Array.isArray(value.pets)) return null;
  for (const pet of value.pets) {
    if (!isRecord(pet) || !rect(pet.bbox)) return null;
    if (pet.face !== undefined && !rect(pet.face)) return null;
  }
  return value as SmartCropPhotoAnalysis;
}

export function parseStoredTechnical(value: unknown): TechnicalQualityResult | null {
  if (!isRecord(value) || !numberIn(value.technicalQuality, 0, 100)) return null;
  if (!isRecord(value.parts) || !isRecord(value.signals)) return null;
  for (const key of ["blur", "sharpness", "exposure", "contrast", "noise", "resolution"]) {
    if (!numberIn(value.parts[key], 0, 100)) return null;
  }
  for (const key of ["width", "height", "meanLuma", "lumaStd", "laplacianVar", "neighborDiff"]) {
    if (!numberIn(value.signals[key], 0, Number.MAX_SAFE_INTEGER)) return null;
  }
  if (typeof value.signals.readable !== "boolean" || typeof value.signals.pixelsKnown !== "boolean") return null;
  if (!Array.isArray(value.flags) || !value.flags.every((flag) => ["CORRUPT_IMAGE", "BLACK_IMAGE", "EXTREME_BLUR"].includes(flag))) return null;
  return value as unknown as TechnicalQualityResult;
}
