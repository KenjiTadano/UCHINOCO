import { ALBUM_GENERATION_VERSION } from "../album-generation/config.ts";
import { DRAFT_GENERATION_METADATA } from "./config.ts";
import type { CropTriple } from "./types.ts";

export type PersistableAssignment = {
  frameId: string;
  role: string;
  photoId: string;
  crop: CropTriple;
  cropQuality: number;
  matchTier: string;
  warnings: string[];
};

export type PersistableSpread = {
  storySpreadId: string;
  layoutId: string;
  warnings: string[];
  story: {
    storyType: string;
    recommendedDensity: string;
    importance: number;
    coherenceScore: number;
  };
  assignments: PersistableAssignment[];
};

export type DraftSavePayload = {
  generationVersion: string;
  metadata: Record<string, unknown>;
  spreads: Array<{
    storySpreadId: string;
    position: number;
    storyType: string;
    recommendedDensity: string;
    importance: number;
    coherence: number;
    aiLayoutId: string;
    warnings: string[];
    frames: Array<{
      frameId: string;
      role: string;
      position: number;
      aiPhotoId: string;
      aiCropX: number;
      aiCropY: number;
      aiCropScale: number;
      matchTier: string;
      cropQuality: number;
      warnings: string[];
    }>;
  }>;
};

/** Stable identity of an AI draft. Same photos, roles, layouts, and crops. */
export function draftSignature(spreads: PersistableSpread[]) {
  return spreads
    .map(
      (spread) =>
        `${spread.layoutId}:${spread.assignments
          .map((item) => `${item.photoId}:${item.role}:${item.crop.x}:${item.crop.y}:${item.crop.scale}`)
          .join("+")}`,
    )
    .join("|");
}

/** AI columns only. User override columns are left null by the database insert. */
export function buildDraftSavePayload(spreads: PersistableSpread[], warnings: string[] = []): DraftSavePayload {
  return {
    generationVersion: ALBUM_GENERATION_VERSION,
    metadata: {
      ...DRAFT_GENERATION_METADATA,
      signature: draftSignature(spreads),
      warnings,
    },
    spreads: spreads.map((spread, index) => ({
      storySpreadId: spread.storySpreadId,
      position: index,
      storyType: spread.story.storyType,
      recommendedDensity: spread.story.recommendedDensity,
      importance: spread.story.importance,
      coherence: spread.story.coherenceScore,
      aiLayoutId: spread.layoutId,
      warnings: spread.warnings,
      frames: spread.assignments.map((frame, position) => ({
        frameId: frame.frameId,
        role: frame.role,
        position,
        aiPhotoId: frame.photoId,
        aiCropX: frame.crop.x,
        aiCropY: frame.crop.y,
        aiCropScale: frame.crop.scale,
        matchTier: frame.matchTier,
        cropQuality: frame.cropQuality,
        warnings: frame.warnings,
      })),
    })),
  };
}
