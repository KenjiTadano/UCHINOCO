import { PHOTO_IMAGE_DELIVERY } from "./photo-image-delivery.ts";

const THUMBNAIL_SIZE = PHOTO_IMAGE_DELIVERY.thumbnail.width;
const THUMBNAIL_QUALITY = PHOTO_IMAGE_DELIVERY.thumbnail.quality / 100;

export async function createPhotoThumbnail(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - side) / 2;
    const sourceY = (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY));
    if (!blob || blob.type !== "image/webp" || blob.size <= 0) {
      throw new Error("Thumbnail conversion failed");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function createPhotoPreview(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, PHOTO_IMAGE_DELIVERY.preview.maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [PHOTO_IMAGE_DELIVERY.preview.quality / 100, 0.72, 0.62]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob?.type === "image/webp" && blob.size > 0 && blob.size <= PHOTO_IMAGE_DELIVERY.preview.maxSizeBytes) return blob;
    }
    throw new Error("Preview conversion exceeded the storage limit");
  } finally {
    bitmap.close();
  }
}

export const PHOTO_THUMBNAIL_SIZE = THUMBNAIL_SIZE;
export const PHOTO_THUMBNAIL_QUALITY = THUMBNAIL_QUALITY;
