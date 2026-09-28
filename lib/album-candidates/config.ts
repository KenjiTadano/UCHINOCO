/** Task054 — choose scenes for an album, not a pure score ranking. */
export const ALBUM_CANDIDATES_VERSION = "album-candidates-v1";

export const ALBUM_CANDIDATES_CONFIG = {
  sceneWeights: {
    bestShot: 0.35,
    memoryValue: 0.2,
    expression: 0.15,
    petVisibility: 0.1,
    sceneConfidence: 0.05,
    relativeUniqueness: 0.05,
    sceneRepresentativeness: 0.1,
  },
  /** Monthly defaults. A small library is scaled down in resolveAlbumBudget. */
  budget: {
    minPhotos: 12,
    targetPhotos: 24,
    maxPhotos: 36,
    minScenes: 8,
    targetScenes: 12,
    maxScenes: 14,
  },
  /** Secondaries stay a minority of the album. */
  secondaryPhotoRatio: 0.25,
  sameDayFree: 2,
  eventDayFree: 4,
  /** Indexed by how many of that day are already selected. */
  sameDayPenalty: [0, 0, 4, 8, 8],
  activityRepeatPenalty: [0, 4, 8, 8],
  sceneRepeatPenalty: [0, 3, 6, 8],
  /** Indexed by how many of that framing are already selected. */
  visualRepeatPenalty: [0, 0, 4, 8],
  newActivityBonus: 3,
  newSceneBonus: 2,
  newFramingBonus: 2,
  emptyPeriodBonus: 3,
  timeBonusMinSceneScore: 70,
  /** Diversity penalties stop here, so a clearly better scene still wins. */
  maxDiversityPenalty: 8,
  eventTags: ["birthday", "travel", "anniversary", "special_event"],
  eventBonus: 4,
  ambiguousPenalty: 3,
  lowSelectionConfidence: 0.7,
  lowSelectionConfidenceScale: 8,
  /** Above the close-score band. 92 would freeze 93–95 and diversity could not reorder them. */
  mustKeepSceneScore: 96,
  mustKeepMemory: 95,
  /** Below this, do not add a scene just to fill a quota. */
  minSceneScore: 58,
} as const;

export function albumCandidateFingerprint() {
  return JSON.stringify({
    version: ALBUM_CANDIDATES_VERSION,
    sceneWeights: ALBUM_CANDIDATES_CONFIG.sceneWeights,
    budget: ALBUM_CANDIDATES_CONFIG.budget,
    secondaryPhotoRatio: ALBUM_CANDIDATES_CONFIG.secondaryPhotoRatio,
    sameDayFree: ALBUM_CANDIDATES_CONFIG.sameDayFree,
    eventDayFree: ALBUM_CANDIDATES_CONFIG.eventDayFree,
    sameDayPenalty: ALBUM_CANDIDATES_CONFIG.sameDayPenalty,
    activityRepeatPenalty: ALBUM_CANDIDATES_CONFIG.activityRepeatPenalty,
    sceneRepeatPenalty: ALBUM_CANDIDATES_CONFIG.sceneRepeatPenalty,
    visualRepeatPenalty: ALBUM_CANDIDATES_CONFIG.visualRepeatPenalty,
    bonuses: {
      activity: ALBUM_CANDIDATES_CONFIG.newActivityBonus,
      scene: ALBUM_CANDIDATES_CONFIG.newSceneBonus,
      framing: ALBUM_CANDIDATES_CONFIG.newFramingBonus,
      period: ALBUM_CANDIDATES_CONFIG.emptyPeriodBonus,
      event: ALBUM_CANDIDATES_CONFIG.eventBonus,
    },
    maxDiversityPenalty: ALBUM_CANDIDATES_CONFIG.maxDiversityPenalty,
    mustKeepSceneScore: ALBUM_CANDIDATES_CONFIG.mustKeepSceneScore,
    mustKeepMemory: ALBUM_CANDIDATES_CONFIG.mustKeepMemory,
    minSceneScore: ALBUM_CANDIDATES_CONFIG.minSceneScore,
    selectionRevision: 3,
  });
}
