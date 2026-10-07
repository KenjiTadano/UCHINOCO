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
