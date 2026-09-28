import type { LayoutAssignment, LayoutPhotoInput } from "./types.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/**
 * Hero/primary should get strong crops; detail prefers face-up / compact subjects.
 */
export function scoreRoleFit(
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
): number {
  if (assignments.length === 0) return 0;
  let weighted = 0;
  let weightSum = 0;

  for (const a of assignments) {
    const photo = photos.find((p) => p.photoId === a.photoId);
    const q = a.quality;
    const match = a.frameMatch;
    let score = q.overall * 0.45 + match.matchScore * 0.25 + q.composition * 0.15;

    if (a.slotRole === "hero" || a.slotRole === "primary") {
      score += q.subjectCoverage * 0.1 + q.faceSafety * 0.05;
      if (q.overall >= 80) score += 8;
      if (match.matchTier === "strict") score += 6;
      if (match.matchTier === "fallback") score -= 10;
    } else if (a.slotRole === "detail") {
      // Prefer tighter faces for detail/circle
      const face = photo?.analysis.pets[0]?.face;
      const body = photo?.analysis.pets[0]?.bbox;
      if (face && body) {
        const faceArea = face.width * face.height;
        const bodyArea = Math.max(body.width * body.height, 0.001);
        const ratio = faceArea / bodyArea;
        if (ratio >= 0.35) score += 12;
        else if (ratio < 0.2) score -= 12;
      }
      if (a.cropShapeId === "circle" && match.matchTier === "unusable") score -= 30;
    } else {
      // secondary
      if (q.overall >= 70) score += 4;
      if (photo && photo.analysis.pets.length > 1 && a.importance < 0.55) {
        score -= 10;
      }
    }

    const w = Math.max(a.importance, 0.3);
    weighted += clampScore(score) * w;
    weightSum += w;
  }

  return clampScore(weighted / Math.max(weightSum, 0.01));
}
