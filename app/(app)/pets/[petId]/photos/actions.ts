"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { parseTokyoLocalDateTime } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";

type PhotoMetadata = {
  clientId: string;
  mimeType: string;
  size: number;
};

export type SignedPhotoUpload = {
  clientId: string;
  path: string;
  token: string;
};

export type PreparePhotoUploadsResult = {
  success: boolean;
  message: string | null;
  uploads: SignedPhotoUpload[];
  failedCount: number;
};

export type FinalizePhotoUploadsResult = {
  savedCount: number;
  failedCount: number;
};

type FinalizePhotoUpload = {
  storagePath: string;
  takenAt: string | null;
};

const BUCKET = "pet-photos";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FUTURE_TOLERANCE_MILLISECONDS = 5 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function albumClient(client: Awaited<ReturnType<typeof createClient>>) {
  // Task 007 migration適用・型再生成までの一時的な型境界。
  return client as unknown as SupabaseClient;
}

function uploadYearMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: values.year, month: values.month };
}

function validMetadata(metadata: PhotoMetadata) {
  return (
    UUID_PATTERN.test(metadata.clientId) &&
    Boolean(IMAGE_EXTENSIONS[metadata.mimeType]) &&
    Number.isSafeInteger(metadata.size) &&
    metadata.size > 0 &&
    metadata.size <= MAX_FILE_SIZE
  );
}

async function ownedPet(client: SupabaseClient, petId: string, userId: string) {
  const { data, error } = await client
    .from("pets")
    .select("id, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  return !error && data?.owner_user_id === userId ? data : null;
}

export async function preparePhotoUploads(
  petId: string,
  metadata: PhotoMetadata[],
): Promise<PreparePhotoUploadsResult> {
  if (
    !UUID_PATTERN.test(petId) ||
    !Array.isArray(metadata) ||
    metadata.length === 0 ||
    metadata.length > MAX_FILES ||
    !metadata.every(validMetadata) ||
    new Set(metadata.map((item) => item.clientId)).size !== metadata.length
  ) {
    return {
      success: false,
      message: "選択した写真を確認してください。",
      uploads: [],
      failedCount: 0,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      success: false,
      message: "ログイン状態を確認してください。",
      uploads: [],
      failedCount: 0,
    };
  }

  const client = albumClient(supabase);
  if (!(await ownedPet(client, petId, user.id))) {
    return {
      success: false,
      message: "ペット情報を確認できませんでした。",
      uploads: [],
      failedCount: 0,
    };
  }

  const { year, month } = uploadYearMonth();
  const results = await Promise.all(
    metadata.map(async (item) => {
      const extension = IMAGE_EXTENSIONS[item.mimeType];
      const path = `${user.id}/${petId}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);

      return error || !data
        ? null
        : { clientId: item.clientId, path, token: data.token };
    }),
  );
  const uploads = results.filter(
    (result): result is SignedPhotoUpload => result !== null,
  );

  return {
    success: uploads.length > 0,
    message:
      uploads.length > 0 ? null : "写真のアップロード準備に失敗しました。",
    uploads,
    failedCount: metadata.length - uploads.length,
  };
}

export async function finalizePhotoUploads(
  petId: string,
  uploads: FinalizePhotoUpload[],
): Promise<FinalizePhotoUploadsResult> {
  const uploadCount = Array.isArray(uploads) ? uploads.length : 0;
  if (
    !UUID_PATTERN.test(petId) ||
    !Array.isArray(uploads) ||
    uploads.length === 0 ||
    uploads.length > MAX_FILES ||
    uploads.some(
      (upload) =>
        !upload ||
        typeof upload.storagePath !== "string" ||
        (upload.takenAt !== null && typeof upload.takenAt !== "string"),
    ) ||
    new Set(uploads.map((upload) => upload.storagePath)).size !== uploads.length
  ) {
    return { savedCount: 0, failedCount: uploadCount || 1 };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { savedCount: 0, failedCount: uploads.length };
  }

  const client = albumClient(supabase);
  if (!(await ownedPet(client, petId, user.id))) {
    return { savedCount: 0, failedCount: uploads.length };
  }

  let savedCount = 0;
  let failedCount = 0;

  for (const { storagePath, takenAt: takenAtInput } of uploads) {
    const pathParts = storagePath.split("/");
    const [pathUserId, pathPetId, year, month, fileName] = pathParts;
    const fileMatch = fileName?.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i,
    );
    const validPath =
      pathParts.length === 5 &&
      pathUserId === user.id &&
      pathPetId === petId &&
      /^\d{4}$/.test(year ?? "") &&
      /^(0[1-9]|1[0-2])$/.test(month ?? "") &&
      Boolean(fileMatch);

    if (!validPath || !fileMatch) {
      failedCount += 1;
      continue;
    }

    const takenAt = takenAtInput
      ? parseTokyoLocalDateTime(takenAtInput)
      : null;
    if (
      (takenAtInput && !takenAt) ||
      (takenAt &&
        takenAt.getTime() > Date.now() + FUTURE_TOLERANCE_MILLISECONDS)
    ) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      failedCount += 1;
      continue;
    }

    const folder = `${user.id}/${petId}/${year}/${month}`;
    const { data: objects, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folder, { limit: 2, search: fileName });
    const photoObject = objects?.find((object) => object.name === fileName);
    const expectedMimeType = EXTENSION_MIME_TYPES[fileMatch[2].toLowerCase()];
    const storedSize = Number(photoObject?.metadata?.size);
    const storedMimeType = photoObject?.metadata?.mimetype;

    if (
      listError ||
      !photoObject ||
      !Number.isSafeInteger(storedSize) ||
      storedSize <= 0 ||
      storedSize > MAX_FILE_SIZE ||
      storedMimeType !== expectedMimeType
    ) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      failedCount += 1;
      continue;
    }

    const { error: insertError } = await client.from("photos").insert({
      pet_id: petId,
      uploader_user_id: user.id,
      storage_path: storagePath,
      taken_at: takenAt?.toISOString() ?? null,
    });

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      failedCount += 1;
      continue;
    }

    savedCount += 1;
  }

  if (savedCount > 0) {
    revalidatePath(`/pets/${petId}`);
    revalidatePath("/home");
  }

  return { savedCount, failedCount };
}
