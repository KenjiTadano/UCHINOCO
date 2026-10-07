import { createHash } from "node:crypto";
import { DRAFT_GENERATION_METADATA } from "./album-persistence/config.ts";
import { tokyoDateParts, tokyoRange } from "./uchinoco-now.ts";

export const ANNUAL_ALBUM_VERSION = "annual-album-candidate-v1";
export const ANNUAL_ALBUM_CONFIG = {
  minPhotos: 48,
  // 36 analyzed photos still support a 24–36 photo printed yearbook while
  // tolerating a minority of uploads that Task062 has not processed yet.
  minAnalyzedPhotos: 36,
  minAnalyzedRatio: 0.65,
  minRepresentedMonths: 6,
  minMonthCoverageRatio: 0.65,
  minSelectedPhotos: 24,
  maxSelectedPhotos: 36,
  visibility: { startMonth: 12, startDay: 15, endMonth: 1, endDay: 31 },
  seasons: [
    { key: "WINTER", label: "Winter", months: [12, 1, 2] },
    { key: "SPRING", label: "Spring", months: [3, 4, 5] },
    { key: "SUMMER", label: "Summer", months: [6, 7, 8] },
    { key: "AUTUMN", label: "Autumn", months: [9, 10, 11] },
  ],
} as const;

export type AnnualSeasonKey = (typeof ANNUAL_ALBUM_CONFIG.seasons)[number]["key"];

export function annualPeriod(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("invalid annual year");
  return { start: tokyoRange(year, 1, 1).start, end: tokyoRange(year + 1, 1, 1).start };
}

export function parseAnnualYear(value: string | number | null | undefined) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
}

export function annualCandidateYear(now = new Date()) {
  const parts = tokyoDateParts(now);
  if (parts.month === 12 && parts.day >= ANNUAL_ALBUM_CONFIG.visibility.startDay) return parts.year;
  if (parts.month === 1 && parts.day <= ANNUAL_ALBUM_CONFIG.visibility.endDay) return parts.year - 1;
  return null;
}

export function annualSeasonForTimestamp(value: string): AnnualSeasonKey {
  const month = tokyoDateParts(new Date(value)).month;
  return ANNUAL_ALBUM_CONFIG.seasons.find((season) => season.months.includes(month as never))?.key ?? "WINTER";
}

export function annualCandidateFingerprint(input: { year: number; petIds: string[]; analyzedPhotoIds: string[]; selectedPhotoIds: string[] }) {
  return createHash("sha256").update(JSON.stringify({
    version: ANNUAL_ALBUM_VERSION,
    year: input.year,
    petIds: [...input.petIds].sort(),
    analyzedPhotoIds: [...input.analyzedPhotoIds].sort(),
    selectedPhotoIds: [...input.selectedPhotoIds].sort(),
    analysis: DRAFT_GENERATION_METADATA,
    annualEngine: ANNUAL_ALBUM_VERSION,
    rhythm: "album-rhythm-v2",
  })).digest("hex");
}

export function annualCandidateAlbumId(fingerprint: string) {
  const hex = createHash("sha256").update(`uchinoco-passive-annual:${fingerprint}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-b${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function annualCandidateTitle(year: number, petName: string) {
  return `${year}年の${petName.trim() || "うちの子"}`;
}

export function annualEligibility(input: { totalPhotoCount: number; analyzedPhotoCount: number; populatedMonthCount: number; representedMonthCount: number; selectedPhotoCount?: number; completedAnnualExists: boolean }) {
  const analyzedRatio = input.totalPhotoCount ? input.analyzedPhotoCount / input.totalPhotoCount : 0;
  const coverageRatio = input.populatedMonthCount ? input.representedMonthCount / input.populatedMonthCount : 0;
  const requiredRepresentedMonths = Math.min(ANNUAL_ALBUM_CONFIG.minRepresentedMonths, input.populatedMonthCount);
  return {
    eligible:
      input.totalPhotoCount >= ANNUAL_ALBUM_CONFIG.minPhotos &&
      input.analyzedPhotoCount >= ANNUAL_ALBUM_CONFIG.minAnalyzedPhotos &&
      analyzedRatio >= ANNUAL_ALBUM_CONFIG.minAnalyzedRatio &&
      input.representedMonthCount >= requiredRepresentedMonths &&
      input.representedMonthCount >= ANNUAL_ALBUM_CONFIG.minRepresentedMonths &&
      coverageRatio >= ANNUAL_ALBUM_CONFIG.minMonthCoverageRatio &&
      (input.selectedPhotoCount === undefined || input.selectedPhotoCount >= ANNUAL_ALBUM_CONFIG.minSelectedPhotos) &&
      !input.completedAnnualExists,
    remaining: Math.max(0, ANNUAL_ALBUM_CONFIG.minPhotos - input.totalPhotoCount),
    analyzedRatio,
    coverageRatio,
  };
}

export function groupAnnualSelectionBySeason(photos: Array<{ id: string; timelineAt: string }>) {
  return ANNUAL_ALBUM_CONFIG.seasons.flatMap((season) => {
    const photoIds = photos.filter((photo) => annualSeasonForTimestamp(photo.timelineAt) === season.key).map((photo) => photo.id);
    return photoIds.length ? [{ key: season.key, label: season.label, photoIds }] : [];
  });
}

export function annualSelectionCoversSourceMonths(source: Array<{ timelineAt: string }>, selected: Array<{ timelineAt: string }>) {
  const month = (value: string) => tokyoDateParts(new Date(value)).month;
  const sourceMonths = new Set(source.map((photo) => month(photo.timelineAt)));
  const selectedMonths = new Set(selected.map((photo) => month(photo.timelineAt)));
  return [...sourceMonths].every((value) => selectedMonths.has(value));
}

export function representedAnnualMonths(photos: Array<{ timelineAt: string }>) {
  return new Set(photos.map((photo) => tokyoDateParts(new Date(photo.timelineAt)).month));
}
