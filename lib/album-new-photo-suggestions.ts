import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { detectNewPhotoIds, newPhotoSuggestionFingerprint, suggestionIsProtected } from "./album-new-photo-suggestion-policy";

type Metadata = Record<string, unknown>;

export type NewPhotoCandidate = {
  id: string;
  petId: string;
  storagePath: string;
  thumbnailPath: string | null;
  takenAt: string | null;
  createdAt: string;
  bestShotScore: number | null;
  alreadyInAlbum: boolean;
};

export type NewPhotoSuggestion = {
  albumId: string;
  draftVersionId: string;
  fingerprint: string;
  candidates: NewPhotoCandidate[];
  dismissed: boolean;
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreFromResult(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const candidates = [result.bestShotScore, result.best_shot_score, result.overallScore];
  const bestShot = result.bestShot;
  if (bestShot && typeof bestShot === "object" && !Array.isArray(bestShot)) {
    candidates.push((bestShot as Record<string, unknown>).overall);
  }
  return candidates.find((item): item is number => typeof item === "number" && Number.isFinite(item)) ?? null;
}

/** Read-only detection. It never mutates the persisted draft or album photo order. */
export async function findNewPhotoSuggestion(
  supabase: SupabaseClient,
  input: { albumId: string; routePetId: string; userId: string },
): Promise<NewPhotoSuggestion | null> {
  const { data: album, error: albumError } = await supabase
    .from("albums")
    .select("id, pet_id, owner_user_id, status, period_from, period_to")
    .eq("id", input.albumId)
    .eq("pet_id", input.routePetId)
    .eq("owner_user_id", input.userId)
    .maybeSingle();
  if (albumError || !album) return null;

  const [{ data: links, error: linksError }, { data: version, error: versionError }, { data: accepted, error: acceptedError }, { data: order, error: orderError }] = await Promise.all([
    supabase.from("album_pets").select("pet_id").eq("album_id", album.id),
    supabase.from("album_draft_versions").select("id, status, created_at, generation_metadata").eq("album_id", album.id).eq("is_active", true).maybeSingle(),
    supabase.from("album_analytics_events").select("id").eq("album_id", album.id).eq("event_type", "album_accepted").limit(1).maybeSingle(),
    supabase.from("orders").select("id").eq("album_id", album.id).in("status", ["pending", "paid"]).limit(1).maybeSingle(),
  ]);
  if (linksError || versionError || acceptedError || orderError || !version || suggestionIsProtected({ albumStatus: album.status, draftStatus: version.status, accepted: Boolean(accepted), ordered: Boolean(order) })) return null;

  const petIds = [...new Set([album.pet_id, ...(links ?? []).map((row) => row.pet_id)])];
  const { data: ownedPets, error: ownedPetsError } = await supabase.from("pets").select("id").in("id", petIds).eq("owner_user_id", input.userId);
  if (ownedPetsError) return null;
  if ((ownedPets ?? []).length !== petIds.length) return null;

  const metadata = (version.generation_metadata ?? {}) as Metadata;
  let generatedIds = stringArray(metadata.passive_candidate_photo_ids);
  if (generatedIds.length === 0) generatedIds = stringArray(metadata.generation_photo_ids);

  // Legacy drafts predate the generation snapshot. Frame IDs are the strongest
  // persisted baseline; created_at is only a conservative fallback for those drafts.
  if (generatedIds.length === 0) {
    const { data: spreads, error: spreadsError } = await supabase.from("album_draft_spreads").select("id").eq("draft_version_id", version.id);
    if (spreadsError) return null;
    const spreadIds = (spreads ?? []).map((spread) => spread.id);
    if (spreadIds.length > 0) {
      const { data: frames, error: framesError } = await supabase.from("album_draft_frames").select("ai_photo_id").in("draft_spread_id", spreadIds);
      if (framesError) return null;
      generatedIds = [...new Set((frames ?? []).map((frame) => frame.ai_photo_id))];
    }
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at")
    .in("pet_id", petIds)
    .eq("uploader_user_id", input.userId)
    .gte("timeline_at", album.period_from)
    .lt("timeline_at", album.period_to)
    .order("timeline_at", { ascending: false });

  if (photosError) return null;
  const currentIds = (photos ?? []).map((photo) => photo.id);
  const newPhotoIds = new Set(detectNewPhotoIds(generatedIds, currentIds, []));
  const current = (photos ?? []).filter((photo) => newPhotoIds.has(photo.id));
  const legacyFiltered = stringArray(metadata.passive_candidate_photo_ids).length === 0 && stringArray(metadata.generation_photo_ids).length === 0
    ? current.filter((photo) => photo.created_at > version.created_at)
    : current;
  if (legacyFiltered.length === 0) return null;

  const newIds = legacyFiltered.map((photo) => photo.id);
  const [{ data: albumRows, error: albumRowsError }, { data: analyses }] = await Promise.all([
    supabase.from("album_photos").select("photo_id").eq("album_id", album.id).in("photo_id", newIds),
    supabase.from("photo_analysis_results").select("photo_id, result").in("photo_id", newIds).eq("analysis_type", "photo_intelligence_semantic").eq("result_status", "success"),
  ]);
  if (albumRowsError) return null;
  const albumPhotoIds = new Set((albumRows ?? []).map((row) => row.photo_id));
  const analysisByPhoto = new Map((analyses ?? []).map((row) => [row.photo_id, scoreFromResult(row.result)]));
  const candidates = legacyFiltered.filter((photo) => !albumPhotoIds.has(photo.id)).map((photo) => ({
    id: photo.id,
    petId: photo.pet_id,
    storagePath: photo.storage_path,
    thumbnailPath: photo.thumbnail_path,
    takenAt: photo.taken_at,
    createdAt: photo.created_at,
    bestShotScore: analysisByPhoto.get(photo.id) ?? null,
    alreadyInAlbum: false,
  }));
  if (candidates.length === 0) return null;
  // Keep the fingerprint stable while a user adds only part of the suggestion.
  // The generation delta includes photos already added from this same delta;
  // the visible candidate list above still excludes them.
  const fingerprint = newPhotoSuggestionFingerprint(album.id, version.id, legacyFiltered.map((photo) => photo.id));
  const { data: dismissed, error: dismissedError } = await supabase.from("album_analytics_events").select("id").eq("album_id", album.id).eq("event_type", "new_photos_dismissed").eq("event_key", fingerprint).maybeSingle();
  if (dismissedError) return null;
  return { albumId: album.id, draftVersionId: version.id, fingerprint, candidates, dismissed: Boolean(dismissed) };
}
