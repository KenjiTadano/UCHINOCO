export type AlbumFraming = "close-up" | "medium" | "wide";
export type AlbumPlacement = "left" | "center" | "right";
export type AlbumOrientation = "portrait" | "landscape" | "square";

export type AlbumScenePrimary = {
  photoId: string;
  bestShot: number;
  memoryValue: number;
  expression: number;
  petVisibility: number;
  relativeUniqueness: number;
  sceneRepresentativeness: number;
  composition: number;
  framing: AlbumFraming;
  placement: AlbumPlacement;
  orientation: AlbumOrientation;
};

export type AlbumSceneSecondary = {
  photoId: string;
  bestShot: number;
  memoryValue: number;
  /** Visual similarity to the primary, 0–100. */
  visualSimilarityToPrimary: number;
};

/** One scene group, already reduced to a best-shot pair. */
export type AlbumSceneInput = {
  groupId: string;
  startedAt: string;
  endedAt: string;
  scene?: string;
  activity?: string;
  tags: string[];
  groupConfidence: number;
  warnings: string[];
  selectionConfidence: number;
  memberCount: number;
  primary: AlbumScenePrimary;
  secondary?: AlbumSceneSecondary;
};

export type AlbumBudget = {
  minPhotos: number;
  targetPhotos: number;
  maxPhotos: number;
  minScenes: number;
  targetScenes: number;
  maxScenes: number;
};

export type AlbumCandidateScene = {
  groupId: string;
  primaryPhotoId: string;
  secondaryPhotoId?: string;
  sceneScore: number;
  effectiveScore: number;
  importance: number;
  mustKeep: boolean;
  diversity: {
    time: number;
    scene: number;
    activity: number;
    visual: number;
    composition: number;
  };
  selected: boolean;
  selectionReason: string[];
  warnings: string[];
  tags: string[];
  startedAt: string;
  activity?: string;
  scene?: string;
};

export type AlbumPeriodType = "monthly" | "seasonal" | "yearly" | "event" | "custom";

export type AlbumCandidatePeriod = {
  start: string;
  end: string;
  type: AlbumPeriodType;
};

export type AlbumPeriodInput = {
  type: AlbumPeriodType;
  year?: number;
  month?: number;
  start?: string;
  end?: string;
};

export type AlbumDominantShare = {
  key: string;
  /** 0–1 share of the selected scenes. */
  ratio: number;
  count: number;
};

export type AlbumCandidateResult = {
  period: AlbumCandidatePeriod;
  selectedScenes: AlbumCandidateScene[];
  rejectedScenes: AlbumCandidateScene[];
  selectedPhotoIds: string[];
  stats: {
    /** Photos in the whole library, including other months. */
    availablePhotoCount: number;
    /** Photos whose capture time falls inside the album period. */
    periodPhotoCount: number;
    /** Candidate source. Same count as periodPhotoCount. */
    sourcePhotoCount: number;
    sceneCount: number;
    selectedSceneCount: number;
    selectedPhotoCount: number;
    primaryCount: number;
    secondaryCount: number;
  };
  balance: {
    timeCoverage: number;
    sceneDiversity: number;
    activityDiversity: number;
    visualDiversity: number;
    overall: number;
    dominant: {
      activity: AlbumDominantShare | null;
      scene: AlbumDominantShare | null;
      visual: AlbumDominantShare | null;
      day: AlbumDominantShare | null;
    };
  };
  analysisVersion: string;
};

export type AlbumCandidateRequest = {
  scenes: AlbumSceneInput[];
  /** Whole library size. Defaults to the period photo count. */
  availablePhotoCount?: number;
  sourcePhotoCount?: number;
  /** Photos already known to be inside the period. Defaults to the sum of in-period member counts. */
  periodPhotoCount?: number;
  period: AlbumCandidatePeriod;
  budget?: Partial<AlbumBudget>;
};
