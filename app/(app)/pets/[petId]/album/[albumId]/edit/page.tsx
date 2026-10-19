import { readDraftCover } from "@/lib/album-persistence/read-cover";
import { createAlbumRequestContext } from "@/lib/album-persistence/request-context";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readDraft, signedPreviewUrls } from "@/lib/album-persistence/read-draft";
import { EDITOR_MISSING_DRAFT_MESSAGE } from "@/lib/album-persistence/editor";
import { buildCoverTitleLines, formatAlbumPeriodLabels } from "@/lib/album-cover-title";

import {
  AlbumEditScreen,
  type AlbumEditPageEntry,
} from "./album-edit-screen";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumEditPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const context = createAlbumRequestContext(supabase, user.id);
  const album = await context.album(albumId);
  if (!album || album.owner_user_id !== user.id || album.pet_id !== petId) notFound();
  if (album.status === "ordered") {
    redirect(`/pets/${petId}/album/${albumId}`);
  }

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  const draft = await readDraft(supabase, albumId, undefined, context);
  const { monthLabel, coverDateLabel } = formatAlbumPeriodLabels(album.period_from, album.period_to);
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", monthLabel);
  const cover = draft ? await readDraftCover(supabase, draft.versionId, draft.previewUrls, user.id) : null;
  const fallbackCoverUrls = !cover?.previewUrl && album.cover_photo_id && !draft?.previewUrls[album.cover_photo_id] ? await signedPreviewUrls(supabase, [album.cover_photo_id], false, user.id) : new Map<string, string>();
  const coverSrc = cover?.previewUrl ?? (album.cover_photo_id ? draft?.previewUrls[album.cover_photo_id] ?? fallbackCoverUrls.get(album.cover_photo_id) : null) ?? null;
  const pages: AlbumEditPageEntry[] = [{ kind: "cover", id: "cover", label: "表紙" }, ...(draft?.spreads.map((spread, index): AlbumEditPageEntry => ({ kind: "spread", id: spread.id, label: `${index * 2 + 1} - ${index * 2 + 2}`, spread })) ?? [])];
  const pageCount = (draft?.spreads.length ?? 0) * 2;

  const base = `/pets/${petId}/album/${albumId}`;

  return (
    <AlbumEditScreen
      petName={pet.name}
      coverSrc={coverSrc}
      dateLabel={cover?.subtitle ?? coverDateLabel}
      titlePrefix={cover ? "" : lines.prefix}
      titleMain={cover?.title ?? lines.main}
      pageCount={pageCount}
      pages={pages}
      draft={draft}
      cover={cover}
      loadError={draft ? null : EDITOR_MISSING_DRAFT_MESSAGE}
      selectedPageId="cover"
      backHref={`${base}?view=complete`}
      previewHref={`${base}?view=preview`}
      coverChangeHref={`${base}/cover/edit`}
      addPhotosHref={`${base}/add`}
      titleEditHref={base}
      doneHref={`${base}?view=complete`}
      pageEditHref={`${base}/pages/edit`}
    />
  );
}
