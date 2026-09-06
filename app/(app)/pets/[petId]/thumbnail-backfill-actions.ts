"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ORIGINAL_BUCKET = "pet-photos";
const THUMBNAIL_BUCKET = "pet-photo-thumbnails";
const BATCH_SIZE = 5;
const SIGNED_URL_SECONDS = 300;
const MAX_THUMBNAIL_SIZE = 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BackfillCursor = {
  createdAt: string;
  id: string;
};

type BackfillPhoto = {
  id: string;
  pet_id: string;
  uploader_user_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  created_at: string;
};

export type ThumbnailBackfillItem = {
  photoId: string;
  originalSignedUrl: string;
  thumbnailPath: string;
  thumbnailToken: string;
};

export type ThumbnailBackfillBatchResult = {
  success: boolean;
  message: string | null;
  items: ThumbnailBackfillItem[];
  failedCount: number;
  remainingCount: number;
  nextCursor: BackfillCursor | null;
};

export type FinalizeThumbnailBackfillResult = {
  success: boolean;
  skipped: boolean;
  message: string | null;
};

function databaseClient(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as SupabaseClient;
}

function parseCursor(cursor: BackfillCursor | null) {
  if (!cursor || !UUID_PATTERN.test(cursor.id)) return null;
  const date = new Date(cursor.createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  return { createdAt: date.toISOString(), id: cursor.id };
}

function thumbnailPathFromOriginal(
  storagePath: string,
  userId: string,
  petId: string,
) {
  const parts = storagePath.split("/");
  const [pathUserId, pathPetId, year, month, fileName] = parts;
  const match = fileName?.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i,
  );
  if (
    parts.length !== 5 ||
    pathUserId !== userId ||
    pathPetId !== petId ||
    !/^\d{4}$/.test(year ?? "") ||
    !/^(0[1-9]|1[0-2])$/.test(month ?? "") ||
    !match
  ) {
    return null;
  }
  return `${pathUserId}/${pathPetId}/${year}/${month}/${match[1]}.webp`;
}

function logBackfillFailure(
  stage: string,
  error: { code?: string; message?: string } | null,
  photoId?: string,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.error("Photo thumbnail backfill failed", {
    stage,
    code: error?.code,
    message: error?.message,
    photoId,
  });
}

