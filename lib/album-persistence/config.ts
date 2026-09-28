import { ALBUM_CANDIDATES_VERSION } from "../album-candidates/config.ts";
import { ALBUM_DRAFT_VERSION } from "../album-draft/config.ts";
import { ALBUM_GENERATION_VERSION } from "../album-generation/config.ts";
import { ALBUM_STORY_VERSION } from "../album-story/config.ts";
import { BEST_SHOT_VERSION } from "../best-shot/config.ts";
import { PHOTO_GROUPING_VERSION } from "../photo-grouping/config.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../photo-intelligence/config.ts";

/** Task058 — keep AI output and later edits in different columns. */
export const ALBUM_PERSISTENCE_LAB_TITLE_PREFIX = "AI Draft Lab";

/** Wait this long after the last edit before writing the override. */
export const AUTOSAVE_DEBOUNCE_MS = 700;

/** Editor session undo stack. Older entries drop off the front. Not stored in the database. */
export const EDITOR_HISTORY_LIMIT = 80;

/** Continuous crop zooms and text keystrokes collapse into one history entry. */
export const EDITOR_HISTORY_COALESCE_MS = AUTOSAVE_DEBOUNCE_MS;

/** Visible decorations on one spread. Hidden rows do not count. */
export const DECORATION_PER_SPREAD = 3;

export const TEXT_LENGTH_LIMIT = { title: 40, caption: 80, date: 24 } as const;

export const DRAFT_GENERATION_METADATA = {
  photo_intelligence_version: PHOTO_INTELLIGENCE_VERSION,
  photo_grouping_version: PHOTO_GROUPING_VERSION,
  best_shot_version: BEST_SHOT_VERSION,
  album_candidates_version: ALBUM_CANDIDATES_VERSION,
  album_story_version: ALBUM_STORY_VERSION,
  album_draft_version: ALBUM_DRAFT_VERSION,
  album_generation_version: ALBUM_GENERATION_VERSION,
} as const;
