import { notFound, redirect } from "next/navigation";
import { loadActiveDraft, loadCoverEditor, loadEditorCandidates } from "@/app/(app)/album-draft-service";
import { buildCoverTitleLines, formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { EDITOR_MISSING_DRAFT_MESSAGE, editorIsReadonly } from "@/lib/album-persistence/editor";
import { createListImageUrls } from "@/lib/photo-list-images";
import { signedPreviewUrls } from "@/lib/album-persistence/read-draft";
import { createClient } from "@/lib/supabase/server";
import { CoverEditScreen } from "./cover-edit-screen";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function CoverEditPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: album, error: albumError } = await supabase.from("albums").select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id").eq("id", albumId).eq("owner_user_id", user.id).eq("pet_id", petId).maybeSingle();

  if (albumError || !album) notFound();

  const { data: pet } = await supabase.from("pets").select("id, name, owner_user_id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) notFound();

  const periodLabels = formatAlbumPeriodLabels(album.period_from, album.period_to);
  const periodMonthLabel = periodLabels.monthLabel;
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", periodMonthLabel);
  const { data: rawAlbumPhotos } = await supabase.from("album_photos").select("photo_id, position").eq("album_id", albumId).order("position", { ascending: true });
  const albumPhotoIds = (rawAlbumPhotos ?? []).map((row) => row.photo_id);
  const draft = albumPhotoIds.length === 0 ? await loadActiveDraft(albumId) : null;
  const draftPhotoId = draft?.view?.spreads.flatMap((spread) => spread.frames.map((frame) => frame.effectivePhotoId)).find(Boolean) ?? null;
  const initialPhotoId = (album.cover_photo_id && albumPhotoIds.includes(album.cover_photo_id) ? album.cover_photo_id : null) ?? albumPhotoIds[0] ?? draftPhotoId;
  const seed = {
    aiPhotoId: initialPhotoId,
    aiTitle: lines.main,
    aiSubtitle: lines.prefix,
  };

  // Saved draft only. Opening the cover editor does not regenerate the album or call Vision.
  const loaded = await loadCoverEditor(albumId, seed);
  const missing = !loaded.cover && loaded.message === EDITOR_MISSING_DRAFT_MESSAGE;
  const loadError = loaded.cover || missing ? null : loaded.message;
  const owned = loaded.cover ? await loadEditorCandidates(petId) : [];
  const ownedById = new Map(owned.map((photo) => [photo.id, photo]));
  const albumCandidates = albumPhotoIds.length
    ? albumPhotoIds.flatMap((id) => {
        const photo = ownedById.get(id);
        return photo ? [photo] : [];
      })
    : owned;
  if (albumCandidates.length === 0 && albumPhotoIds.length > 0) {
    const { data: photos } = await supabase.from("photos").select("id, storage_path, thumbnail_path").in("id", albumPhotoIds).eq("pet_id", petId);
    const previews = await signedPreviewUrls(
      supabase,
      (photos ?? []).map((photo) => photo.id),
    );
    const listed = await createListImageUrls(supabase, photos ?? []);
    for (const photo of photos ?? []) {
      const src = previews.get(photo.id);
      if (!src) continue;
      const thumb = photo.thumbnail_path ? (listed.signedUrlByPath.get(photo.thumbnail_path) ?? src) : src;
      albumCandidates.push({ id: photo.id, src, thumb });
    }
  }

  const base = `/pets/${petId}/album/${albumId}`;

  return (
    <CoverEditScreen
      petName={pet.name}
      dateLabel={periodLabels.coverDateLabel}
      cover={loaded.cover}
      seed={seed}
      albumId={albumId}
      candidates={albumCandidates.map((photo) => ({
        id: photo.id,
        src: photo.src,
        thumb: photo.thumb,
        alt: `${pet.name}の写真`,
      }))}
      readonly={editorIsReadonly(album.status)}
      loadError={loadError}
      missing={missing}
      backHref={`${base}/edit`}
      doneHref={`${base}/edit`}
      generateHref={`/pets/${petId}/album/new`}
    />
  );
}
