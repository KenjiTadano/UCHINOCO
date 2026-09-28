import { sanitizeCropTransform } from "../smart-crop/transform.ts";
import type { PrintCrop } from "./types.ts";

/**
 * Same placement as the editor image:
 * object-fit cover, object-position at the crop point, scale around that point.
 * Returned x/y are the drawn image origin inside the frame, top-left, y downward.
 */
export function coverCropRect(
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number,
  crop: PrintCrop,
) {
  const safe = sanitizeCropTransform(crop);
  const cover = Math.max(frameW / Math.max(imageW, 1), frameH / Math.max(imageH, 1));
  const baseW = imageW * cover;
  const baseH = imageH * cover;
  const originX = safe.x * frameW;
  const originY = safe.y * frameH;
  const left = originX - safe.x * baseW;
  const top = originY - safe.y * baseH;
  return {
    x: originX + (left - originX) * safe.scale,
    y: originY + (top - originY) * safe.scale,
    w: baseW * safe.scale,
    h: baseH * safe.scale,
    crop: safe,
  };
}

/** Source pixels that land inside the frame after the cover crop. */
export function visibleSourcePixels(
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number,
  crop: PrintCrop,
) {
  const drawn = coverCropRect(frameW, frameH, imageW, imageH, crop);
  return {
    width: imageW * (frameW / Math.max(drawn.w, 0.0001)),
    height: imageH * (frameH / Math.max(drawn.h, 0.0001)),
  };
}

export function orientedPixelSize(width: number, height: number, orientation: number) {
  if (orientation >= 5 && orientation <= 8) return { width: height, height: width };
  return { width, height };
}
