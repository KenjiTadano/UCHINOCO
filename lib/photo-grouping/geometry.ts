import type { NormalizedRect, SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

function area(rect: NormalizedRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function center(rect: NormalizedRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function largest(rects: NormalizedRect[]) {
  return rects.reduce<NormalizedRect | null>((best, rect) => {
    if (!best || area(rect) > area(best)) return rect;
    return best;
  }, null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Same pet, similar place in the frame, similar size.
 * A missing analysis stays neutral so it cannot force a merge.
 */
export function scoreGeometrySimilarity(
  a: SmartCropPhotoAnalysis | null,
  b: SmartCropPhotoAnalysis | null,
): number {
  if (!a || !b) return 50;
  if (a.pets.length === 0 && b.pets.length === 0) return 60;
  if (a.pets.length === 0 || b.pets.length === 0) return 35;

  let score = 70;
  const countGap = Math.abs(a.pets.length - b.pets.length);
  score -= countGap * 18;

  const bodyA = largest(a.pets.map((pet) => pet.bbox));
  const bodyB = largest(b.pets.map((pet) => pet.bbox));
  if (bodyA && bodyB) {
    const centerGap = dist(center(bodyA), center(bodyB));
    score -= Math.min(28, centerGap * 70);
    const sizeA = area(bodyA);
    const sizeB = area(bodyB);
    const ratio = Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB, 0.001);
    score -= (1 - ratio) * 22;
  }

  const faceA = largest(
    a.pets.flatMap((pet) => (pet.face ? [pet.face] : [])),
  );
  const faceB = largest(
    b.pets.flatMap((pet) => (pet.face ? [pet.face] : [])),
  );
  if (faceA && faceB) {
    score -= Math.min(16, dist(center(faceA), center(faceB)) * 40);
  } else if (Boolean(faceA) !== Boolean(faceB)) {
    score -= 8;
  }

  const focalGap = dist(a.focalPoint, b.focalPoint);
  score -= Math.min(12, focalGap * 30);
  return Math.round(Math.min(100, Math.max(0, score)));
}
