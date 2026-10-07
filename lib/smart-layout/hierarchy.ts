/**
 * Task050.1 — Hierarchy need / fit + weak-photo / equal-layout handling.
 * No unconditional layout-id bonuses.
 */
import type { AlbumLayoutDefinition, LayoutAssignment, LayoutPhotoInput } from "./types.ts";
import type { QualityProfile } from "./photo-set.ts";

export type HeroSelectionProfile = {
  bestPhotoId: string | undefined;
  confidence: number;
  hasSignals: boolean;
};

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function importanceSpread(layout: AlbumLayoutDefinition): number {
  const imps = layout.frames.map((f) => f.importance);
  return Math.max(...imps) - Math.min(...imps);
}

function isEqualishLayout(layout: AlbumLayoutDefinition): boolean {
  const spread = importanceSpread(layout);
  const heroWeight = layout.balanceProfile?.heroWeight ?? 0.5;
  const symmetry = layout.balanceProfile?.symmetry ?? 0.5;
  return spread < 0.2 && heroWeight < 0.55 && symmetry >= 0.7;
}

function hasHeroSlot(layout: AlbumLayoutDefinition): boolean {
  return layout.frames.some((f) => f.slotRole === "hero" || f.importance >= 0.95);
}

/**
 * How well this assignment + layout structure matches hierarchy need.
 */
export function scoreHierarchyFit(photos: LayoutPhotoInput[], layout: AlbumLayoutDefinition, assignments: LayoutAssignment[], quality: QualityProfile, heroProfile?: HeroSelectionProfile): number {
  if (photos.length < 2 || assignments.length === 0) return 65;

  const need = quality.hierarchyNeed;
  const equalish = isEqualishLayout(layout);
  const heroish = hasHeroSlot(layout);
  const spread = importanceSpread(layout);

  let score = 55;

  // --- Equal layouts ---
  if (equalish) {
    if (need <= 30) {
      // Similar qualities → equal is natural
      score = 82 + (30 - need) * 0.3;
    } else if (need <= 45) {
      score = 70 - (need - 30) * 0.8;
    } else {
      // Large quality gap → equal gets penalty (still soft)
      score = 52 - (need - 45) * 0.45;
    }
    return clampScore(score);
  }

  // --- Hero / hierarchical layouts ---
  if (heroish || spread >= 0.25) {
    if (need >= 55) {
      score = 72 + (need - 55) * 0.45;
    } else if (need >= 40) {
      score = 64 + (need - 40) * 0.55;
    } else if (need <= 25) {
      // Flat qualities don't need strong hierarchy
      score = 56 - (25 - need) * 0.3;
    } else {
      score = 58 + (need - 25) * 0.4;
    }

    // Conditional hero bonus — only when conditions hold
    const heroAssign = assignments.find((a) => a.slotRole === "hero" || a.importance >= 0.95);
    if (heroAssign && (need >= 40 || heroProfile?.hasSignals)) {
      const bestId = heroProfile?.hasSignals ? heroProfile.bestPhotoId : photos[quality.bestIndex]?.photoId;
      const weakId = photos[quality.weakIndex]?.photoId;
      const heroIsBest = heroAssign.photoId === bestId;
      const heroIsWeak = heroAssign.photoId === weakId;
      const heroStrict = heroAssign.frameMatch.matchTier === "strict";
      const heroStrong = heroAssign.quality.overall >= 80;

      if (heroIsBest && heroStrict && heroStrong) {
        const secondariesOk = assignments.filter((a) => a.photoId !== heroAssign.photoId).every((a) => a.frameMatch.matchTier !== "unusable" && a.importance <= heroAssign.importance);
        if (secondariesOk) {
          const confidenceScale = heroProfile?.hasSignals ? heroProfile.confidence : 1;
          score += Math.round(14 * confidenceScale);
        }
      }
      if (heroIsWeak) score -= 22;
      if (!heroStrict && heroIsBest) score -= 4;
    }

    return clampScore(score);
  }

  // Mid layouts — mild preference toward matching need
  return clampScore(58 + (need - 50) * 0.18);
}

/**
 * Penalty when the weakest photo sits in the largest slot.
 */
export function weakPhotoHeroPenalty(photos: LayoutPhotoInput[], assignments: LayoutAssignment[], quality: QualityProfile): number {
  if (photos.length < 2 || quality.dispersion < 8) return 0;
  const weakId = photos[quality.weakIndex]?.photoId;
  if (!weakId) return 0;
  const weakSlot = assignments.find((a) => a.photoId === weakId);
  if (!weakSlot) return 0;
  if (weakSlot.slotRole === "hero" || weakSlot.importance >= 0.9) {
    return -18;
  }
  if (weakSlot.importance >= 0.75 && quality.dispersion >= 14) {
    return -8;
  }
  // Reward putting weak photo in secondary/detail
  if (weakSlot.slotRole === "secondary" || weakSlot.slotRole === "detail") {
    return 4;
  }
  return 0;
}
