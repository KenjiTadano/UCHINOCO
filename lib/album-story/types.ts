import type { AlbumCandidatePeriod } from "../album-candidates/types.ts";

export type StoryType = "single" | "same_day" | "event" | "sequence" | "contrast" | "everyday";

export type StoryDensity = "hero" | "light" | "medium" | "dense";

export type StorySceneInput = {
  groupId: string;
  startedAt: string;
  scene?: string;
  activity?: string;
  tags: string[];
  sceneScore: number;
  mustKeep: boolean;
  bestShot: number;
  memoryValue: number;
  framing?: string;
  primaryPhotoId: string;
  secondaryPhotoId?: string;
};

export type StorySpread = {
  id: string;
  sceneIds: string[];
  photoIds: string[];
  primaryPhotoIds: string[];
  secondaryPhotoIds: string[];
  startedAt: string;
  endedAt: string;
  storyType: StoryType;
  theme: {
    scene?: string;
    activity?: string;
    event?: string;
    season?: string;
  };
  coherenceScore: number;
  importance: number;
  recommendedDensity: StoryDensity;
  warnings: string[];
  analysisVersion: string;
};

export type AlbumStoryResult = {
  period: AlbumCandidatePeriod;
  spreads: StorySpread[];
  stats: {
    selectedSceneCount: number;
    selectedPhotoCount: number;
    spreadCount: number;
  };
  storyBalance: {
    chronology: number;
    coherence: number;
    pacing: number;
  };
  warnings: string[];
  analysisVersion: string;
};

export type AlbumStoryRequest = {
  period: AlbumCandidatePeriod;
  scenes: StorySceneInput[];
};
