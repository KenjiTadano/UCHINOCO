/**
 * Rule-based album photo selection.
 * No images sent to AI — only structured metadata from existing photo_ai_analyses.
 *
 * v1 algorithm:
 * 1. Score each photo candidate.
 * 2. Group by day, take max MAX_PER_DAY highest-scoring per day.
 * 3. Apply activity/scene diversity cap.
 * 4. Limit to MAX_PHOTOS total, sorted by timeline_at asc.
 */

export const ALBUM_MAX_PHOTOS = 35;
const MAX_PER_DAY = 3;
const MAX_PER_ACTIVITY = 8;
const MAX_PER_SCENE = 8;

export type AlbumCandidate = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  timeline_at: string;
  favorite: boolean;
  caption: string | null;
  /** From photo_ai_analyses, null if not completed */
  activity: string | null;
  scene: string | null;
  emotion: string | null;
  tags: string[] | null;
};

function scorePhoto(p: AlbumCandidate): number {
  let score = 0;
  if (p.favorite) score += 3;
  if (p.activity) score += 1;
  if (p.scene && p.scene !== "その他") score += 1;
  if (p.emotion && p.emotion !== "不明") score += 1;
  if (p.tags && p.tags.length > 0) score += 1;
  if (p.caption) score += 1;
  return score;
}

function dayKey(p: AlbumCandidate): string {
  const ts = p.taken_at ?? p.created_at;
  return ts.slice(0, 10); // "YYYY-MM-DD"
}

export function selectAlbumPhotos(candidates: AlbumCandidate[]): AlbumCandidate[] {
  if (candidates.length === 0) return [];

  // Score all
  const scored = candidates.map((p) => ({ photo: p, score: scorePhoto(p) }));

  // Group by day and pick top MAX_PER_DAY per day
  const byDay = new Map<string, typeof scored>();
  for (const item of scored) {
    const key = dayKey(item.photo);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }
  const pool: typeof scored = [];
  for (const dayItems of byDay.values()) {
    dayItems.sort((a, b) => b.score - a.score);
    pool.push(...dayItems.slice(0, MAX_PER_DAY));
  }

  // Global sort by score desc, then timeline_at asc for stable ordering
  pool.sort((a, b) => b.score - a.score || a.photo.timeline_at.localeCompare(b.photo.timeline_at));

  // Activity / scene diversity cap
  const activityCount = new Map<string, number>();
  const sceneCount = new Map<string, number>();
  const selected: AlbumCandidate[] = [];

  for (const { photo } of pool) {
    if (selected.length >= ALBUM_MAX_PHOTOS) break;
    const act = photo.activity ?? "_none";
    const sc = photo.scene ?? "_none";
    if ((activityCount.get(act) ?? 0) >= MAX_PER_ACTIVITY) continue;
    if ((sceneCount.get(sc) ?? 0) >= MAX_PER_SCENE) continue;
    activityCount.set(act, (activityCount.get(act) ?? 0) + 1);
    sceneCount.set(sc, (sceneCount.get(sc) ?? 0) + 1);
    selected.push(photo);
  }

  // Final order: chronological
  selected.sort((a, b) => a.timeline_at.localeCompare(b.timeline_at));

  return selected;
}

/** Rule-based fallback title. Always works without AI. */
export function generateFallbackTitle(petName: string, periodFrom: Date, periodTo: Date): string {
  const month = periodTo.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "long" });
  const year = periodTo.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric" });
  const spanMonths = Math.round(
    (periodTo.getTime() - periodFrom.getTime()) / (1000 * 60 * 60 * 24 * 30),
  );
  if (spanMonths <= 1) return `${petName}との思い出 ${month}`;
  const season = toSeason(periodTo);
  return season
    ? `${petName}との${season} ${year}`
    : `${petName}との思い出 ${year}`;
}

function toSeason(date: Date): string | null {
  const m = date.getMonth() + 1; // 1-12 in local time (doesn't need to be exact)
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}
