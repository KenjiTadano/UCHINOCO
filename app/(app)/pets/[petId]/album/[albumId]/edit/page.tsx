import { applyEditSourceCanary, recordEditCanaryAuthDeny } from "@/lib/album-persistence/edit-source-canary";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readDraft, signedPreviewUrls } from "@/lib/album-persistence/read-draft";
import { mapDraftCoverRow, toCoverEditor } from "@/lib/album-persistence/cover";
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
  if (userError || !user) { recordEditCanaryAuthDeny(); redirect("/login"); }

  const { data: album, error: albumError } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (albumError || !album) { recordEditCanaryAuthDeny(); notFound(); }
  if (album.status === "ordered") {
    redirect(`/pets/${petId}/album/${albumId}`);
  }

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) { recordEditCanaryAuthDeny(); notFound(); }

  const draft = await readDraft(supabase, albumId, {
    mapSignedUrls: fresh => applyEditSourceCanary(supabase, user.id, albumId, fresh),
  });
  const { monthLabel, coverDateLabel } = formatAlbumPeriodLabels(album.period_from, album.period_to);
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", monthLabel);
  const { data: coverRow } = draft ? await supabase.from("album_draft_covers").select("*").eq("draft_version_id", draft.versionId).maybeSingle() : { data: null };
  const source = coverRow ? mapDraftCoverRow(coverRow as unknown as Record<string, unknown>) : null;
  const coverIds = source ? [source.aiPhotoId, source.userPhotoId].filter((id): id is string => Boolean(id)) : album.cover_photo_id ? [album.cover_photo_id] : [];
  const coverUrls = await signedPreviewUrls(supabase, coverIds);
  const cover = source ? toCoverEditor(source, Object.fromEntries(coverUrls)) : null;
  const coverSrc = cover?.previewUrl ?? (album.cover_photo_id ? coverUrls.get(album.cover_photo_id) : null) ?? null;
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
