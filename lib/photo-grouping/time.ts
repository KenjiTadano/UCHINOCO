const TOKYO = "Asia/Tokyo";

export function capturedMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Calendar day in Japan. A midnight crossing is a different day. */
export function tokyoDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function timeGapMs(a: string, b: string): number {
  return Math.abs(capturedMs(a) - capturedMs(b));
}

/**
 * 0–30s very close, 30s–2min close, 2–10min somewhat close, then falls off.
 * A different calendar day is 0. Time alone never confirms a group.
 */
export function scoreTimeProximity(a: string, b: string): number {
  if (tokyoDay(a) === "" || tokyoDay(b) === "" || tokyoDay(a) !== tokyoDay(b)) return 0;
  const gap = timeGapMs(a, b) / 1000;
  if (gap <= 30) return 100;
  if (gap <= 120) return 86;
  if (gap <= 600) return 68;
  if (gap <= 1800) return 42;
  if (gap <= 7200) return 22;
  return 8;
}
