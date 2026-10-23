import "server-only";
import { traceRouteLoader } from "./route-loader-trace";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteReadContext } from "./route-read-context";
import { canUsePhotoInAlbum } from "./photo-eligibility";
import { signedPreviewUrls } from "./read-draft";
import { createListImageUrls } from "../photo-list-images";

export async function loadRouteCandidates(supabase: SupabaseClient, context: RouteReadContext) {
  const eligibility = await traceRouteLoader("candidate-context", () => context.eligibility());
  if (!eligibility) return [];
  const albumId = context.album.id;
  const petIds = eligibility.allowedPetIds;
  const { data: photos } = await traceRouteLoader("candidate-photos", () => supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path").in("pet_id", petIds).eq("uploader_user_id", context.userId).order("taken_at", { ascending: false }).limit(80));
  let rows = photos ?? [];
  // The recent-photo cap must not hide photographs explicitly added to this album.
  if (albumId) {
    const { data: selected, error: selectedError } = await supabase.from("album_photos").select("photo_id").eq("album_id", albumId);
    if (selectedError) return [];
    const visibleIds = new Set(rows.map((photo) => photo.id));
    const missingIds = (selected ?? []).map((row) => row.photo_id).filter((id) => !visibleIds.has(id));
    for (let offset = 0; offset < missingIds.length; offset += 64) {
      const batch = missingIds.slice(offset, offset + 64);
      const { data: added, error: addedError } = await supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path").in("id", batch).in("pet_id", petIds).eq("uploader_user_id", context.userId);
      if (addedError) return [];
      rows = [...rows, ...(added ?? [])];
    }
  }

  rows = rows.filter((photo) => canUsePhotoInAlbum(eligibility, photo, context.userId));
  context.remember(rows);
  const previews = await signedPreviewUrls(
    supabase,
    rows.map((photo) => photo.id), false, context,
  );
  const listed = await createListImageUrls(supabase, rows, context.userId);
  return rows.flatMap((photo) => {
    const src = previews.get(photo.id);
    if (!src) return [];
    const thumb = photo.thumbnail_path ? (listed.signedUrlByPath.get(photo.thumbnail_path) ?? src) : src;
    return [{ id: photo.id, src, thumb }];
  });
}
