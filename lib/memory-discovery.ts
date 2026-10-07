import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_INTELLIGENCE_SEMANTIC } from "./photo-analysis/constants.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";
import { tokyoDateParts, tokyoRange } from "./uchinoco-now.ts";
import { searchDateBounds, type SearchState } from "./search-state.ts";

export type MemoryDiscoveryInterpretation = {
  state: SearchState;
  photoQuery: string;
  understood: boolean;
  label: string | null;
};

export type DiscoveryBestShot = {
  id: string; pet_id: string; pet_name: string; storage_path: string; thumbnail_path: string | null;
  taken_at: string | null; created_at: string; timeline_at: string; caption: string | null; favorite: boolean;
  description: string | null; score: number;
};
export type DiscoveryStory = { id: string; albumId: string; petId: string; petName: string; type: string; startedAt: string | null };
export type DiscoveryAlbum = { id: string; petId: string; petName: string; title: string; status: string; periodFrom: string | null; periodTo: string | null; kind: "monthly" | "annual" };
export type DiscoveryAnniversary = { petId: string; petName: string; kind: "birthday" | "adoption"; date: string; year: number | null };

const SEASON_JA: Record<string, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

/** Converts a deliberately small Japanese query grammar into existing filters. */
export function interpretMemoryQuery(state: SearchState, now = new Date()): MemoryDiscoveryInterpretation {
  if (!state.q) return { state, photoQuery: "", understood: false, label: null };
  const q = state.q.replace(/[\s　]+/g, "").toLowerCase();
  const current = tokyoDateParts(now);
  const patch: Partial<SearchState> = {};
  let label: string | null = null;

  if (/去年の今日/.test(q)) {
    patch.from = `${current.year - 1}-${String(current.month).padStart(2, "0")}-${String(current.day).padStart(2, "0")}`;
    patch.to = patch.from;
    patch.anniversary = "on_this_day";
    label = "去年の今日";
  } else {
    const yearMonth = q.match(/(20\d{2})年(1[0-2]|0?[1-9])月/);
    const yearOnly = q.match(/(20\d{2})年/);
    const season = q.match(/(春|夏|秋|冬)(?:の写真)?/);
    if (yearMonth) {
      patch.year = yearMonth[1]; patch.month = String(Number(yearMonth[2])); label = `${yearMonth[1]}年${Number(yearMonth[2])}月`;
    } else if (yearOnly) {
      patch.year = yearOnly[1]; label = `${yearOnly[1]}年`;
    }
    if (season) {
      patch.season = ({ 春: "spring", 夏: "summer", 秋: "autumn", 冬: "winter" } as const)[season[1] as "春" | "夏" | "秋" | "冬"];
      patch.year ||= String(current.year);
      label = `${patch.year}年の${season[1]}`;
    }
    if (/去年/.test(q) && !patch.year) { patch.year = String(current.year - 1); label = `${current.year - 1}年`; }
    if (/ベストショット|bestshot/.test(q)) { patch.best = true; label = label ? `${label}のBest Shot` : "Best Shot"; }
    if (/誕生日/.test(q)) { patch.anniversary = "birthday"; label = label ? `${label}の誕生日` : "誕生日"; }
    if (/お迎えした頃|お迎え日|うちの子記念日/.test(q)) { patch.anniversary = "adoption"; label = "お迎えした頃"; }
  }

  const understood = Object.keys(patch).length > 0;
  const merged = { ...state };
  for (const [key, value] of Object.entries(patch) as Array<[keyof SearchState, SearchState[keyof SearchState]]>) {
    if (merged[key] === "" || merged[key] === false) (merged as Record<string, unknown>)[key] = value;
  }
  return { state: understood ? merged : state, photoQuery: understood ? "" : state.q, understood, label };
}

