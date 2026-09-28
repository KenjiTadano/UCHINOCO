import type { NormalizedRect } from "./types.ts";

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function clamp01(n: number) {
  return clamp(n, 0, 1);
}

export function isValidRect(r: NormalizedRect): boolean {
  return (
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height) &&
    r.width > 0 &&
    r.height > 0 &&
    r.x >= -0.05 &&
    r.y >= -0.05 &&
    r.x + r.width <= 1.05 &&
    r.y + r.height <= 1.05
  );
}

export function normalizeRect(r: NormalizedRect): NormalizedRect {
  const x = clamp01(r.x);
  const y = clamp01(r.y);
  const right = clamp01(r.x + r.width);
  const bottom = clamp01(r.y + r.height);
  return {
    x,
    y,
    width: Math.max(0.001, right - x),
    height: Math.max(0.001, bottom - y),
  };
}

export function expandRect(
  r: NormalizedRect,
  pad: { top: number; right: number; bottom: number; left: number },
): NormalizedRect {
  return normalizeRect({
    x: r.x - pad.left,
    y: r.y - pad.top,
    width: r.width + pad.left + pad.right,
    height: r.height + pad.top + pad.bottom,
  });
}

export function unionRects(rects: NormalizedRect[]): NormalizedRect | null {
  if (rects.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return normalizeRect({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
}

export function rectCenter(r: NormalizedRect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectArea(r: NormalizedRect) {
  return r.width * r.height;
}

/** Fraction of `inner` area that lies inside `outer`. */
export function rectCoverage(inner: NormalizedRect, outer: NormalizedRect): number {
  const x1 = Math.max(inner.x, outer.x);
  const y1 = Math.max(inner.y, outer.y);
  const x2 = Math.min(inner.x + inner.width, outer.x + outer.width);
  const y2 = Math.min(inner.y + inner.height, outer.y + outer.height);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const area = rectArea(inner);
  if (area <= 0) return 0;
  return clamp01((w * h) / area);
}

/**
 * Visible window in normalized image space for object-fit:cover + scale,
 * with focal at (fx, fy).
 */
export function visibleWindow(
  imageAspect: number,
  frameAspect: number,
  scale: number,
  fx: number,
  fy: number,
): NormalizedRect {
  const s = Math.max(scale, 0.01);
  let viewW: number;
  let viewH: number;
  if (imageAspect > frameAspect) {
    viewH = 1 / s;
    viewW = (frameAspect / imageAspect) / s;
  } else {
    viewW = 1 / s;
    viewH = (imageAspect / frameAspect) / s;
  }
  viewW = Math.min(1, viewW);
  viewH = Math.min(1, viewH);
  const x = clamp(fx - viewW / 2, 0, 1 - viewW);
  const y = clamp(fy - viewH / 2, 0, 1 - viewH);
  return { x, y, width: viewW, height: viewH };
}

/**
 * Point inside unit circle centered at (0.5, 0.5) with radius 0.5,
 * mapped through the visible window → frame UV.
 */
export function fractionInsideCircle(
  rect: NormalizedRect,
  window: NormalizedRect,
  samples = 8,
): number {
  if (rectArea(rect) <= 0 || window.width <= 0 || window.height <= 0) return 0;
  let inside = 0;
  let total = 0;
  for (let iy = 0; iy < samples; iy++) {
    for (let ix = 0; ix < samples; ix++) {
      const px = rect.x + ((ix + 0.5) / samples) * rect.width;
      const py = rect.y + ((iy + 0.5) / samples) * rect.height;
      total++;
      // Map image point → frame UV [0,1]
      const u = (px - window.x) / window.width;
      const v = (py - window.y) / window.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const dx = u - 0.5;
      const dy = v - 0.5;
      if (dx * dx + dy * dy <= 0.25) inside++;
    }
  }
  return total === 0 ? 0 : inside / total;
}

/** Map image point → frame UV. */
export function imagePointToFrameUv(
  px: number,
  py: number,
  window: NormalizedRect,
): { u: number; v: number } {
  return {
    u: (px - window.x) / Math.max(window.width, 1e-6),
    v: (py - window.y) / Math.max(window.height, 1e-6),
  };
}

/**
 * Distance from point (in frame UV) to inscribed circle edge.
 * Positive = inside, 0 = on edge, negative = outside.
 */
export function circleEdgeClearance(u: number, v: number): number {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const r = Math.sqrt(dx * dx + dy * dy);
  return 0.5 - r;
}

/** Occupancy of subject vs visible window (max of width/height ratios). */
export function occupancyRatio(
  subject: NormalizedRect,
  window: NormalizedRect,
): number {
  if (window.width <= 0 || window.height <= 0) return 0;
  return Math.max(
    subject.width / window.width,
    subject.height / window.height,
  );
}

/** Margin of rect inside window (top / left / right / bottom). */
export function edgeMargins(
  inner: NormalizedRect,
  window: NormalizedRect,
): { top: number; left: number; right: number; bottom: number } {
  return {
    top: (inner.y - window.y) / Math.max(window.height, 1e-6),
    left: (inner.x - window.x) / Math.max(window.width, 1e-6),
    right:
      (window.x + window.width - (inner.x + inner.width)) /
      Math.max(window.width, 1e-6),
    bottom:
      (window.y + window.height - (inner.y + inner.height)) /
      Math.max(window.height, 1e-6),
  };
}
