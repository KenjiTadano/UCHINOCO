import { notFound, redirect } from "next/navigation";
import { loadActiveDraft, loadEditorCandidates } from "@/app/(app)/album-draft-service";
import { EDITOR_MISSING_DRAFT_MESSAGE, editorIsReadonly } from "@/lib/album-persistence/editor";
import { createClient } from "@/lib/supabase/server";
import { PageEditScreen } from "./page-edit-screen";

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

  const { data: album, error: albumError } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, status")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (albumError || !album) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  // Saved draft only. Opening the editor does not regenerate the album or call Vision.
  const loaded = await loadActiveDraft(albumId);
  const parsed = Number.parseInt(spreadParam ?? "0", 10);
  const initialIndex = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const base = `/pets/${petId}/album/${albumId}`;
  const candidates = loaded.view ? await loadEditorCandidates(petId) : [];
  const loadError =
    loaded.view || loaded.message === EDITOR_MISSING_DRAFT_MESSAGE ? null : loaded.message;

  return (
    <PageEditScreen
      view={loaded.view}
      albumId={albumId}
      readonly={editorIsReadonly(album.status)}
      loadError={loadError}
      candidatePhotos={candidates.map((photo) => ({
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
  );
}
