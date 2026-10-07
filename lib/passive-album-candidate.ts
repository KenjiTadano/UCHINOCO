import { createHash } from "node:crypto";
import { DRAFT_GENERATION_METADATA } from "./album-persistence/config.ts";
import { ALBUM_CANDIDATES_CONFIG } from "./album-candidates/config.ts";

export const PASSIVE_ALBUM_CANDIDATE_VERSION = "passive-album-candidate-v1";
export const PASSIVE_ALBUM_MIN_PHOTOS = ALBUM_CANDIDATES_CONFIG.budget.minPhotos;

export type PassiveCandidateIdentity = {
  petIds: string[];
  period: { start: string; end: string };
  photoIds: string[];
};

export type PassiveCandidateSummary = PassiveCandidateIdentity & {
  fingerprint: string;
  title: string;
  photoCount: number;
  coverPhotoId: string | null;
  stale: boolean;
};

export function passiveCandidateFingerprint(identity: PassiveCandidateIdentity) {
  const payload = JSON.stringify({
    version: PASSIVE_ALBUM_CANDIDATE_VERSION,
    petIds: [...identity.petIds].sort(),
    period: identity.period,
    photoIds: [...identity.photoIds].sort(),
    analysis: DRAFT_GENERATION_METADATA,
    layoutEngine: DRAFT_GENERATION_METADATA.album_draft_version,
    rhythm: "album-rhythm-v2",
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Stable UUID makes concurrent opens converge on one album row without a new table. */
export function passiveCandidateAlbumId(fingerprint: string) {
  const hex = createHash("sha256").update(`uchinoco-passive-album:${fingerprint}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function isPassiveCandidateReady(photoCount: number, currentAnalysisCount: number) {
  return photoCount >= PASSIVE_ALBUM_MIN_PHOTOS && currentAnalysisCount >= photoCount * 2;
}

export function isCandidateStale(previousFingerprint: string, current: PassiveCandidateIdentity) {
  return previousFingerprint !== passiveCandidateFingerprint(current);
}

export function passiveCandidateTitle(periodStart: string, petName: string) {
  const date = new Date(periodStart);
  const month = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long" }).format(date);
  return `${petName}の${month}の思い出`;
}
