/** Task057 — check that Task051–056 still agree at the end of the album. */
export const ALBUM_GENERATION_VERSION = "album-generation-v1";

export const ALBUM_GENERATION_CONFIG = {
  weights: {
    selection: 0.2,
    story: 0.2,
    layout: 0.25,
    crop: 0.25,
    consistency: 0.1,
  },
  grade: {
    good: 85,
    review: 75,
  },
  crop: {
    face: 50,
    head: 45,
    ear: 35,
  },
  story: {
    lowCoherence: 55,
  },
  selection: {
    lowConfidence: 0.55,
  },
  /** Suggest a larger single page when the photo matters and the facing page is blank. */
  largerSingleImportance: 70,
  /** Same layout repeated this many times is a book-level warning. */
  repetitiveLayoutCount: 4,
} as const;
