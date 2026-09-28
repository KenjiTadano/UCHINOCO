/**
 * Identity of the image bytes behind a photo row.
 * photoId is not enough: replacing the file must miss the old analysis.
 *
 * photos has no file-size column. content_hash is the byte identity when present.
 * storage_path and updated_at cover rows that have not been hashed yet.
 */
export type PhotoSource = {
  storage_path: string;
  updated_at: string;
  content_hash: string | null;
};

const HASH = /^[0-9a-f]{64}$/;

export function sourceFingerprint(photo: PhotoSource): string {
  const hash = photo.content_hash && HASH.test(photo.content_hash) ? photo.content_hash : "none";
  return `src1|${photo.storage_path}|${hash}|${photo.updated_at}`;
}
