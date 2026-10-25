import { sourceReuseEnabled } from "@/lib/album-persistence/source-reuse-mode";
import { createRouteReadContext } from "@/lib/album-persistence/route-read-context";
import { traceRouteLoader } from "@/lib/album-persistence/route-loader-trace";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { loadRouteCandidates } from "@/lib/album-persistence/route-candidates";
import { EDITOR_MISSING_DRAFT_MESSAGE, editorIsReadonly } from "@/lib/album-persistence/editor";
import { readDraft } from "@/lib/album-persistence/read-draft";
import { createClient } from "@/lib/supabase/server";
import { PageEditScreen } from "./page-edit-screen";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { findNewPhotoSuggestion } from "@/lib/album-new-photo-suggestions";
import { NewPhotoSuggestionNotice } from "../../new-photo-suggestion";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
  searchParams: Promise<{ spread?: string; sourceReuse?: string | string[] }>;
};

export default async function PageEditPage({ params, searchParams }: Props) {
  const { petId, albumId } = await params;
  const { spread: spreadParam, sourceReuse } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await traceRouteLoader("pre-draft-auth", () => supabase.auth.getUser());
  if (userError || !user) redirect("/login");

  const [{ data: album, error: albumError }, { data: pet }] = await Promise.all([
    traceRouteLoader("album", () => supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, status, title, period_from, period_to, cover_photo_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle()),
    traceRouteLoader("pet", () => supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle()),
  ]);
  if (albumError || !album || !pet) notFound();
  const context = createRouteReadContext(supabase, user.id, album, sourceReuseEnabled(sourceReuse));


  // Saved draft only. Opening the editor does not regenerate the album or call Vision.
  const [view, candidates, suggestion] = await Promise.all([
    traceRouteLoader("draft", () => readDraft(supabase, albumId, undefined, context)),
    traceRouteLoader("candidates", () => loadRouteCandidates(supabase, context)),
    traceRouteLoader("suggestion", () => findNewPhotoSuggestion(supabase, { albumId, routePetId: petId, userId: user.id }, context)),
  ]);
  if (view) await traceRouteLoader("analytics-scheduling", () => undefined);
  if (view) after(() => recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: view.versionId, eventType: "album_edit_started", eventKey: view.versionId }).then(() => {}));
  const parsed = Number.parseInt(spreadParam ?? "0", 10);
  const initialIndex = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const base = `/pets/${petId}/album/${albumId}`;

  const loadError = view ? null : EDITOR_MISSING_DRAFT_MESSAGE;


  await traceRouteLoader("return-boundary", () => undefined);
  return (
    <>
      {view && suggestion && !suggestion.dismissed ? <div className="mx-auto w-full max-w-2xl px-4 pt-3"><NewPhotoSuggestionNotice href={`${base}/new-photos`} count={suggestion.candidates.length} /></div> : null}
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
