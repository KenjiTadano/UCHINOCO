/**
 * Guard for mutating albums.
 * Ordered albums must not be editable — UI hiding is insufficient;
 * Server Actions call this before any write.
 * draft albums are fully editable.
 */
export function isAlbumEditable(status: string): boolean {
  return status !== "ordered";
}

export const ALBUM_ORDERED_ERROR = "注文済みのアルバムは編集できません。";
