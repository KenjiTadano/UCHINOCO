import { ALBUM_CANDIDATES_CONFIG } from "./album-candidates/config.ts";
import { tokyoDateParts, tokyoRange } from "./uchinoco-now.ts";

export type MonthlyAlbumState = "COLLECTING" | "CANDIDATE_READY" | "DRAFT" | "ACCEPTED" | "ORDERED" | "FINALIZED";

export type TokyoMonth = {
  key: string;
  year: number;
  month: number;
  period: { start: string; end: string };
};

export function tokyoMonth(year: number, month: number): TokyoMonth {
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = normalized.getUTCMonth() + 1;
  return {
    key: `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`,
    year: normalizedYear,
    month: normalizedMonth,
    period: tokyoRange(normalizedYear, normalizedMonth, 1, true),
  };
}

export function currentTokyoMonth(now = new Date()) {
  const parts = tokyoDateParts(now);
  return tokyoMonth(parts.year, parts.month);
}

export function previousTokyoMonth(now = new Date()) {
  const current = currentTokyoMonth(now);
  return tokyoMonth(current.year, current.month - 1);
}

export function parseTokyoMonthKey(value: string | null | undefined): TokyoMonth | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? tokyoMonth(Number(match[1]), Number(match[2])) : null;
}

export function monthKeyForTimestamp(value: string) {
  const parts = tokyoDateParts(new Date(value));
  return tokyoMonth(parts.year, parts.month).key;
}

export function periodMatchesMonth(periodFrom: string | null, periodTo: string | null, month: TokyoMonth) {
  return Boolean(periodFrom && periodTo && periodFrom < month.period.end && periodTo > month.period.start);
}

export function deriveMonthlyAlbumLifecycle(input: {
  photoCount: number;
  candidateReady?: boolean;
  hasDraft?: boolean;
  accepted?: boolean;
  ordered?: boolean;
  finalized?: boolean;
}) {
  const threshold = ALBUM_CANDIDATES_CONFIG.budget.minPhotos;
  const state: MonthlyAlbumState = input.finalized
    ? "FINALIZED"
    : input.ordered
      ? "ORDERED"
      : input.accepted
        ? "ACCEPTED"
        : input.hasDraft
          ? "DRAFT"
          : input.candidateReady
            ? "CANDIDATE_READY"
            : "COLLECTING";
  return {
    state,
    photoCount: input.photoCount,
    threshold,
    remaining: Math.max(0, threshold - input.photoCount),
    ready: state !== "COLLECTING",
  };
}

export function monthlyStateLabel(state: MonthlyAlbumState) {
  if (state === "CANDIDATE_READY") return "AIがまとめました · 未確認";
  if (state === "DRAFT") return "編集中";
  if (state === "ACCEPTED") return "完成";
  if (state === "ORDERED") return "印刷手続き中";
  if (state === "FINALIZED") return "印刷済み";
  return "写真を集めています";
}
