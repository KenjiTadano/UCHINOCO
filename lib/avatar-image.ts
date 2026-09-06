import { convertHeicToJpeg, isHeicCandidate } from "@/lib/exif-date";
import { hasMatchingImageSignature } from "@/lib/image-signature";
import { createPhotoThumbnail } from "@/lib/photo-thumbnail";

export const AVATAR_SOURCE_MAX_SIZE = 5 * 1024 * 1024;
export const AVATAR_WEBP_MAX_SIZE = 1024 * 1024;
export const AVATAR_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const SOURCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAcceptedAvatarSource(file: File) {
  return SOURCE_MIME_TYPES.has(file.type) || isHeicCandidate(file);
}

export async function createAvatarWebp(source: Blob) {
  if (
    !SOURCE_MIME_TYPES.has(source.type) ||
    !(await hasMatchingImageSignature(source, source.type))
  ) {
    throw new Error("Unsupported avatar image");
  }

  // Avatar and photo list thumbnails intentionally share the same proven
  // 400px square crop implementation and encoding settings.
  const avatar = await createPhotoThumbnail(source);
  if (
    avatar.size > AVATAR_WEBP_MAX_SIZE ||
    !(await hasMatchingImageSignature(avatar, "image/webp"))
  ) {
    throw new Error("Avatar conversion failed");
  }
  return avatar;
}

export async function prepareAvatarUpload(file: File) {
  if (
    !isAcceptedAvatarSource(file) ||
    file.size <= 0 ||
    file.size > AVATAR_SOURCE_MAX_SIZE
  ) {
    throw new Error("Invalid avatar source");
  }

  const source = isHeicCandidate(file)
    ? await convertHeicToJpeg(file, AVATAR_SOURCE_MAX_SIZE)
    : file;
  if (!source) throw new Error("HEIC conversion failed");
  return createAvatarWebp(source);
}
