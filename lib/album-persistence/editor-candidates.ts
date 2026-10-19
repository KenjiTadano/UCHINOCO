import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canUsePhotoInAlbum } from "./photo-eligibility.ts";
import type { AlbumRequestContext } from "./request-context.ts";
import { createPhotoPreviewUrls } from "../photo-image-delivery.ts";
import { createListImageUrls } from "../photo-list-images.ts";

/** Internal loader: context comes from this request's authenticated server code, never the browser. */
export async function loadRequestEditorCandidates(supabase: SupabaseClient, context: AlbumRequestContext, petId: string, albumId?: string, options?: { restrictPhotoIds?: string[]; routePetVerified?: boolean }) {
  const userId = context.userId;
  if (!options?.routePetVerified) {
    const { data: pet } = await supabase.from("pets").select("id").eq("id", petId).eq("owner_user_id", userId).maybeSingle();
    if (!pet) return [];
  }
  const eligibility = albumId ? await context.eligibility(albumId) : { ownerUserId: userId, allowedPetIds: [petId] };
  if (!eligibility) return [];
  if (albumId && (await context.album(albumId))?.pet_id !== petId) return [];
  const petIds = [...eligibility.allowedPetIds];
  const { data: photos } = await supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path").in("pet_id", petIds).eq("uploader_user_id", userId).order("taken_at", { ascending: false }).limit(80);
  let rows = photos ?? [];
  if (albumId) {
    const { data: selected, error } = await supabase.from("album_photos").select("photo_id").eq("album_id", albumId);
    if (error) return [];
    const visibleIds = new Set(rows.map((photo) => photo.id));
    const missingIds = (selected ?? []).map((row) => row.photo_id).filter((id) => !visibleIds.has(id));
    if (missingIds.length) {
      const { data: added, error } = await supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path").in("id", missingIds).in("pet_id", petIds).eq("uploader_user_id", userId);
      if (error) return [];
      rows = [...rows, ...(added ?? [])];
    }
  }
  rows = rows.filter((photo) => canUsePhotoInAlbum(eligibility, photo, userId));
  // Preserve the recent-80 selection contract; only avoid signing discarded cover candidates.
  if (options?.restrictPhotoIds) {
    const allowed = new Set(options.restrictPhotoIds);
    rows = rows.filter((photo) => allowed.has(photo.id));
  }
  const previews = await createPhotoPreviewUrls(supabase, rows, true, false, userId);
  const listed = await createListImageUrls(supabase, rows, userId);
  return rows.flatMap((photo) => {
    const src = previews.get(photo.id);
    if (!src) return [];
    return [{ id: String(photo.id), src, thumb: photo.thumbnail_path ? (listed.signedUrlByPath.get(photo.thumbnail_path) ?? src) : src }];
  });
}
