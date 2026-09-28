/**
 * Task048.1 — Tunable Smart Crop constants (keep magic numbers here).
 */

export const SMART_CROP_CONFIG = {
  /** Expand face → headSafeArea (fraction of face size). */
  headExpansion: {
    top: 0.35,
    left: 0.15,
    right: 0.15,
    bottom: 0.1,
  },

  /** Top fraction of headSafeArea treated as ear band. */
  earBandHeightRatio: 0.4,

  /** Padding around combined subject / bodies. */
  subjectPad: 0.06,

  /** Absolute max zoom relative to cover. */
  maxScale: 2.5,

  /** Candidate search grid. */
  candidateZooms: [1.0, 1.05, 1.1, 1.15, 1.2, 1.25] as const,
  candidateOffsets: [-0.05, 0, 0.05] as const,

  /** Margin (normalized window UV) for ear/top safety. */
  earMargin: {
    good: 0.06,
    ok: 0.035,
    tight: 0.015,
  },

  /** Hard reject thresholds. */
  hardReject: {
    faceSafety: 85,
    headSafety: 75,
    maskSafetyCircle: 75,
    multiSubjectCoverage: 70,
  },

  /** Default overall weights (non-circle). */
  weights: {
    faceSafety: 0.2,
    headSafety: 0.2,
    earSafety: 0.1,
    bodySafety: 0.1,
    subjectScale: 0.15,
    maskSafety: 0.1,
    cropAmount: 0.05,
    composition: 0.1,
  },

  /** Circle: stronger maskSafety. */
  weightsCircle: {
    faceSafety: 0.18,
    headSafety: 0.18,
    earSafety: 0.12,
    bodySafety: 0.08,
    subjectScale: 0.12,
    maskSafety: 0.18,
    cropAmount: 0.04,
    composition: 0.1,
  },

  /** Multi-pet blend when scoring per-pet safety. */
  multiPet: {
    primaryWeight: 0.6,
    secondaryWeight: 0.4,
  },

  /** Ideal cover zoom band for cropAmount (legacy-ish). */
  idealScaleMin: 1.0,
  idealScaleMax: 1.2,

  /** Task049 — Photo × Frame Matching weights / bonuses. */
  frameMatch: {
    weights: {
      aspect: 0.2,
      cropQuality: 0.3,
      subjectFit: 0.2,
      maskFit: 0.15,
      compositionFit: 0.15,
    },
    /** Soft bonus for wide frames when multi-pet AND crop quality is good. */
    multiplePetBonus: {
      landscape: 8,
      square: 2,
      portrait: 0,
      circle: -4,
      minCropOverall: 70,
    },
    /** Circle must clear this maskSafety to stay in STRICT ranking. */
    circleMaskMin: 75,
    /** Aspect compatibility: soft curve (not a hard winner). */
    aspectSoftness: 0.55,

    /** Task049.1 — Fallback / Unusable thresholds. */
    fallback: {
      weights: {
        faceSafety: 0.25,
        headSafety: 0.25,
        subjectCoverage: 0.15,
        bodySafety: 0.1,
        maskSafety: 0.1,
        subjectScale: 0.05,
        composition: 0.05,
        aspect: 0.05,
      },
      /** Below this → UNUSABLE (not fallback). */
      unusableFaceSafety: 60,
      unusableSubjectCoverage: 25,
      unusableCircleMaskSafety: 35,
      unusableCircleFaceSafety: 50,
    },
  },
} as const;

export type SmartCropWeights = typeof SMART_CROP_CONFIG.weights;

/** @deprecated use SMART_CROP_CONFIG.weights */
export const SMART_CROP_WEIGHTS = SMART_CROP_CONFIG.weights;

/** @deprecated */
export const FACE_EAR_PAD_TOP = SMART_CROP_CONFIG.headExpansion.top;
/** @deprecated */
export const FACE_EAR_PAD_SIDE = SMART_CROP_CONFIG.headExpansion.left;
/** @deprecated */
export const FACE_EAR_PAD_BOTTOM = SMART_CROP_CONFIG.headExpansion.bottom;
/** @deprecated */
export const SUBJECT_PAD = SMART_CROP_CONFIG.subjectPad;
/** @deprecated */
export const MAX_SCALE = SMART_CROP_CONFIG.maxScale;
/** @deprecated */
export const CONTAIN_SCALE_FACTOR = 0.88;
/** @deprecated */
export const IDEAL_SCALE_MIN = SMART_CROP_CONFIG.idealScaleMin;
/** @deprecated */
export const IDEAL_SCALE_MAX = SMART_CROP_CONFIG.idealScaleMax;
