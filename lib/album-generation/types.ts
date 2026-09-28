import type { AlbumCandidatePeriod } from "../album-candidates/types.ts";
import type { AlbumSpreadDraft } from "../album-draft/types.ts";

export type StageStatus = "ok" | "warning" | "failed";

export type StageSummary = {
  status: StageStatus;
  inputCount: number;
  outputCount: number;
  warnings: string[];
  durationMs?: number;
  cache?: "hit" | "miss" | "mixed" | "unknown";
  /** Dev audit: memory, db, or ai. Absent for stages that do not call a model. */
  cacheSource?: "memory" | "db" | "ai" | "mixed";
};

export type QualityGrade = "GOOD" | "REVIEW" | "NEEDS_ATTENTION" | "BLOCKED";

export type AlbumGenerationQuality = {
  selectionQuality: number;
  storyQuality: number;
  layoutQuality: number;
  cropSafety: number;
  consistency: number;
  overall: number;
  grade: QualityGrade;
  blockingIssues: string[];
  nonBlockingIssues: string[];
};

export type PhotoTrace = {
  photoId: string;
  bestShotRole: string;
  candidateRole: string;
  storySpreadId: string;
  storyRole: string;
  draftSpreadId: string;
  draftRole: string;
  frameId: string;
  warnings: string[];
};

export type PrimaryChain = {
  groupId: string;
  bestShotPhotoId: string;
  candidatePhotoId: string;
  storyPhotoId: string;
  draftPhotoId: string;
  draftRole: string;
  warnings: string[];
};

export type GenerationCounts = {
  library: number;
  period: number;
  sceneGroups: number;
  selectedScenes: number;
  selectedPhotos: number;
  storySpreads: number;
  draftSpreads: number;
  draftPhotos: number;
};

export type AlbumGenerationResult = {
  petId: string;
  period: AlbumCandidatePeriod;
  stages: {
    photoIntelligence: StageSummary;
    grouping: StageSummary;
    bestShot: StageSummary;
    candidates: StageSummary;
    story: StageSummary;
    draft: StageSummary;
  };
  counts: GenerationCounts;
  album: {
    spreads: AlbumSpreadDraft[];
  };
  traces: PhotoTrace[];
  primaryChains: PrimaryChain[];
  quality: AlbumGenerationQuality;
  warnings: string[];
  analysisVersion: string;
};
