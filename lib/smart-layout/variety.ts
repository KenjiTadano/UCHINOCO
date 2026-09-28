import type { LayoutAssignment, LayoutPhotoInput } from "./types.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/**
 * Light visual variety — mix of orientations / subject tightness.
 * Soft weight; never force artificial mix.
 */
export function scoreVisualVariety(
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
): number {
  if (assignments.length <= 1) return 70;

  const orients = new Set<string>();
  const tightness: number[] = [];

  for (const a of assignments) {
    const photo = photos.find((p) => p.photoId === a.photoId);
    if (!photo) continue;
    orients.add(photo.analysis.orientation);
    const face = photo.analysis.pets[0]?.face;
    const body = photo.analysis.pets[0]?.bbox;
    if (face && body) {
      tightness.push(
        (face.width * face.height) / Math.max(body.width * body.height, 0.001),
      );
    }
  }

  let score = 55;
  score += Math.min(30, (orients.size - 1) * 15);

  if (tightness.length >= 2) {
    const minT = Math.min(...tightness);
    const maxT = Math.max(...tightness);
    if (maxT - minT > 0.2) score += 18;
    else if (maxT - minT > 0.1) score += 8;
  }

  // Mild boost when crop shapes differ
  const shapes = new Set(assignments.map((a) => a.cropShapeId));
  score += Math.min(12, (shapes.size - 1) * 6);

  return clampScore(score);
}
