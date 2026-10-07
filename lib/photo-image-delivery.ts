import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_IMAGE_DELIVERY = {
  thumbnail: { width: 400, height: 400, quality: 76, maxSizeBytes: 1_048_576, cacheControl: "3600" },
  preview: { maxDimension: 1600, quality: 82, maxSizeBytes: 1_048_576, cacheControl: "3600" },
  signedUrlSeconds: 3600,
  signedUrlCacheMs: 50 * 60 * 1000,
} as const;

export const ORIGINAL_PHOTO_BUCKET = "pet-photos";
export const PHOTO_IMAGE_BUCKET = "pet-photo-thumbnails";

type PhotoImagePath = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
};
export type PhotoPreviewDeliveryClass = "thumbnail" | "preview" | "original";

type SignedImageCache = { url: string; expiresAt: number };

const signedUrlCache = new Map<string, SignedImageCache>();
const previewPresenceCache = new Map<string, { exists: boolean; expiresAt: number }>();
const PRESENCE_CACHE_MS = 10 * 60 * 1000;

function cacheKey(userId: string, bucket: string, path: string) {
  return `${userId}\u0000${bucket}\u0000${path}`;
}

function prune<T extends { expiresAt: number }>(cache: Map<string, T>, now: number) {
  if (cache.size < 2000) return;
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  while (cache.size >= 2500) cache.delete(cache.keys().next().value as string);
}

export function photoPreviewPath(storagePath: string) {
  const parts = storagePath.split("/");
  const name = parts.pop() ?? "";
  const stem = name.replace(/\.(?:jpe?g|png|webp)$/i, "");
  if (!stem || stem === name) return null;
  return [...parts, `${stem}.preview.webp`].join("/");
}

export async function createCachedSignedImageUrls(supabase: SupabaseClient, userId: string, bucket: string, paths: string[], ttl = PHOTO_IMAGE_DELIVERY.signedUrlSeconds, refresh = false) {
  const unique = [...new Set(paths)];
  const now = Date.now();
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of unique) {
    const cached = refresh ? null : signedUrlCache.get(cacheKey(userId, bucket, path));
    if (cached && cached.expiresAt > now + 30_000) urls.set(path, cached.url);
    else missing.push(path);
  }
  if (missing.length === 0) return { urls, error: null };
  const result = await supabase.storage.from(bucket).createSignedUrls(missing, ttl);
  const expiresAt = now + Math.min(ttl * 1000, PHOTO_IMAGE_DELIVERY.signedUrlCacheMs);
  prune(signedUrlCache, now);
  for (const item of result.data ?? []) {
    if (!item.path || !item.signedUrl || item.error) continue;
    urls.set(item.path, item.signedUrl);
    signedUrlCache.set(cacheKey(userId, bucket, item.path), { url: item.signedUrl, expiresAt });
  }
  return { urls, error: result.error };
}

