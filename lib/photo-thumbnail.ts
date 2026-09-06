const THUMBNAIL_SIZE = 400;
const THUMBNAIL_QUALITY = 0.76;

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
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      side,
      side,
      0,
      0,
      THUMBNAIL_SIZE,
      THUMBNAIL_SIZE,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY),
    );
    if (!blob || blob.type !== "image/webp" || blob.size <= 0) {
      throw new Error("Thumbnail conversion failed");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

export const PHOTO_THUMBNAIL_SIZE = THUMBNAIL_SIZE;
export const PHOTO_THUMBNAIL_QUALITY = THUMBNAIL_QUALITY;
