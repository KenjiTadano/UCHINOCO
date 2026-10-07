import { ALBUM_CANDIDATES_CONFIG } from "./album-candidates/config.ts";

export const PHOTO_INTAKE_CONFIG = {
  maxWorkItemsPerVisit: 4,
  workWindowMs: 5 * 60_000,
  runnerDelayMs: 1_000,
  minimumAlbumPhotos: ALBUM_CANDIDATES_CONFIG.budget.minPhotos,
} as const;

export type PhotoIntakeState =
  | "UPLOADED"
  | "MEDIA_READY"
  | "ANALYSIS_PENDING"
  | "ANALYZED"
  | "ALBUM_ELIGIBLE"
  | "FAILED_ANALYSIS";

export function derivePhotoIntakeState(input: {
  photoPersisted: boolean;
  mediaReady: boolean;
  queueStatus: "pending" | "processing" | "completed" | "failed" | null;
  intelligenceReady: boolean;
  albumEligible: boolean;
}): PhotoIntakeState {
  if (!input.photoPersisted) return "UPLOADED";
  if (input.queueStatus === "failed") return "FAILED_ANALYSIS";
  if (input.albumEligible && input.intelligenceReady) return "ALBUM_ELIGIBLE";
  if (input.queueStatus === "completed" && input.intelligenceReady) return "ANALYZED";
  if (input.queueStatus === "pending" || input.queueStatus === "processing" || input.queueStatus === "completed") {
    return "ANALYSIS_PENDING";
  }
  return input.mediaReady ? "MEDIA_READY" : "UPLOADED";
}

export function albumCandidateTransition(before: number, after: number) {
  const threshold = PHOTO_INTAKE_CONFIG.minimumAlbumPhotos;
  return {
    before,
    after,
    threshold,
    becameReady: before < threshold && after >= threshold,
    ready: after >= threshold,
    remaining: Math.max(0, threshold - after),
  };
}

export function shouldContinueIntake(processed: number, ready: boolean, stopped = false) {
  return !stopped && ready && processed < PHOTO_INTAKE_CONFIG.maxWorkItemsPerVisit;
}
