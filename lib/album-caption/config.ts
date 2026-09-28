/** Bump when the caption prompt, schema, or meaning changes. */
export const ALBUM_CAPTION_VERSION = "album-caption-v1";

/** Japanese title length for a suggestion. The text column allows a little more. */
export const CAPTION_TITLE_MAX = 24;

/** Japanese caption length for a suggestion. */
export const CAPTION_CAPTION_MAX = 60;

/** Below this, a spread does not receive generated lines. */
export const CAPTION_MIN_CONFIDENCE = 0.45;

/** Emotion words require an explicit expression at this confidence. */
export const CAPTION_EXPRESSION_CONFIDENCE = 0.72;

export const CAPTION_EXPRESSION_SCORE = 70;
