import { notFound, redirect } from "next/navigation";
import { loadActiveDraft } from "@/app/(app)/album-draft-service";
import { mapDraftCoverRow, toCoverEditor } from "@/lib/album-persistence/cover";
import { signedUrls } from "@/lib/album-persistence/read-draft";
import { createClient } from "@/lib/supabase/server";
import { inspectAlbumPrint } from "./actions";
import { PrintPreviewScreen } from "./print-preview-screen";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

function monthLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long" });
}

export default async function AlbumPrintPreviewPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, status, period_from, period_to")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();
  if (!album) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  const loaded = await loadActiveDraft(albumId);
  const inspection = await inspectAlbumPrint(petId, albumId);
  let cover = null;
  if (loaded.view) {
    const { data: coverRow } = await supabase
      .from("album_draft_covers")
      .select("*")
      .eq("draft_version_id", loaded.view.versionId)
      .maybeSingle();
    if (coverRow) {
      const row = mapDraftCoverRow(coverRow);
      const urls = await signedUrls(supabase, [row.aiPhotoId, row.userPhotoId].filter((id): id is string => Boolean(id)));
      cover = toCoverEditor(row, Object.fromEntries(urls));
    }
  }

  return (
    <PrintPreviewScreen
      petId={petId}
      albumId={albumId}
      petName={pet.name}
      dateLabel={monthLabel(album.period_to ?? album.period_from)}
      cover={cover}
      view={inspection.ordered ? null : loaded.view}
      initial={inspection}
      editorHref={`/pets/${petId}/album/${albumId}/pages/edit`}
    />
  );
}
