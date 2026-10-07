"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function owned(petId: string, albumId: string) {
  if (!UUID.test(petId) || !UUID.test(albumId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: album } = await supabase.from("albums").select("id,owner_user_id,pet_id,status").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle();
  const { data: version } = await supabase.from("album_draft_versions").select("id,status").eq("album_id", albumId).eq("is_active", true).maybeSingle();
  if (!album || !version || album.status !== "draft" || version.status === "locked") return null;
  return { supabase, user, version };
}

export async function applyPhotoPlacement(petId: string, albumId: string, remaining: string, formData: FormData) {
  const ctx = await owned(petId, albumId);
  const photoId = String(formData.get("photoId") ?? "");
  const layoutId = String(formData.get("layoutId") ?? "");
  const frameId = String(formData.get("frameId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const anchorSpreadId = String(formData.get("anchorSpreadId") ?? "");
  const fingerprint = String(formData.get("fingerprint") ?? "");
  if (!ctx || !UUID.test(photoId)) redirect(`/pets/${petId}/album/${albumId}?view=complete`);
  const rpc = ctx.supabase as unknown as SupabaseClient;
  const { data, error } = await rpc.rpc("apply_added_photo_placement", {
    p_album_id: albumId, p_route_pet_id: petId, p_expected_draft_version_id: ctx.version.id,
    p_expected_fingerprint: fingerprint, p_photo_id: photoId, p_mode: mode,
    p_anchor_spread_id: UUID.test(anchorSpreadId) ? anchorSpreadId : null,
    p_layout_id: layoutId, p_frame_id: frameId,
    p_crop_x: Number(formData.get("cropX")), p_crop_y: Number(formData.get("cropY")), p_crop_scale: Number(formData.get("cropScale")),
  });
  if (error) throw new Error("配置を反映できませんでした。もう一度お試しください。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  revalidatePath(`/pets/${petId}/album/${albumId}/pages/edit`);
  const next = remaining.split(",").filter((id) => UUID.test(id) && id !== photoId);
  const result = (data ?? {}) as { version_id?: string; parent_version_id?: string };
  redirect(next.length ? `/pets/${petId}/album/${albumId}/new-photos/placement?photoIds=${encodeURIComponent(next.join(","))}` : `/pets/${petId}/album/${albumId}/new-photos/placement?applied=1&placementVersion=${result.version_id ?? ""}&parentVersion=${result.parent_version_id ?? ""}`);
}

export async function undoPhotoPlacement(petId: string, albumId: string, placementVersionId: string, parentVersionId: string) {
  const ctx = await owned(petId, albumId);
  if (!ctx || !UUID.test(placementVersionId) || !UUID.test(parentVersionId)) redirect(`/pets/${petId}/album/${albumId}?view=complete`);
  const rpc = ctx.supabase as unknown as SupabaseClient;
  const { error } = await rpc.rpc("undo_added_photo_placement", { p_album_id: albumId, p_route_pet_id: petId, p_placement_version_id: placementVersionId, p_parent_version_id: parentVersionId });
  if (error) throw new Error("元に戻せませんでした。Draftの状態を確認してください。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  revalidatePath(`/pets/${petId}/album/${albumId}/pages/edit`);
  redirect(`/pets/${petId}/album/${albumId}/new-photos/placement?undone=1&placementVersion=${placementVersionId}&parentVersion=${parentVersionId}`);
}

export async function redoPhotoPlacement(petId: string, albumId: string, placementVersionId: string, parentVersionId: string) {
  const ctx = await owned(petId, albumId);
  if (!ctx || !UUID.test(placementVersionId) || !UUID.test(parentVersionId)) redirect(`/pets/${petId}/album/${albumId}?view=complete`);
  const rpc = ctx.supabase as unknown as SupabaseClient;
  const { error } = await rpc.rpc("redo_added_photo_placement", { p_album_id: albumId, p_route_pet_id: petId, p_placement_version_id: placementVersionId, p_parent_version_id: parentVersionId });
  if (error) throw new Error("やり直せませんでした。Draftの状態を確認してください。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  revalidatePath(`/pets/${petId}/album/${albumId}/pages/edit`);
  redirect(`/pets/${petId}/album/${albumId}/new-photos/placement?applied=1&placementVersion=${placementVersionId}&parentVersion=${parentVersionId}`);
}

export async function skipPhotoPlacement(petId: string, albumId: string, photoCount: number) {
  const ctx = await owned(petId, albumId);
  if (ctx) await recordAlbumAnalyticsEvent({ supabase: ctx.supabase, userId: ctx.user.id, albumId, draftVersionId: ctx.version.id, eventType: "new_photo_placement_skipped", eventKey: `${ctx.version.id}:skip`, eventData: { photo_count: Math.max(0, photoCount) } });
  redirect(`/pets/${petId}/album/${albumId}/pages/edit`);
}
