"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlbumMutationState = { success: boolean; message: string | null };

const ok: AlbumMutationState = { success: true, message: null };
const err = (msg: string): AlbumMutationState => ({ success: false, message: msg });

/** Verify album ownership: returns album or null. */
async function resolveAlbum(petId: string, albumId: string) {
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(albumId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!album || album.owner_user_id !== user.id || album.pet_id !== petId) return null;
  return { supabase, user, album };
}

// ── Title ────────────────────────────────────────────────────────────────────

export async function updateAlbumTitle(
  petId: string,
  albumId: string,
  _prev: AlbumMutationState,
  formData: FormData,
): Promise<AlbumMutationState> {
  const ctx = await resolveAlbum(petId, albumId);
  if (!ctx) return err("認証エラーが発生しました。");

  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  if (!title) return err("タイトルを入力してください。");

  const { error } = await ctx.supabase
    .from("albums")
    .update({ title })
    .eq("id", albumId);

  if (error) return err("タイトルの保存に失敗しました。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  revalidatePath(`/pets/${petId}/album`);
  return { success: true, message: "保存しました。" };
}

// ── Photo remove ─────────────────────────────────────────────────────────────

export async function removeAlbumPhoto(
  petId: string,
  albumId: string,
  photoId: string,
): Promise<AlbumMutationState> {
  if (!UUID_PATTERN.test(photoId)) return err("無効なリクエストです。");
  const ctx = await resolveAlbum(petId, albumId);
  if (!ctx) return err("認証エラーが発生しました。");

  const { error } = await ctx.supabase
    .from("album_photos")
    .delete()
    .eq("album_id", albumId)
    .eq("photo_id", photoId);

  if (error) return err("写真の削除に失敗しました。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  return ok;
}

// ── Photo add ────────────────────────────────────────────────────────────────
// Used both as a plain form action (add/page.tsx) and directly from client code.
// Returns void so it can be used as <form action={...}> without useActionState.

export async function addAlbumPhoto(
  petId: string,
  albumId: string,
  photoId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(photoId)) return;
  const ctx = await resolveAlbum(petId, albumId);
  if (!ctx) return;

  // Verify photo belongs to the pet and the user (primary scope, IDOR check)
  const { data: photo } = await ctx.supabase
    .from("photos")
    .select("id, pet_id, uploader_user_id")
    .eq("id", photoId)
    .eq("pet_id", petId)
    .eq("uploader_user_id", ctx.user.id)
    .maybeSingle();

  if (!photo) return;

  // Append at end: find current max position
  const { data: last } = await ctx.supabase
    .from("album_photos")
    .select("position")
    .eq("album_id", albumId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos = (last?.position ?? -1) + 1;

  await ctx.supabase.from("album_photos").upsert(
    { album_id: albumId, photo_id: photoId, position: nextPos, selected_by: "user" },
    { onConflict: "album_id,photo_id", ignoreDuplicates: true },
  );

  revalidatePath(`/pets/${petId}/album/${albumId}`);
  revalidatePath(`/pets/${petId}/album/${albumId}/add`);
}

// ── Reorder ──────────────────────────────────────────────────────────────────
// Accepts photo IDs in the desired order from hidden inputs; assigns positions 0…N-1.

export async function reorderAlbumPhotos(
  petId: string,
  albumId: string,
  _prev: AlbumMutationState,
  formData: FormData,
): Promise<AlbumMutationState> {
  const ctx = await resolveAlbum(petId, albumId);
  if (!ctx) return err("認証エラーが発生しました。");

  const photoIds = formData.getAll("photo_order").map(String).filter((id) => UUID_PATTERN.test(id));
  if (photoIds.length === 0) return err("並び替えデータが不正です。");

  const positions = photoIds.map((photo_id, index) => ({ photo_id, position: index }));

  const { error } = await ctx.supabase.rpc("reorder_album_photos", {
    p_album_id: albumId,
    p_positions: positions,
  });

  if (error) return err("並び替えの保存に失敗しました。");
  revalidatePath(`/pets/${petId}/album/${albumId}`);
  return { success: true, message: "並び替えを保存しました。" };
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAlbum(
  petId: string,
  albumId: string,
): Promise<AlbumMutationState> {
  const ctx = await resolveAlbum(petId, albumId);
  if (!ctx) return err("認証エラーが発生しました。");

  // album_photos are deleted via ON DELETE CASCADE
  const { error } = await ctx.supabase
    .from("albums")
    .delete()
    .eq("id", albumId);

  if (error) return err("アルバムの削除に失敗しました。");

  revalidatePath(`/pets/${petId}/album`);
  redirect(`/pets/${petId}/album`);
}