export function discoveryDateBounds(state: SearchState) {
  if (state.from || state.to) return searchDateBounds(state);
  const today = tokyoDateParts(new Date());
  if (state.anniversary === "on_this_day" && !state.year && !state.month && !state.season) {
    return { from: tokyoRange(today.year - 1, today.month, today.day).start, to: tokyoRange(today.year - 1, today.month, today.day + 1).start };
  }
  const year = state.year ? Number(state.year) : (state.month || state.season ? today.year : null);
  const month = state.month ? Number(state.month) : null;
  if (year && month) {
    return { from: tokyoRange(year, month, 1).start, to: tokyoRange(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1).start };
  }
  if (year && state.season) {
    const ranges: Record<string, [number, number]> = { spring: [3, 6], summer: [6, 9], autumn: [9, 12] };
    if (state.season === "winter") return { from: tokyoRange(year - 1, 12, 1).start, to: tokyoRange(year, 3, 1).start };
    const [start, end] = ranges[state.season];
    return { from: tokyoRange(year, start, 1).start, to: tokyoRange(year, end, 1).start };
  }
  if (year) return { from: tokyoRange(year, 1, 1).start, to: tokyoRange(year + 1, 1, 1).start };
  return { from: null, to: null };
}

function validScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function albumKind(from: string | null, to: string | null): "monthly" | "annual" {
  if (!from || !to) return "monthly";
  return new Date(to).getTime() - new Date(from).getTime() > 300 * 86_400_000 ? "annual" : "monthly";
}

