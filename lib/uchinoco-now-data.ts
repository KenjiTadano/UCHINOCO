import type { SupabaseClient } from "@supabase/supabase-js";
import type { UchinocoNowPhoto } from "./uchinoco-now.ts";

const PHOTO_SELECT =
  "id, pet_id, storage_path, thumbnail_path, taken_at, created_at, favorite, caption";

export async function loadPhotosInRange(
  supabase: SupabaseClient,
  petIds: string[],
  range: { start: string; end: string },
  limit = 24,
) {
  if (!petIds.length) return { photos: [] as UchinocoNowPhoto[], error: null };
  const [taken, created] = await Promise.all([
    supabase
      .from("photos")
      .select(PHOTO_SELECT)
      .in("pet_id", petIds)
      .gte("taken_at", range.start)
      .lt("taken_at", range.end)
      .order("taken_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("photos")
      .select(PHOTO_SELECT)
      .in("pet_id", petIds)
      .is("taken_at", null)
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
  ]);
  const photos = [...(taken.data ?? []), ...(created.data ?? [])]
    .sort((a, b) => {
      const byTime = new Date(b.taken_at ?? b.created_at).getTime() - new Date(a.taken_at ?? a.created_at).getTime();
      return byTime || b.id.localeCompare(a.id);
    })
    .slice(0, limit) as UchinocoNowPhoto[];
  return { photos, error: taken.error ?? created.error };
}

/** Exact per-day top-N, with one bounded batch followed by parallel fallback.
 * Empty years share one query. A dense newer year cannot starve an older year:
 * completed ranges are removed before querying again. No cross-request state.
 */
export async function loadPhotosInDayRanges(
  supabase: SupabaseClient,
  petIds: string[],
  ranges: Array<{ start: string; end: string }>,
  limit = 6,
) {
  if (ranges.length > 10 || !Number.isInteger(limit) || limit < 1 || limit > 24) throw new Error("Invalid history bounds");
  const bounds = ranges.map(range => ({ start: Date.parse(range.start), end: Date.parse(range.end) }));
  if (bounds.some((range, i) => !Number.isFinite(range.start) || !Number.isFinite(range.end)
    || range.start >= range.end || (i > 0 && range.end > bounds[i - 1].start))) throw new Error("History ranges must be disjoint and newest first");
  const empty = () => ranges.map(() => ({ photos: [] as UchinocoNowPhoto[], error: null }));
  if (!petIds.length || !ranges.length) return empty();
  async function branch(field: "taken_at" | "created_at") {
    const results: Array<{ photos: UchinocoNowPhoto[]; error: { message: string } | null }> = empty();
    let remaining = ranges.map((_, i) => i);
    const query = (indices: number[], pageSize = limit) => {
      let request = supabase.from("photos").select(PHOTO_SELECT).in("pet_id", petIds);
      if (field === "created_at") request = request.is("taken_at", null);
      return request.or(indices.map(i => `and(${field}.gte.${ranges[i].start},${field}.lt.${ranges[i].end})`).join(","))
        .order(field, { ascending: false }).order("id", { ascending: false }).limit(pageSize);
    };
    const pageSize = limit * ranges.length;
    const response = await query(remaining, pageSize);
    if (!response.error) {
      const rows = (response.data ?? []) as UchinocoNowPhoto[];
      const grouped = new Map<number, UchinocoNowPhoto[]>();
      for (const photo of rows) {
        const time = Date.parse(photo[field] ?? "");
        const index = remaining.find(i => time >= bounds[i].start && time < bounds[i].end);
        if (index === undefined) throw new Error("Unexpected history row range");
        const group = grouped.get(index) ?? [];
        group.push(photo); grouped.set(index, group);
      }
      for (const i of remaining) results[i] = { photos: (grouped.get(i) ?? []).slice(0, limit), error: null };
      if (rows.length < pageSize) remaining = [];
      else {
        const last = Math.max(...grouped.keys());
        // Earlier buckets are complete in global time order. A final bucket
        // with fewer than N rows may be truncated, so requery it independently.
        const keepLast = (grouped.get(last)?.length ?? 0) < limit;
        remaining = remaining.filter(i => keepLast ? i >= last : i > last);
      }
    }
    // Dense data never causes a serial year-by-year walk. Batch errors also use
    // this original per-range path: at most 11 calls per branch / two I/O layers.
    await Promise.all(remaining.map(async i => {
      const single = await query([i]);
      results[i] = { photos: (single.data ?? []) as UchinocoNowPhoto[], error: single.error };
    }));
    return results;
  }
  const [taken, created] = await Promise.all([branch("taken_at"), branch("created_at")]);
  return ranges.map((_, i) => ({
    photos: [...taken[i].photos, ...created[i].photos].sort((a, b) => {
      const byTime = new Date(b.taken_at ?? b.created_at).getTime() - new Date(a.taken_at ?? a.created_at).getTime();
      return byTime || b.id.localeCompare(a.id);
    }).slice(0, limit),
    error: taken[i].error ?? created[i].error,
  }));
}

export async function selectStoredTodayBestShot(
  supabase: SupabaseClient,
  photos: UchinocoNowPhoto[],
) {
  if (!photos.length) return { photo: null, usedStoredIntelligence: false, error: null };
  const { data, error } = await supabase
    .from("photo_analysis_results")
    .select("photo_id, result_status, result, updated_at")
    .in("photo_id", photos.map((photo) => photo.id))
    .eq("analysis_type", "photo_intelligence_semantic")
    .eq("result_status", "success")
    .order("updated_at", { ascending: false });
  if (error) return { photo: photos[0], usedStoredIntelligence: false, error };

  const latestScore = new Map<string, number>();
  for (const row of data ?? []) {
    if (latestScore.has(row.photo_id)) continue;
    const value = row.result as { overallScore?: unknown } | null;
    if (typeof value?.overallScore === "number" && Number.isFinite(value.overallScore)) {
      latestScore.set(row.photo_id, value.overallScore);
    }
  }
  const ranked = photos
    .filter((photo) => latestScore.has(photo.id))
    .sort((a, b) => (latestScore.get(b.id) ?? 0) - (latestScore.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  return {
    photo: ranked[0] ?? photos[0],
    usedStoredIntelligence: ranked.length > 0,
    error: null,
  };
}
