import { SMART_LAYOUT_CONFIG } from "./config.ts";
import type { LayoutAssignment, LayoutPhotoInput } from "./types.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/**
 * Page-level balance: hierarchy, avoid all-huge faces, protect multi-pet.
 */
export function scoreLayoutBalance(
  photos: LayoutPhotoInput[],
  assignments: LayoutAssignment[],
): number {
  if (assignments.length === 0) return 0;
  let score = 72;

  // Hero should be the strongest quality among slots
  const hero = assignments.find(
    (a) => a.slotRole === "hero" || a.importance >= 0.95,
  );
  if (hero) {
    const others = assignments.filter((a) => a.photoId !== hero.photoId);
    const heroQ = hero.quality.overall;
    const maxOther = others.reduce((m, a) => Math.max(m, a.quality.overall), 0);
    if (heroQ >= maxOther - 5) score += 12;
    else score -= 14;
  }

  // Subject scale not uniformly huge
  const scales = assignments.map((a) => a.quality.subjectScale);
  const avgScale = scales.reduce((s, n) => s + n, 0) / scales.length;
  if (avgScale > SMART_LAYOUT_CONFIG.balance.maxAvgSubjectScale) score -= 10;
  if (avgScale < 35) score -= 6;

  // Don't put multi-pet into tiny frames
  for (const a of assignments) {
    const photo = photos.find((p) => p.photoId === a.photoId);
    if (!photo) continue;
    if (
      photo.analysis.pets.length > 1 &&
      a.importance < SMART_LAYOUT_CONFIG.balance.multiPetMinImportance
    ) {
      score -= 16;
    }
  }

  // Full-body into tiny circle/detail
  for (const a of assignments) {
    if (a.slotRole !== "detail" && a.cropShapeId !== "circle") continue;
    const photo = photos.find((p) => p.photoId === a.photoId);
    const face = photo?.analysis.pets[0]?.face;
    const body = photo?.analysis.pets[0]?.bbox;
    if (face && body) {
      const ratio = (face.width * face.height) / Math.max(body.width * body.height, 0.001);
      if (ratio < 0.22) score -= 12;
    }
  }

  // Spread of match tiers — all strict is healthier
  const fallbacks = assignments.filter((a) => a.frameMatch.matchTier === "fallback").length;
  if (fallbacks === 0) score += 6;
  else score -= fallbacks * 4;

  return clampScore(score);
}
