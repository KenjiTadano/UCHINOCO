import { notFound, redirect } from "next/navigation";
import { mapDraftCoverRow, toCoverEditor } from "@/lib/album-persistence/cover";
import { readDraft, signedPreviewUrls } from "@/lib/album-persistence/read-draft";
import { createClient } from "@/lib/supabase/server";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { inspectAlbumPrint } from "./actions";
import { PrintPreviewScreen } from "./print-preview-screen";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumPrintPreviewPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: album } = await supabase.from("albums").select("id, owner_user_id, pet_id, status, period_from, period_to").eq("id", albumId).eq("owner_user_id", user.id).eq("pet_id", petId).maybeSingle();
  if (!album) notFound();

  const { data: pet } = await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) notFound();

  const view = await readDraft(supabase, albumId);
  if (view) await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: view.versionId, eventType: "print_preview_opened", eventKey: view.versionId });
  const inspection = await inspectAlbumPrint(petId, albumId);
  let cover = null;
  if (view) {
    const { data: coverRow } = await supabase.from("album_draft_covers").select("*").eq("draft_version_id", view.versionId).maybeSingle();
    if (coverRow) {
      const row = mapDraftCoverRow(coverRow);
      const urls = await signedPreviewUrls(
        supabase,
        [row.aiPhotoId, row.userPhotoId].filter((id): id is string => Boolean(id)),
      );
      cover = toCoverEditor(row, Object.fromEntries(urls));
    }
  }

  return <PrintPreviewScreen petId={petId} albumId={albumId} petName={pet.name} dateLabel={formatAlbumPeriodLabels(album.period_from, album.period_to).coverDateLabel} cover={cover} view={inspection.ordered ? null : view} initial={inspection} editorHref={`/pets/${petId}/album/${albumId}/pages/edit`} />;
}
