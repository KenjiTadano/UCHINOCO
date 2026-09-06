import type { SupabaseClient } from "@supabase/supabase-js";

type ListPhotoImage = {
  storage_path: string;
  thumbnail_path: string | null;
};

export function listImagePath(photo: ListPhotoImage) {
  return photo.thumbnail_path ?? photo.storage_path;
}

export async function createListImageUrls(
  supabase: SupabaseClient,
  photos: ListPhotoImage[],
) {
  const thumbnailPaths = Array.from(
    new Set(photos.flatMap((photo) => (photo.thumbnail_path ? [photo.thumbnail_path] : []))),
  );
  const originalPaths = Array.from(
    new Set(photos.flatMap((photo) => (!photo.thumbnail_path ? [photo.storage_path] : []))),
  );
  const empty = { data: [], error: null };
  const [thumbnails, originals] = await Promise.all([
    thumbnailPaths.length
      ? supabase.storage.from("pet-photo-thumbnails").createSignedUrls(thumbnailPaths, 3600)
      : Promise.resolve(empty),
    originalPaths.length
      ? supabase.storage.from("pet-photos").createSignedUrls(originalPaths, 3600)
      : Promise.resolve(empty),
  ]);
  const entries = [...(thumbnails.data ?? []), ...(originals.data ?? [])]
    .filter((item) => item.path && item.signedUrl && !item.error)
    .map((item) => [item.path as string, item.signedUrl as string] as const);
  return { signedUrlByPath: new Map(entries), error: thumbnails.error ?? originals.error };
}
