import { capturedMs } from "../photo-grouping/time.ts";
import type { AlbumCandidatePeriod, AlbumPeriodInput, AlbumPeriodType } from "./types.ts";

export class AlbumPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlbumPeriodError";
  }
}

/** Calendar bounds in Japan. A monthly album never crosses into the next month. */
export function resolveAlbumPeriod(input: AlbumPeriodInput): AlbumCandidatePeriod {
  const type = input.type;
  if (type === "monthly") {
    const { year, month } = requireYearMonth(input);
    return bounded(type, startOfMonth(year, month), endOfMonth(year, month));
  }
  if (type === "seasonal") {
    const { year, month } = requireYearMonth(input);
    const end = addMonths(year, month, 2);
    return bounded(type, startOfMonth(year, month), endOfMonth(end.year, end.month));
  }
  if (type === "yearly") {
    const year = requireYear(input);
    return bounded(type, startOfMonth(year, 1), endOfMonth(year, 12));
  }
  if (type === "event" || type === "custom") {
    if (!input.start || !input.end) {
      throw new AlbumPeriodError("期間の開始と終了が必要です。");
    }
    return bounded(type, input.start, input.end);
  }
  throw new AlbumPeriodError("期間の種類が不正です。");
}

export function assertAlbumPeriod(period: AlbumCandidatePeriod): AlbumCandidatePeriod {
  return bounded(period.type, period.start, period.end);
}

export function instantInPeriod(iso: string, period: AlbumCandidatePeriod): boolean {
  const time = capturedMs(iso);
  if (!time) return false;
  return time >= capturedMs(period.start) && time <= capturedMs(period.end);
}

function bounded(type: AlbumPeriodType, start: string, end: string): AlbumCandidatePeriod {
  const startMs = capturedMs(start);
  const endMs = capturedMs(end);
  if (!startMs || !endMs) throw new AlbumPeriodError("期間の日時が読み取れません。");
  if (startMs > endMs) throw new AlbumPeriodError("期間の開始が終了より後です。");
  return { type, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

function requireYear(input: AlbumPeriodInput): number {
  const year = input.year;
  if (!year || year < 1970 || year > 2100) throw new AlbumPeriodError("年が不正です。");
  return year;
}

function requireYearMonth(input: AlbumPeriodInput): { year: number; month: number } {
  const year = requireYear(input);
  const month = input.month;
  if (!month || month < 1 || month > 12) throw new AlbumPeriodError("月が不正です。");
  return { year, month };
}

function startOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-01T00:00:00.000+09:00`;
}

function endOfMonth(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(last)}T23:59:59.999+09:00`;
}

function addMonths(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
