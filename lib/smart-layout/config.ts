/**
 * Task050 / 050.1 — Layout selection weights / thresholds.
 */
export const SMART_LAYOUT_CONFIG = {
  /**
   * Base overall weights (sum ≈ 1).
   * orientationAffinity + hierarchyFit are soft (≤10% each).
   */
  assignmentWeights: {
    frameMatch: 0.4,
    roleFit: 0.18,
    layoutBalance: 0.12,
    visualVariety: 0.08,
    cropQuality: 0.1,
    orientationAffinity: 0.07,
    hierarchyFit: 0.05,
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
    maxAvgSubjectScale: 75,
    multiPetMinImportance: 0.55,
  },

  variety: {
    weightCap: 100,
  },

  hierarchy: {
    /** Dispersion above this → treat as clear best photo. */
    clearBestGap: 10,
    /** Weak photo vs best gap for secondary placement preference. */
    weakGap: 8,
  },
} as const;
