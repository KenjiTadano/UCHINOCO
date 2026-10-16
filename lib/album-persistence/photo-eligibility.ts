/** Replacement authorization, independent of generation selection or photo usage. */
export type AlbumPhotoEligibility = { ownerUserId: string; allowedPetIds: readonly string[] };
export function canUsePhotoInAlbum(
  album: AlbumPhotoEligibility | null,
  photo: { pet_id: string; uploader_user_id: string } | null,
  userId: string,
): boolean {
  return !!album && !!photo && album.ownerUserId === userId &&
    photo.uploader_user_id === userId && album.allowedPetIds.includes(photo.pet_id);
}
