"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findNewPhotoSuggestion } from "@/lib/album-new-photo-suggestions";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(petId: string, albumId: string, fingerprint: string) {
  if (!UUID.test(petId) || !UUID.test(albumId) || !/^[a-f0-9]{64}$/.test(fingerprint)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const suggestion = await findNewPhotoSuggestion(supabase, { albumId, routePetId: petId, userId: user.id });
  if (!suggestion || suggestion.fingerprint !== fingerprint) return null;
  return { supabase, user, suggestion };
}

export async function dismissNewPhotos(petId: string, albumId: string, fingerprint: string) {
  const ctx = await context(petId, albumId, fingerprint);
  if (!ctx) redirect(`/pets/${petId}/album/${albumId}?view=complete`);
  const rpc = ctx.supabase as unknown as SupabaseClient;
  const { error } = await rpc.rpc("dismiss_suggested_album_photos", {
    p_album_id: albumId,
    p_route_pet_id: petId,
    p_expected_draft_version_id: ctx.suggestion.draftVersionId,
    p_expected_fingerprint: fingerprint,
    p_photo_count: ctx.suggestion.candidates.length,
  });
  if (error) throw new Error("提案を閉じられませんでした。もう一度お試しください。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  redirect(`/pets/${petId}/album/${albumId}?view=complete`);
}

export async function addSuggestedPhotos(petId: string, albumId: string, fingerprint: string, formData: FormData) {
  const ctx = await context(petId, albumId, fingerprint);
  if (!ctx) redirect(`/pets/${petId}/album/${albumId}?view=complete`);

  const allowed = new Set(ctx.suggestion.candidates.filter((photo) => !photo.alreadyInAlbum).map((photo) => photo.id));
  const requested = [...new Set(formData.getAll("photoId").map(String))].filter((id) => UUID.test(id) && allowed.has(id));
  if (requested.length === 0) redirect(`/pets/${petId}/album/${albumId}/new-photos`);

  const rpc = ctx.supabase as unknown as SupabaseClient;
  const { data, error } = await rpc.rpc("add_suggested_album_photos", {
    p_album_id: albumId,
    p_route_pet_id: petId,
    p_expected_draft_version_id: ctx.suggestion.draftVersionId,
    p_expected_fingerprint: fingerprint,
    p_selected_photo_ids: requested,
  });
  if (error) throw new Error("写真を追加できませんでした。もう一度お試しください。");
  const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const insertedPhotoIds = Array.isArray(result?.inserted_photo_ids) ? result.inserted_photo_ids.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (typeof result?.inserted_count === "number" && result.inserted_count > 0) {
    revalidatePath(`/pets/${petId}/album/${albumId}`);
    revalidatePath(`/pets/${petId}/album/${albumId}/pages/edit`);
  }
  if (insertedPhotoIds.length > 0) {
    redirect(`/pets/${petId}/album/${albumId}/new-photos/placement?photoIds=${encodeURIComponent(insertedPhotoIds.join(","))}`);
  }
  redirect(`/pets/${petId}/album/${albumId}?view=complete`);
}
