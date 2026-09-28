/** Task052 — scene grouping. Precision over recall: when unsure, split. */
export const PHOTO_GROUPING_VERSION = "photo-grouping-v1";

export const PHOTO_GROUPING_CONFIG = {
  weights: {
    time: 0.2,
    visual: 0.35,
    geometry: 0.15,
    semantic: 0.2,
    background: 0.1,
  },
  /** Pair overall at or above this may join a group. */
  join: 80,
  /**
   * 70–79 can join only when time, visual, and tags all agree.
   * Otherwise the photos stay apart and the boundary is marked ambiguous.
   */
  probable: 70,
  probableMinVisual: 78,
  probableMinSemantic: 70,
  probableMinTime: 60,
  /**
   * Full-frame hash drops when the pet moves.
   * A probable pair can still join if the room color and tags agree
   * and the shots are within about two minutes.
   */
  movedMinVisual: 62,
  movedMinBackground: 78,
  movedMinSemantic: 70,
  movedMinTime: 86,
  /** Every member must still clear this bar. Stops A≈B≈C chains when A≠C. */
  minMember: 64,
  ambiguousLow: 55,
  /** Same calendar day in Asia/Tokyo, but too far apart to be one scene. */
  maxGapMs: 2 * 60 * 60 * 1000,
  burstMaxGapMs: 15_000,
  burstMinVisual: 75,
} as const;
