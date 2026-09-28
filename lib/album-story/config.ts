/** Task055 — group selected scenes into spreads. Layout comes later. */
export const ALBUM_STORY_VERSION = "album-story-v1";

export const ALBUM_STORY_CONFIG = {
  photos: {
    min: 1,
    targetMin: 2,
    targetMax: 4,
    max: 6,
  },
  weights: {
    time: 0.3,
    semantic: 0.3,
    sameDay: 0.15,
    event: 0.15,
    visual: 0.1,
  },
  /** >= strong merges. Candidate merges only for the same short session. Below that, separate. */
  merge: {
    strong: 80,
    candidate: 70,
    ambiguous: 55,
  },
  sameSessionMaxMinutes: 30,
  eventTags: ["birthday", "travel", "anniversary", "special_event"],
  /** Different actions that still belong to one outing. */
  relatedActivities: [
    ["playing", "walking"],
    ["walking", "playing"],
  ],
  /** Different memories. Same day is not enough to combine them. */
  incompatibleActivities: [
    ["eating", "sleeping"],
    ["eating", "playing"],
    ["eating", "walking"],
    ["sleeping", "playing"],
    ["sleeping", "walking"],
    ["sleeping", "eating"],
    ["playing", "eating"],
    ["playing", "sleeping"],
    ["walking", "eating"],
    ["walking", "sleeping"],
  ],
  heroSceneScore: 92,
  heroMemory: 95,
  heroImportance: 90,
} as const;

export function albumStoryFingerprint() {
  return JSON.stringify({
    version: ALBUM_STORY_VERSION,
    photos: ALBUM_STORY_CONFIG.photos,
    weights: ALBUM_STORY_CONFIG.weights,
    merge: ALBUM_STORY_CONFIG.merge,
    sameSessionMaxMinutes: ALBUM_STORY_CONFIG.sameSessionMaxMinutes,
    eventTags: ALBUM_STORY_CONFIG.eventTags,
    relatedActivities: ALBUM_STORY_CONFIG.relatedActivities,
    incompatibleActivities: ALBUM_STORY_CONFIG.incompatibleActivities,
    heroSceneScore: ALBUM_STORY_CONFIG.heroSceneScore,
    heroMemory: ALBUM_STORY_CONFIG.heroMemory,
    heroImportance: ALBUM_STORY_CONFIG.heroImportance,
  });
}
