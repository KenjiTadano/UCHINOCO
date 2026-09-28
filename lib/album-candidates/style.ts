import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";
import type { AlbumFraming, AlbumOrientation, AlbumPlacement } from "./types.ts";

export function describePrimaryStyle(
  analysis: SmartCropPhotoAnalysis | null,
  tags: string[],
): { framing: AlbumFraming; placement: AlbumPlacement; orientation: AlbumOrientation } {
  const orientation: AlbumOrientation =
    analysis?.orientation ?? (tags.includes("portrait") ? "portrait" : "landscape");
  const pet = largestPet(analysis);
  const area = pet ? pet.bbox.width * pet.bbox.height : tags.includes("portrait") ? 0.4 : 0.2;
  const framing: AlbumFraming = area >= 0.28 ? "close-up" : area <= 0.1 ? "wide" : "medium";
  const x = analysis?.focalPoint?.x ?? (pet ? pet.bbox.x + pet.bbox.width / 2 : 0.5);
  const placement: AlbumPlacement = x < 0.38 ? "left" : x > 0.62 ? "right" : "center";
  return { framing, placement, orientation };
}

function largestPet(analysis: SmartCropPhotoAnalysis | null) {
  if (!analysis?.pets.length) return null;
  return analysis.pets.reduce((best, pet) => {
    const area = pet.bbox.width * pet.bbox.height;
    const bestArea = best.bbox.width * best.bbox.height;
    return area > bestArea ? pet : best;
  });
}
