/** Task053 — pick a scene representative, not the highest keeper score. */
export const BEST_SHOT_VERSION = "best-shot-v1";

export const BEST_SHOT_CONFIG = {
  weights: {
    photoIntelligence: 0.2,
    expression: 0.2,
    petVisibility: 0.15,
    technical: 0.1,
    composition: 0.1,
    memoryValue: 0.1,
    relativeUniqueness: 0.1,
    sceneRepresentativeness: 0.05,
  },
  /** Nudge within a burst. Capped so focus cannot overturn a clear expression lead. */
  sharpnessLiftPerPoint: 0.08,
  sharpnessLiftCap: 4,
  /** A rare frame with weak quality does not become the representative. */
  uniquenessGuard: 70,
  uniquenessGuardQuality: 55,
  uniquenessGuardCap: 35,
  penalties: {
    lowVisibility: 50,
    lowVisibilityAmount: 18,
    lowTechnical: 40,
    lowTechnicalAmount: 18,
    lowConfidence: 0.5,
    lowConfidenceAmount: 12,
    visionFailedAmount: 15,
    lowQualityAmount: 20,
  },
  duplication: {
    strongSimilarity: 90,
    strongPenalty: 28,
    softSimilarity: 85,
    softPenalty: 16,
    mildSimilarity: 75,
    mildPenalty: 6,
  },
  secondary: {
    /** Two photos can keep a second frame when they show the scene differently. */
    minGroupSize: 2,
    minScore: 75,
    /** Above this, the pair is too alike to keep both. */
    maxSimilarity: 80,
    minMemory: 60,
    minAxisGap: 8,
    /** Pet placement above this is too close to keep as a second photo, unless expression or composition differs. */
    maxGeometry: 54,
  },
  /** groupConfidence 0.72 → selection confidence at most 0.85. */
  confidenceHeadroom: 0.13,
} as const;

export function bestShotConfigFingerprint() {
  return JSON.stringify({
    weights: BEST_SHOT_CONFIG.weights,
    sharpnessLiftCap: BEST_SHOT_CONFIG.sharpnessLiftCap,
    secondary: BEST_SHOT_CONFIG.secondary,
    version: BEST_SHOT_VERSION,
  });
}
