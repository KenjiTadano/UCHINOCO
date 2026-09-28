/**
 * Task051 — keeper-score weights.
 * Technical quality is a minority so a rough-but-great moment can outrank a clean ordinary portrait.
 */
export const PHOTO_INTELLIGENCE_VERSION = "photo-intelligence-v1";

export const PHOTO_INTELLIGENCE_CONFIG = {
  weights: {
    technicalQuality: 0.15,
    petVisibility: 0.2,
    expression: 0.2,
    composition: 0.15,
    uniqueness: 0.1,
    memoryValue: 0.2,
  },
  /**
   * Soft penalty only when technical quality is very low.
   * If expression and memory are both excellent, the penalty is capped
   * so the moment is not buried under sharpness.
   */
  technicalPenalty: {
    below: 40,
    max: 6,
    momentCap: 3,
  },
  fallback: {
    expression: 58,
    uniqueness: 45,
    memoryValue: 52,
    memoryValueNoPet: 28,
    confidence: 0.4,
  },
} as const;