async function getContext(petId: string) {
  if (!UUID_PATTERN.test(petId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const client = databaseClient(supabase);
  const { data: pet, error: petError } = await client
    .from("pets")
    .select("id, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !pet || pet.owner_user_id !== user.id) return null;
  return { supabase, client, user };
}

export async function prepareThumbnailBackfillBatch(
  petId: string,
  cursor: BackfillCursor | null,
): Promise<ThumbnailBackfillBatchResult> {
  const context = await getContext(petId);
  if (!context) {
    return {
      success: false,
      message: "写真を軽量化する権限を確認できませんでした。",
      items: [],
      failedCount: 0,
      remainingCount: 0,
      nextCursor: null,
    };
  }

  const parsedCursor = parseCursor(cursor);
  if (cursor && !parsedCursor) {
    return {
      success: false,
      message: "処理位置を確認できませんでした。もう一度お試しください。",
      items: [],
      failedCount: 0,
      remainingCount: 0,
      nextCursor: null,
    };
  }

  const { supabase, client, user } = context;
  let query = client
    .from("photos")
    .select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, created_at")
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .is("thumbnail_path", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(BATCH_SIZE);

  if (parsedCursor) {
    query = query.or(
      `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.id})`,
    );
  }

  const [photosResult, countResult] = await Promise.all([
    query,
    client
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", petId)
      .eq("uploader_user_id", user.id)
      .is("thumbnail_path", null),
  ]);
  if (photosResult.error || countResult.error) {
    logBackfillFailure("batch_query", photosResult.error ?? countResult.error);
    return {
      success: false,
      message: "対象の写真を取得できませんでした。もう一度お試しください。",
      items: [],
      failedCount: 0,
      remainingCount: 0,
      nextCursor: null,
    };
  }

  const photos = (photosResult.data ?? []) as BackfillPhoto[];
  const prepared = await Promise.all(
    photos.map(async (photo) => {
      const thumbnailPath = thumbnailPathFromOriginal(
        photo.storage_path,
        user.id,
        petId,
      );
      if (!thumbnailPath || photo.pet_id !== petId || photo.thumbnail_path !== null) {
        logBackfillFailure("path_validation", null, photo.id);
        return null;
      }
      const [original, thumbnail] = await Promise.all([
        supabase.storage
          .from(ORIGINAL_BUCKET)
          .createSignedUrl(photo.storage_path, SIGNED_URL_SECONDS),
        supabase.storage
          .from(THUMBNAIL_BUCKET)
          .createSignedUploadUrl(thumbnailPath),
      ]);
      if (original.error || !original.data || thumbnail.error || !thumbnail.data) {
        logBackfillFailure(
          "signed_url",
          original.error ?? thumbnail.error,
          photo.id,
        );
        return null;
      }
      return {
        photoId: photo.id,
        originalSignedUrl: original.data.signedUrl,
        thumbnailPath,
        thumbnailToken: thumbnail.data.token,
      };
    }),
  );
  const items = prepared.filter(
    (item): item is ThumbnailBackfillItem => item !== null,
  );
  const lastPhoto = photos.at(-1);

  return {
    success: true,
    message: null,
    items,
    failedCount: photos.length - items.length,
    remainingCount: countResult.count ?? 0,
    nextCursor: lastPhoto
      ? { createdAt: lastPhoto.created_at, id: lastPhoto.id }
      : null,
  };
}

export async function finalizeThumbnailBackfill(
  petId: string,
  photoId: string,
): Promise<FinalizeThumbnailBackfillResult> {
  if (!UUID_PATTERN.test(photoId)) {
    return { success: false, skipped: false, message: "写真を確認できませんでした。" };
  }
  const context = await getContext(petId);
  if (!context) {
    return { success: false, skipped: false, message: "写真を確認できませんでした。" };
  }
  const { supabase, client, user } = context;
  const { data: photo, error: photoError } = await client
    .from("photos")
    .select("id, pet_id, uploader_user_id, storage_path, thumbnail_path")
    .eq("id", photoId)
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .maybeSingle();
  if (photoError || !photo || photo.pet_id !== petId) {
    logBackfillFailure("photo_authorization", photoError, photoId);
    return { success: false, skipped: false, message: "写真を確認できませんでした。" };
  }

  const expectedPath = thumbnailPathFromOriginal(photo.storage_path, user.id, petId);
  if (!expectedPath) {
    logBackfillFailure("finalize_path_validation", null, photoId);
    return { success: false, skipped: false, message: "写真を確認できませんでした。" };
  }
  if (photo.thumbnail_path) {
    return photo.thumbnail_path === expectedPath
      ? { success: true, skipped: true, message: null }
      : { success: false, skipped: false, message: "写真を確認できませんでした。" };
  }

  const pathParts = expectedPath.split("/");
  const fileName = pathParts.at(-1)!;
  const folder = pathParts.slice(0, -1).join("/");
  const { data: objects, error: listError } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .list(folder, { limit: 2, search: fileName });
  const object = objects?.find((candidate) => candidate.name === fileName);
  const size = Number(object?.metadata?.size);
  if (
    listError ||
    !object ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_THUMBNAIL_SIZE ||
    object.metadata?.mimetype !== "image/webp"
  ) {
    logBackfillFailure("object_validation", listError, photoId);
    const { error: cleanupError } = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .remove([expectedPath]);
    if (cleanupError) {
      logBackfillFailure("object_validation_cleanup", cleanupError, photoId);
    }
    return { success: false, skipped: false, message: "サムネイルを確認できませんでした。" };
  }

  const { data: updated, error: updateError } = await client
    .from("photos")
    .update({ thumbnail_path: expectedPath })
    .eq("id", photoId)
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .is("thumbnail_path", null)
    .select("id, thumbnail_path")
    .maybeSingle();
  if (updateError || !updated || updated.thumbnail_path !== expectedPath) {
    const { data: current } = await client
      .from("photos")
      .select("thumbnail_path")
      .eq("id", photoId)
      .eq("pet_id", petId)
      .maybeSingle();
    if (current?.thumbnail_path === expectedPath) {
      return { success: true, skipped: true, message: null };
    }
    const { error: cleanupError } = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .remove([expectedPath]);
    logBackfillFailure("database_update", updateError, photoId);
    if (cleanupError) {
      logBackfillFailure("cleanup", cleanupError, photoId);
    }
    return { success: false, skipped: false, message: "写真の軽量化に失敗しました。" };
  }

  return { success: true, skipped: false, message: null };
}

export async function refreshThumbnailBackfillViews(petId: string) {
  if (!(await getContext(petId))) return;
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/album`);
  revalidatePath(`/pets/${petId}/favorites`);
  revalidatePath(`/pets/${petId}/search`);
  revalidatePath("/home");
}
