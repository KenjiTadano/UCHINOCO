import { notFound, redirect } from "next/navigation";
import { createAlbumRequestContext } from "@/lib/album-persistence/request-context";
import { loadRequestEditorCandidates } from "@/lib/album-persistence/editor-candidates";
import { EDITOR_MISSING_DRAFT_MESSAGE, editorIsReadonly } from "@/lib/album-persistence/editor";
import { readDraft } from "@/lib/album-persistence/read-draft";
import { createClient } from "@/lib/supabase/server";
import { PageEditScreen } from "./page-edit-screen";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { findNewPhotoSuggestion } from "@/lib/album-new-photo-suggestions";
import { NewPhotoSuggestionNotice } from "../../new-photo-suggestion";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
  searchParams: Promise<{ spread?: string }>;
};

export default async function PageEditPage({ params, searchParams }: Props) {
  const { petId, albumId } = await params;
  const { spread: spreadParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const context = createAlbumRequestContext(supabase, user.id);
  const album = await context.album(albumId);
  if (!album || album.owner_user_id !== user.id || album.pet_id !== petId) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  // Saved draft only. Opening the editor does not regenerate the album or call Vision.
  const [view, candidates, suggestion] = await Promise.all([
    readDraft(supabase, albumId, undefined, context),
    loadRequestEditorCandidates(supabase, context, petId, albumId, { routePetVerified: true }),
    findNewPhotoSuggestion(supabase, { albumId, routePetId: petId, userId: user.id }, context),
  ]);
  if (view) await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: view.versionId, eventType: "album_edit_started", eventKey: view.versionId });
  const parsed = Number.parseInt(spreadParam ?? "0", 10);
  const initialIndex = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const base = `/pets/${petId}/album/${albumId}`;
  const loadError = view ? null : EDITOR_MISSING_DRAFT_MESSAGE;

  return (
    <>
      {suggestion && !suggestion.dismissed ? <div className="mx-auto w-full max-w-2xl px-4 pt-3"><NewPhotoSuggestionNotice href={`${base}/new-photos`} count={suggestion.candidates.length} /></div> : null}
      <PageEditScreen
        key={view?.versionId ?? albumId}
        view={view}
        albumId={albumId}
        readonly={editorIsReadonly(album.status)}
        loadError={loadError}
        candidatePhotos={(view ? candidates : []).map((photo) => ({
          id: photo.id,
          src: photo.src,
          thumb: photo.thumb,
          alt: `${pet.name}の写真`,
        }))}
        initialIndex={initialIndex}
        backHref={`${base}/edit`}
        doneHref={`${base}/edit`}
        generateHref={`/pets/${petId}/album/new`}
        printHref={`${base}/print`}
      />
    </>
  );
}
