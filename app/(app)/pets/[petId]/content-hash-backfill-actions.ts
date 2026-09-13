"use server";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ContentHashBackfillResult = {
  success: boolean;
  processed: number;
  failed: number;
  remaining: number;
  message: string;
};

export async function backfillPhotoContentHashes(petId: string): Promise<ContentHashBackfillResult> {
  const failedResult = (message: string): ContentHashBackfillResult => ({ success: false, processed: 0, failed: 0, remaining: 0, message });
  if (!UUID_PATTERN.test(petId)) return failedResult("写真を確認できませんでした。");

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return failedResult("ログイン状態を確認してください。");
  const client = supabase as unknown as SupabaseClient;
  const { data: pet } = await client.from("pets").select("id, owner_user_id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet || pet.owner_user_id !== user.id) return failedResult("写真を確認できませんでした。");

  const { data: photos, error: photosError } = await client.from("photos")
    .select("id, storage_path")
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .is("content_hash", null)
    .is("content_hash_backfilled_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (photosError) return failedResult("既存写真を確認できませんでした。");

  let processed = 0;
  let failed = 0;
  for (const photo of photos ?? []) {
    const download = await supabase.storage.from("pet-photos").download(photo.storage_path);
    if (download.error || !download.data) { failed += 1; continue; }
    const hash = createHash("sha256").update(Buffer.from(await download.data.arrayBuffer())).digest("hex");
    const { data: duplicate } = await client.from("photos").select("id").eq("pet_id", petId).eq("uploader_user_id", user.id).eq("content_hash", hash).neq("id", photo.id).limit(1).maybeSingle();
    const update = duplicate
      ? { content_hash_backfilled_at: new Date().toISOString() }
      : { content_hash: hash, content_hash_backfilled_at: new Date().toISOString() };
    const { error: updateError } = await client.from("photos").update(update).eq("id", photo.id).eq("pet_id", petId).eq("uploader_user_id", user.id).is("content_hash", null).is("content_hash_backfilled_at", null);
    if (updateError?.code === "23505") {
      const { data: confirmed } = await client.from("photos").select("id").eq("pet_id", petId).eq("uploader_user_id", user.id).eq("content_hash", hash).neq("id", photo.id).limit(1).maybeSingle();
      if (confirmed) {
        const retry = await client.from("photos").update({ content_hash_backfilled_at: new Date().toISOString() }).eq("id", photo.id).eq("pet_id", petId).eq("uploader_user_id", user.id).is("content_hash", null);
        if (!retry.error) { processed += 1; continue; }
      }
    }
    if (updateError) failed += 1;
    else processed += 1;
  }

  const { count } = await client.from("photos").select("id", { count: "exact", head: true }).eq("pet_id", petId).eq("uploader_user_id", user.id).is("content_hash", null).is("content_hash_backfilled_at", null);
  const remaining = count ?? failed;
  return { success: true, processed, failed, remaining, message: remaining === 0 ? "既存写真の確認が完了しました。" : failed ? `${processed}枚を確認しました。${failed}枚は後でもう一度試せます。` : `${processed}枚を確認しました。続けて確認できます。` };
}
