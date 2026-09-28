/**
 * Task050 — Layout selection weights / thresholds.
 */
export const SMART_LAYOUT_CONFIG = {
  assignmentWeights: {
    frameMatch: 0.45,
    roleFit: 0.2,
    layoutBalance: 0.15,
    visualVariety: 0.1,
    cropQuality: 0.1,
  },

  /** Prefer all-STRICT layouts; soft penalty when any FALLBACK. */
  tier: {
    allStrictBonus: 6,
    anyFallbackPenalty: 8,
  },

  roleFit: {
    heroMinQuality: 70,
    detailPreferFaceUp: true,
  },

  balance: {
    /** Penalize if every slot has huge subjectScale. */
    maxAvgSubjectScale: 75,
    /** Multi-pet in tiny (importance < 0.5) frames. */
    multiPetMinImportance: 0.55,
  },

  variety: {
    /** Soft — don't force variety. */
    weightCap: 100,
  },

  /**
   * Soft layout affinity (never a hard winner).
   * Applied after base overall — small deltas only.
   */
  affinity: {
    /** 2-up: when both photos share orientation, prefer L02/L03 over L10. */
    pairedOrientationBonus: 4,
    squarePairPenaltyWhenOriented: 2,
    /** 3-up: when one photo clearly leads quality, nudge hero layouts. */
    heroHierarchyGap: 8,
    heroHierarchyBonus: 3,
  },
} as const;
