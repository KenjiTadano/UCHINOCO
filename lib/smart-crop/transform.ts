/**
 * Sanitize cover-crop transform; invalid → center crop.
 */
import type { SmartCropTransform } from "./types.ts";

function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeCropTransform(
  transform: SmartCropTransform | null | undefined,
): SmartCropTransform {
  if (!transform) return { x: 0.5, y: 0.5, scale: 1 };
  const x = Math.min(1, Math.max(0, finiteOr(transform.x, 0.5)));
  const y = Math.min(1, Math.max(0, finiteOr(transform.y, 0.5)));
  let scale = finiteOr(transform.scale, 1);
  if (scale < 1) scale = 1;
  if (scale > 4) scale = 4;
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    scale: Number(scale.toFixed(4)),
  };
}
