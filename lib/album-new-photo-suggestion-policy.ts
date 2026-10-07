import { createHash } from "node:crypto";

export function newPhotoSuggestionFingerprint(albumId: string, draftVersionId: string, photoIds: string[]) {
  return createHash("sha256").update([albumId, draftVersionId, ...[...photoIds].sort()].join("|")).digest("hex");
}

export function detectNewPhotoIds(generationPhotoIds: string[], currentPeriodPhotoIds: string[], albumPhotoIds: string[]) {
  const generated = new Set(generationPhotoIds);
  const added = new Set(albumPhotoIds);
  return [...new Set(currentPeriodPhotoIds)].filter((id) => !generated.has(id) && !added.has(id)).sort();
}

export function suggestionIsProtected(input: { albumStatus: string; draftStatus: string; accepted: boolean; ordered: boolean }) {
  return input.albumStatus !== "draft" || input.draftStatus === "locked" || input.accepted || input.ordered;
}

export function photoIsInPetScope(photoPetId: string, albumPetIds: string[]) {
  return albumPetIds.includes(photoPetId);
}