export async function loadDiscoveryGroups(input: { supabase: SupabaseClient; userId: string; state: SearchState }) {
  const { supabase, state } = input;
  const dates = discoveryDateBounds(state);
  // RLS returns both owned pets and explicitly shared family pets.
  const petsResult = await supabase.from("pets").select("id,name,birthday,adoption_date").order("created_at").limit(50);
  const pets = (petsResult.data ?? []).filter((pet) => !state.pet || pet.id === state.pet);
  const petIds = pets.map((pet) => pet.id);
  if (!petIds.length) return { bestShots: [] as DiscoveryBestShot[], stories: [] as DiscoveryStory[], albums: [] as DiscoveryAlbum[], anniversaries: [] as DiscoveryAnniversary[], error: petsResult.error };

  const wantsAlbumRows = Boolean(state.year || state.month || state.season || state.story);
  const relatedAlbumsResult = wantsAlbumRows && state.pet
    ? await supabase.from("album_pets").select("album_id").eq("pet_id", state.pet).limit(50)
    : { data: [], error: null };
  const relatedAlbumIds = [...new Set((relatedAlbumsResult.data ?? []).map((row) => row.album_id))];
  let albumQuery = supabase.from("albums").select("id,pet_id,title,status,period_from,period_to,updated_at").in("pet_id", petIds).order("updated_at", { ascending: false }).limit(16);
  if (dates.from) albumQuery = albumQuery.gte("period_to", dates.from);
  if (dates.to) albumQuery = albumQuery.lt("period_from", dates.to);
  let relatedAlbumQuery = relatedAlbumIds.length
    ? supabase.from("albums").select("id,pet_id,title,status,period_from,period_to,updated_at").in("id", relatedAlbumIds).order("updated_at", { ascending: false }).limit(16)
    : null;
  if (relatedAlbumQuery && dates.from) relatedAlbumQuery = relatedAlbumQuery.gte("period_to", dates.from);
  if (relatedAlbumQuery && dates.to) relatedAlbumQuery = relatedAlbumQuery.lt("period_from", dates.to);

  const analysisQuery = supabase.from("photo_analysis_results")
    .select("photo_id,result,updated_at")
    .eq("analysis_type", PHOTO_INTELLIGENCE_SEMANTIC)
    .eq("analysis_version", PHOTO_INTELLIGENCE_VERSION)
    .eq("result_status", "success")
    .order("updated_at", { ascending: false })
    .limit(120);
  const [albumsResult, relatedRowsResult, analysisResult] = await Promise.all([
    wantsAlbumRows ? albumQuery : Promise.resolve({ data: [], error: null }),
    wantsAlbumRows && relatedAlbumQuery ? relatedAlbumQuery : Promise.resolve({ data: [], error: null }),
    state.best ? analysisQuery : Promise.resolve({ data: [], error: null }),
  ]);
  const albumRows = [...new Map([...(albumsResult.data ?? []), ...(relatedRowsResult.data ?? [])].map((album) => [album.id, album])).values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const albumIds = albumRows.map((album) => album.id);

  const draftResult = albumIds.length
    ? await supabase.from("album_draft_versions").select("id,album_id").in("album_id", albumIds).eq("is_active", true).limit(20)
    : { data: [], error: null };
  const draftIds = (draftResult.data ?? []).map((draft) => draft.id);
  let spreadQuery = draftIds.length
    ? supabase.from("album_draft_spreads").select("id,draft_version_id,story_type,created_at,position").in("draft_version_id", draftIds).order("position").limit(24)
    : null;
  if (spreadQuery && state.story) spreadQuery = spreadQuery.eq("story_type", state.story);
  const spreadsResult = spreadQuery ? await spreadQuery : { data: [], error: null };

  const petById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const albumById = new Map(albumRows.map((album) => [album.id, album]));
  const albumIdByDraft = new Map((draftResult.data ?? []).map((draft) => [draft.id, draft.album_id]));
  const albums: DiscoveryAlbum[] = albumRows.map((album) => ({
    id: album.id, petId: album.pet_id, petName: petById.get(album.pet_id) ?? "うちの子", title: album.title,
    status: album.status, periodFrom: album.period_from, periodTo: album.period_to, kind: albumKind(album.period_from, album.period_to),
  })).filter((album) => !state.year || album.periodFrom?.startsWith(state.year) || album.periodTo?.startsWith(state.year));
  const stories: DiscoveryStory[] = (spreadsResult.data ?? []).flatMap((spread) => {
    const albumId = albumIdByDraft.get(spread.draft_version_id);
    const album = albumId ? albumById.get(albumId) : null;
    return album ? [{ id: spread.id, albumId: album.id, petId: album.pet_id, petName: petById.get(album.pet_id) ?? "うちの子", type: spread.story_type, startedAt: spread.created_at }] : [];
  });

  const scored = new Map<string, number>();
  const seenAnalysis = new Set<string>();
  for (const row of analysisResult.data ?? []) {
    if (seenAnalysis.has(row.photo_id)) continue;
    seenAnalysis.add(row.photo_id);
    const score = validScore((row.result as Record<string, unknown> | null)?.overallScore);
    if (score !== null && score >= 80) scored.set(row.photo_id, score);
    if (scored.size >= 24) break;
  }
  let bestShots: DiscoveryBestShot[] = [];
  if (scored.size) {
    const relationResult = state.pet
      ? await supabase.from("photo_pets").select("photo_id").eq("pet_id", state.pet).eq("confirmed_by_user", true).in("photo_id", [...scored.keys()]).limit(24)
      : { data: [], error: null };
    const relatedIds = new Set((relationResult.data ?? []).map((row) => row.photo_id));
    let photoQuery = supabase.from("photos").select("id,pet_id,storage_path,thumbnail_path,taken_at,created_at,timeline_at,caption,favorite,pets!photos_pet_id_fkey!inner(name,owner_user_id)")
      .in("id", [...scored.keys()]).order("timeline_at", { ascending: false }).limit(24);
    if (dates.from) photoQuery = photoQuery.gte("timeline_at", dates.from);
    if (dates.to) photoQuery = photoQuery.lt("timeline_at", dates.to);
    const photoResult = await photoQuery;
    bestShots = (photoResult.data ?? []).filter((photo) => !state.pet || photo.pet_id === state.pet || relatedIds.has(photo.id)).map((photo) => ({
      ...photo, pet_name: (photo.pets as unknown as { name: string }).name, description: null, score: scored.get(photo.id) ?? 0,
    })).sort((a, b) => b.score - a.score || b.timeline_at.localeCompare(a.timeline_at));
  }

  const requestedAnniversary = state.anniversary === "birthday" || state.anniversary === "adoption" ? state.anniversary : null;
  const anniversaries: DiscoveryAnniversary[] = requestedAnniversary
    ? pets.flatMap((pet) => {
        const date = requestedAnniversary === "birthday" ? pet.birthday : pet.adoption_date;
        if (!date) return [];
        return [{ petId: pet.id, petName: pet.name, kind: requestedAnniversary, date, year: state.year ? Number(state.year) : null }];
      })
    : [];

  return {
    bestShots: bestShots.slice(0, 6), stories: stories.slice(0, 8), albums: albums.slice(0, 8), anniversaries,
    error: petsResult.error ?? relatedAlbumsResult.error ?? albumsResult.error ?? relatedRowsResult.error ?? analysisResult.error ?? draftResult.error ?? spreadsResult.error,
  };
}

export function discoveryLabel(state: SearchState) {
  const pieces = [state.year ? `${state.year}年` : "", state.month ? `${Number(state.month)}月` : "", state.season ? SEASON_JA[state.season] : ""].filter(Boolean);
  return pieces.join(" ");
}
