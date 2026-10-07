import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { clearPhotoImageUrlCacheForTests, createPhotoPreviewUrls, photoPreviewPath, PHOTO_IMAGE_DELIVERY } from "../lib/photo-image-delivery.ts";
import { createListImageUrls } from "../lib/photo-list-images.ts";

function storage(previewExists) {
  const calls = { signed: [], info: [] };
  return {
    calls,
    from(bucket) {
      return {
        async createSignedUrls(paths, expiresIn) {
          calls.signed.push({ bucket, paths, expiresIn });
          return { data: paths.map((path) => ({ path, signedUrl: `https://images.test/${bucket}/${path}?token=stable`, error: null })), error: null };
        },
        async info(path) {
          calls.info.push({ bucket, path });
          const exists = previewExists(path);
          return exists ? { data: { size: 200000, contentType: "image/webp" }, error: null } : { data: null, error: { message: "not found" } };
        },
      };
    },
  };
}

function client(previewExists = () => false) {
  const store = storage(previewExists);
  return {
    store,
    auth: {
      async getUser() {
        return { data: { user: { id: "owner-1" } } };
      },
    },
    storage: { from: store.from.bind(store) },
  };
}

test("preview path is deterministic without changing the photos row schema", () => {
  assert.equal(photoPreviewPath("owner/pet/2026/10/photo-id.jpg"), "owner/pet/2026/10/photo-id.preview.webp");
  assert.equal(PHOTO_IMAGE_DELIVERY.preview.maxDimension, 1600);
  assert.equal(PHOTO_IMAGE_DELIVERY.thumbnail.width, 400);
});

test("photo grids use thumbnail and stable signed URL caching", async () => {
  clearPhotoImageUrlCacheForTests();
  const supabase = client(() => false);
  const photo = { id: "photo-1", storage_path: "owner/pet/2026/10/photo-1.jpg", thumbnail_path: "owner/pet/2026/10/photo-1.webp" };
  const first = await createListImageUrls(supabase, [photo]);
  const second = await createListImageUrls(supabase, [photo]);
  assert.match(first.signedUrlByPath.get(photo.thumbnail_path), /pet-photo-thumbnails/);
  assert.deepEqual(first.deliveryCounts, { thumbnail: 1, preview: 0, original: 0 });
  assert.equal(second.signedUrlByPath.get(photo.thumbnail_path), first.signedUrlByPath.get(photo.thumbnail_path));
  assert.equal(supabase.store.calls.signed.length, 1);
});

test("normal GET avoids per-photo metadata probes and explicit refresh can discover a preview", async () => {
  clearPhotoImageUrlCacheForTests();
  const photo = { id: "photo-2", storage_path: "owner/pet/2026/10/photo-2.jpg", thumbnail_path: null };
  const withPreview = client((path) => path.endsWith("photo-2.preview.webp"));
  const initial = await createPhotoPreviewUrls(withPreview, [photo]);
  assert.match(initial.get(photo.id), /pet-photos/);
  assert.equal(withPreview.store.calls.info.length, 0);
  const preview = await createPhotoPreviewUrls(withPreview, [photo], true, true);
  assert.match(preview.get(photo.id), /photo-2\.preview\.webp/);
  assert.equal(withPreview.store.calls.info.length, 1);
  assert.equal(withPreview.store.calls.signed.length, 2);

  clearPhotoImageUrlCacheForTests();
  const legacy = client(() => false);
  const fallback = await createPhotoPreviewUrls(legacy, [photo]);
  assert.match(fallback.get(photo.id), /pet-photos/);
  assert.equal(legacy.store.calls.signed[0].bucket, "pet-photos");
});

test("legacy full-frame preview fallback prefers a stored thumbnail before original", async () => {
  clearPhotoImageUrlCacheForTests();
  const supabase = client(() => false);
  const photo = { id: "photo-legacy", storage_path: "owner/pet/2026/10/photo-legacy.jpg", thumbnail_path: "owner/pet/2026/10/photo-legacy.webp" };
  const preview = await createPhotoPreviewUrls(supabase, [photo]);
  assert.match(preview.get(photo.id), /pet-photo-thumbnails\/owner\/pet\/2026\/10\/photo-legacy\.webp/);
  assert.equal(supabase.store.calls.signed[0].bucket, "pet-photo-thumbnails");
});

test("list fallback resolves without Storage info fan-out when thumbnail is missing", async () => {
  clearPhotoImageUrlCacheForTests();
  const supabase = client((path) => path.endsWith("photo-3.preview.webp"));
  const photo = { id: "photo-3", storage_path: "owner/pet/2026/10/photo-3.png", thumbnail_path: null };
  const result = await createListImageUrls(supabase, [photo]);
  assert.match(result.signedUrlByPath.get(photo.storage_path), /pet-photos/);
  assert.deepEqual(result.deliveryCounts, { thumbnail: 0, preview: 0, original: 1 });
  assert.equal(supabase.store.calls.info.length, 0);
});

test("new uploads and backfill create storage PREVIEW assets while AI/Print keep originals", async () => {
  const [uploadForm, uploadAction, backfill, smartCrop, photoIntelligence, printAction] = await Promise.all([
    readFile("./app/(app)/pets/[petId]/photos/new/photo-upload-form.tsx", "utf8"),
    readFile("./app/(app)/pets/[petId]/photos/actions.ts", "utf8"),
    readFile("./app/(app)/pets/[petId]/thumbnail-backfill-actions.ts", "utf8"),
    readFile("./app/(app)/dev/smart-crop/actions.ts", "utf8"),
    readFile("./app/(app)/dev/photo-intelligence/actions.ts", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/print/actions.ts", "utf8"),
  ]);
  assert.match(uploadForm, /createPhotoPreview\(file\)/);
  assert.match(uploadForm, /upload\.previewPath/);
  assert.match(uploadAction, /photoPreviewPath\(path\)/);
  assert.match(uploadAction, /confirmedPreviewPath/);
  assert.match(backfill, /photoPreviewPath\(photo\.storage_path\)/);
  assert.match(backfill, /previewReady/);
  assert.match(smartCrop, /imageUrl: originalUrl/);
  assert.match(photoIntelligence, /imageUrl: originalUrl/);
  assert.match(printAction, /from\("pet-photos"\)\.download\(storagePath\)/);
});
