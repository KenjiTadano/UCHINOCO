import type { AlbumCandidatePeriod } from "../album-candidates/types.ts";

export type GenerationSignatureInput = {
  period: AlbumCandidatePeriod;
  groupIds: string[];
  selectedSceneIds: string[];
  selectedPhotoIds: string[];
  roles: { groupId: string; primaryPhotoId: string; secondaryPhotoId: string | null }[];
  storySpreadIds: string[];
  layoutIds: string[];
  frames: {
    storySpreadId: string;
    layoutId: string;
    frameId: string;
    photoId: string;
    role: string;
    crop: { x: number; y: number; scale: number };
  }[];
};

/** Comparable snapshot of one generation. Same analysis inputs should reprint this. */
export function generationSignature(input: GenerationSignatureInput): string {
  return JSON.stringify({
    period: { type: input.period.type, start: input.period.start, end: input.period.end },
    groupIds: input.groupIds,
    selectedSceneIds: input.selectedSceneIds,
    selectedPhotoIds: input.selectedPhotoIds,
    roles: input.roles,
    storySpreadIds: input.storySpreadIds,
    layoutIds: input.layoutIds,
    frames: input.frames,
  });
}
