import { ALBUM_DRAFT_CONFIG } from "../album-draft/config.ts";
import { computeSmartCrop } from "../smart-crop/compute.ts";
import { scoreFrameMatch } from "../smart-crop/frame-match.ts";
import { SMART_CROP_FRAMES } from "../smart-crop/frames.ts";
import { combinedSubjectArea } from "../smart-crop/head.ts";
import type { NormalizedRect, SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

export const PHOTO_LAYOUT_SUITABILITY_VERSION = 1;

export type PhotoLayoutSuitability = {
  version: number;
  sourceOrientation: "portrait" | "landscape" | "square";
  sourceAspectRatio: number;
  portraitScore: number;
  landscapeScore: number;
  squareScore: number;
  heroScore: number;
  fullBleedScore: number;
  portraitCropSafe: boolean;
  landscapeCropSafe: boolean;
  squareCropSafe: boolean;
  sourceSubjectClipped: boolean;
  subjectSafeArea: NormalizedRect | null;
  subjectAnchor: "left" | "center" | "right" | "top" | "bottom" | "unknown";
  analyzedAt: string | null;
};

function scoreInRange(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function rectIsClipped(rect: { x: number; y: number; width: number; height: number }) {
  return rect.x <= 0.005 || rect.y <= 0.005 || rect.x + rect.width >= 0.995 || rect.y + rect.height >= 0.995;
}

export function sourceSubjectClipped(analysis: SmartCropPhotoAnalysis) {
  return analysis.pets.some((pet) => rectIsClipped(pet.bbox) || Boolean(pet.face && rectIsClipped(pet.face)));
}

function subjectAnchor(analysis: SmartCropPhotoAnalysis): PhotoLayoutSuitability["subjectAnchor"] {
  if (!analysis.pets.length) return "unknown";
  const minX = Math.min(...analysis.pets.map((pet) => pet.bbox.x));
  const maxX = Math.max(...analysis.pets.map((pet) => pet.bbox.x + pet.bbox.width));
  const minY = Math.min(...analysis.pets.map((pet) => pet.bbox.y));
  const maxY = Math.max(...analysis.pets.map((pet) => pet.bbox.y + pet.bbox.height));
  const dx = (minX + maxX) / 2 - 0.5;
  const dy = (minY + maxY) / 2 - 0.5;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.12) return "center";
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function orientationSuitability(analysis: SmartCropPhotoAnalysis, frameId: "portrait" | "landscape" | "square") {
  const frame = SMART_CROP_FRAMES.find((candidate) => candidate.id === frameId)!;
  const { crop, quality } = computeSmartCrop(analysis, frame);
  const match = scoreFrameMatch(analysis, frame, crop, quality);
  const cropSafe = analysis.pets.length > 0
    && !sourceSubjectClipped(analysis)
    && quality.faceSafety >= ALBUM_DRAFT_CONFIG.gate.face
    && quality.headSafety >= ALBUM_DRAFT_CONFIG.gate.head
    && quality.earSafety >= ALBUM_DRAFT_CONFIG.gate.ear
    && crop.scale <= ALBUM_DRAFT_CONFIG.gate.maxScale
    && !quality.rejected;
  return { score: Math.max(0, Math.min(100, Math.round(match.matchScore))), cropSafe };
}

export function analyzePhotoLayoutSuitability(analysis: SmartCropPhotoAnalysis, analyzedAt: string | null = null): PhotoLayoutSuitability {
  const aspect = analysis.width > 0 && analysis.height > 0 ? analysis.width / analysis.height : 1;
  const portrait = orientationSuitability(analysis, "portrait");
  const landscape = orientationSuitability(analysis, "landscape");
  const square = orientationSuitability(analysis, "square");
  const best = Math.max(portrait.score, landscape.score, square.score);
  const sourceAspectFit = Math.max(0, Math.min(100, Math.round(100 - Math.abs(Math.log(Math.max(aspect, 0.001))) * 24)));
  const subjectArea = combinedSubjectArea(analysis);
  const heroOccupancyScore = subjectArea ? Math.max(0, Math.min(100, Math.round(subjectArea.width * subjectArea.height * 200))) : 0;
  const sourceClipped = sourceSubjectClipped(analysis);
  const timestamp = analyzedAt && Number.isFinite(Date.parse(analyzedAt)) ? new Date(analyzedAt).toISOString() : null;
  const orientation = analysis.width / Math.max(analysis.height, 1);
  return {
    version: PHOTO_LAYOUT_SUITABILITY_VERSION,
    sourceOrientation: orientation > 1.05 ? "landscape" : orientation < 0.95 ? "portrait" : "square",
    sourceAspectRatio: Number.isFinite(aspect) && aspect > 0 ? aspect : 1,
    portraitScore: portrait.score,
    landscapeScore: landscape.score,
    squareScore: square.score,
    heroScore: Math.round(best * 0.7 + heroOccupancyScore * 0.3),
    fullBleedScore: Math.round(best * 0.6 + sourceAspectFit * 0.4),
    portraitCropSafe: portrait.cropSafe,
    landscapeCropSafe: landscape.cropSafe,
    squareCropSafe: square.cropSafe,
    sourceSubjectClipped: sourceClipped,
    subjectSafeArea: subjectArea,
    subjectAnchor: subjectAnchor(analysis),
    analyzedAt: timestamp,
  };
}

export function parsePhotoLayoutSuitability(value: unknown): PhotoLayoutSuitability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== PHOTO_LAYOUT_SUITABILITY_VERSION) return null;
  if (!scoreInRange(record.portraitScore) || !scoreInRange(record.landscapeScore) || !scoreInRange(record.squareScore) || !scoreInRange(record.heroScore) || !scoreInRange(record.fullBleedScore)) return null;
  if (typeof record.sourceAspectRatio !== "number" || !Number.isFinite(record.sourceAspectRatio) || record.sourceAspectRatio <= 0) return null;
  if (!["portrait", "landscape", "square"].includes(String(record.sourceOrientation))) return null;
  if (!["left", "center", "right", "top", "bottom", "unknown"].includes(String(record.subjectAnchor))) return null;
  if (record.subjectSafeArea !== null && (!record.subjectSafeArea || typeof record.subjectSafeArea !== "object" || !scoreInRange((record.subjectSafeArea as NormalizedRect).x) || !scoreInRange((record.subjectSafeArea as NormalizedRect).y) || !scoreInRange((record.subjectSafeArea as NormalizedRect).width) || !scoreInRange((record.subjectSafeArea as NormalizedRect).height))) return null;
  for (const key of ["portraitCropSafe", "landscapeCropSafe", "squareCropSafe", "sourceSubjectClipped"]) if (typeof record[key] !== "boolean") return null;
  if (record.analyzedAt !== null && (typeof record.analyzedAt !== "string" || !Number.isFinite(Date.parse(record.analyzedAt)))) return null;
  return record as PhotoLayoutSuitability;
}