export async function createPhotoPreviewDelivery(supabase: SupabaseClient, photos: PhotoImagePath[], fallbackToOriginal = true, refresh = false, userIdOverride?: string) {
  const auth = userIdOverride ? null : await supabase.auth.getUser();
  const userId = userIdOverride ?? auth?.data.user?.id;
  if (!userId || photos.length === 0) return { urls: new Map<string, string>(), sourceByPhotoId: new Map<string, PhotoPreviewDeliveryClass>() };
  const now = Date.now();
  const result = new Map<string, string>();
  const sourceByPhotoId = new Map<string, PhotoPreviewDeliveryClass>();
  const previewPaths = new Map<string, string>();
  for (const photo of photos) {
    const path = photoPreviewPath(photo.storage_path);
    if (path) previewPaths.set(photo.id, path);
  }
  const missingOriginals: string[] = [];
  const missingThumbnails: Array<{ photoId: string; path: string }> = [];
  const presenceChecks: Array<{ photoId: string; path: string }> = [];

  const thumbnailPathByPhoto = new Map(photos.filter((photo) => photo.thumbnail_path).map((photo) => [photo.id, photo.thumbnail_path!]));

  for (const [photoId, path] of previewPaths) {
    const key = cacheKey(userId, PHOTO_IMAGE_BUCKET, path);
    const signed = refresh ? null : signedUrlCache.get(key);
    if (signed && signed.expiresAt > now + 30_000) {
      result.set(photoId, signed.url);
      sourceByPhotoId.set(photoId, "preview");
      continue;
    }
    const presence = refresh ? null : previewPresenceCache.get(key);
    if (presence && presence.expiresAt > now) {
      if (presence.exists) presenceChecks.push({ photoId, path });
      else if (fallbackToOriginal) {
        const thumbnailPath = thumbnailPathByPhoto.get(photoId);
        if (thumbnailPath) missingThumbnails.push({ photoId, path: thumbnailPath });
        else missingOriginals.push(photoId);
      }
      continue;
    }
    // A normal page GET must not fan out into one Storage metadata request per
    // photo. Unknown preview assets safely use the stored thumbnail/original.
    // Explicit refreshes may probe Storage after an upload/backfill operation.
    if (refresh) presenceChecks.push({ photoId, path });
    else if (fallbackToOriginal) {
      const thumbnailPath = thumbnailPathByPhoto.get(photoId);
      if (thumbnailPath) missingThumbnails.push({ photoId, path: thumbnailPath });
      else missingOriginals.push(photoId);
    }
  }

  const checked = await Promise.all(
    presenceChecks.map(async ({ photoId, path }) => {
      const key = cacheKey(userId, PHOTO_IMAGE_BUCKET, path);
      const info = await supabase.storage.from(PHOTO_IMAGE_BUCKET).info(path);
      const exists = !info.error && Boolean(info.data) && Number(info.data.size) > 0 && Number(info.data.size) <= PHOTO_IMAGE_DELIVERY.preview.maxSizeBytes && info.data.contentType === "image/webp";
      previewPresenceCache.set(key, { exists, expiresAt: now + PRESENCE_CACHE_MS });
      return { photoId, path, exists };
    }),
  );
  for (const item of checked) {
    if (item.exists) continue;
    if (fallbackToOriginal) {
      const thumbnailPath = thumbnailPathByPhoto.get(item.photoId);
      if (thumbnailPath) missingThumbnails.push({ photoId: item.photoId, path: thumbnailPath });
      else missingOriginals.push(item.photoId);
    }
  }

  const previewPathsToSign = [
    ...presenceChecks.filter(({ photoId }) => checked.find((item) => item.photoId === photoId)?.exists).map((item) => item.path),
    ...[...previewPaths.entries()]
      .filter(([photoId, path]) => {
        const presence = previewPresenceCache.get(cacheKey(userId, PHOTO_IMAGE_BUCKET, path));
        return Boolean(presence?.exists && !result.has(photoId) && !presenceChecks.some((check) => check.photoId === photoId));
      })
      .map(([, path]) => path),
  ];
  if (previewPathsToSign.length > 0) {
    const signed = await createCachedSignedImageUrls(supabase, userId, PHOTO_IMAGE_BUCKET, previewPathsToSign, PHOTO_IMAGE_DELIVERY.signedUrlSeconds, refresh);
    for (const [photoId, path] of previewPaths) {
      const url = signed.urls.get(path);
      if (url) {
        result.set(photoId, url);
        sourceByPhotoId.set(photoId, "preview");
      }
    }
  }

  if (missingThumbnails.length > 0) {
    const thumbnails = await createCachedSignedImageUrls(
      supabase,
      userId,
      PHOTO_IMAGE_BUCKET,
      missingThumbnails.map((item) => item.path),
    );
    for (const item of missingThumbnails) {
      const url = thumbnails.urls.get(item.path);
      if (url) {
        result.set(item.photoId, url);
        sourceByPhotoId.set(item.photoId, "thumbnail");
      } else {
        missingOriginals.push(item.photoId);
      }
    }
  }

  const originalPaths = photos.filter((photo) => missingOriginals.includes(photo.id)).map((photo) => photo.storage_path);
  if (originalPaths.length > 0) {
    const originals = await createCachedSignedImageUrls(supabase, userId, ORIGINAL_PHOTO_BUCKET, originalPaths, PHOTO_IMAGE_DELIVERY.signedUrlSeconds, refresh);
    for (const photo of photos) {
      const url = originals.urls.get(photo.storage_path);
      if (url) {
        result.set(photo.id, url);
        sourceByPhotoId.set(photo.id, "original");
      }
    }
  }
  return { urls: result, sourceByPhotoId };
}

export async function createPhotoPreviewUrls(supabase: SupabaseClient, photos: PhotoImagePath[], fallbackToOriginal = true, refresh = false, userId?: string) {
  return (await createPhotoPreviewDelivery(supabase, photos, fallbackToOriginal, refresh, userId)).urls;
}

export function clearPhotoImageUrlCacheForTests() {
  signedUrlCache.clear();
  previewPresenceCache.clear();
}

export function rememberPhotoPreviewPresent(userId: string, path: string) {
  previewPresenceCache.set(cacheKey(userId, PHOTO_IMAGE_BUCKET, path), {
    exists: true,
    expiresAt: Date.now() + PRESENCE_CACHE_MS,
  });
}
