import { getSmartCropFrame, SMART_CROP_FRAMES } from "../smart-crop/frames.ts";
import type { SmartCropFrame } from "../smart-crop/types.ts";
import type { AlbumFrameDefinition, CropShapeId } from "./types.ts";

export function resolveCropFrame(shapeId: CropShapeId): SmartCropFrame {
  const found = getSmartCropFrame(shapeId);
  if (found) return found;
  // Fallback to square if unknown
  return SMART_CROP_FRAMES.find((f) => f.id === "square") ?? SMART_CROP_FRAMES[0];
}

export function frameLabel(frame: AlbumFrameDefinition): string {
  return `${frame.slotRole}:${frame.cropShapeId}`;
}
