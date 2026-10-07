import type { SupabaseClient } from "@supabase/supabase-js";
import { createCachedSignedImageUrls, createPhotoPreviewDelivery, PHOTO_IMAGE_BUCKET, PHOTO_IMAGE_DELIVERY } from "./photo-image-delivery.ts";

type ListPhotoImage = {
  id?: string;
  storage_path: string;
  thumbnail_path: string | null;
};

export function listImagePath(photo: ListPhotoImage) {
  return photo.thumbnail_path ?? photo.storage_path;
}

export async function createListImageUrls(supabase: SupabaseClient, photos: ListPhotoImage[]) {
  if (photos.length === 0) {
    return { signedUrlByPath: new Map<string, string>(), error: null, deliveryCounts: { thumbnail: 0, preview: 0, original: 0 } };
  }
  const thumbnailPaths = Array.from(new Set(photos.flatMap((photo) => (photo.thumbnail_path ? [photo.thumbnail_path] : []))));
  const auth = supabase.auth?.getUser ? await supabase.auth.getUser() : null;
  const userId = auth?.data.user?.id;
  if (!userId) {
    const originalPaths = Array.from(new Set(photos.flatMap((photo) => (!photo.thumbnail_path ? [photo.storage_path] : []))));
    const empty = { data: [], error: null };
    const [thumbnails, originals] = await Promise.all([
      thumbnailPaths.length ? supabase.storage.from(PHOTO_IMAGE_BUCKET).createSignedUrls(thumbnailPaths, PHOTO_IMAGE_DELIVERY.signedUrlSeconds) : Promise.resolve(empty),
      originalPaths.length ? supabase.storage.from("pet-photos").createSignedUrls(originalPaths, PHOTO_IMAGE_DELIVERY.signedUrlSeconds) : Promise.resolve(empty),
    ]);
    const urls = new Map<string, string>();
    for (const item of [...(thumbnails.data ?? []), ...(originals.data ?? [])]) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    return { signedUrlByPath: urls, error: thumbnails.error ?? originals.error, deliveryCounts: { thumbnail: thumbnails.data?.length ?? 0, preview: 0, original: originals.data?.length ?? 0 } };
  }
  const thumbnails = await createCachedSignedImageUrls(supabase, userId, PHOTO_IMAGE_BUCKET, thumbnailPaths);
  const missingThumbnails = photos.filter((photo) => !photo.thumbnail_path || !thumbnails.urls.has(photo.thumbnail_path));
  const fallbackPreviews = await createPhotoPreviewDelivery(
    supabase,
    missingThumbnails.map((photo) => ({ ...photo, id: photo.id ?? photo.storage_path })),
    true,
    false,
    userId,
  );
  const signedUrlByPath = new Map(thumbnails.urls);
  const deliveryCounts = { thumbnail: 0, preview: 0, original: 0 };
  for (const photo of photos) {
    const path = listImagePath(photo);
    const thumbnail = photo.thumbnail_path ? thumbnails.urls.get(photo.thumbnail_path) : null;
    const fallback = fallbackPreviews.urls.get(photo.id ?? photo.storage_path);
    const src = thumbnail ?? fallback;
    if (!src) continue;
    signedUrlByPath.set(path, src);
    if (thumbnail) deliveryCounts.thumbnail += 1;
    else {
      const deliveryClass = fallbackPreviews.sourceByPhotoId.get(photo.id ?? photo.storage_path);
      deliveryCounts[deliveryClass ?? "original"] += 1;
    }
  }
  return { signedUrlByPath, error: thumbnails.error, deliveryCounts };
}
