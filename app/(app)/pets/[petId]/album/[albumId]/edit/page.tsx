import { streamDraft } from "@/lib/album-persistence/progressive-draft";
import { traceAuthStage } from "@/lib/auth-performance";
import { measureEditRequest, measuredEditFetch, traceAlbumLoad } from "@/lib/album-load-trace";
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
  return traceAuthStage("page.edit", async () => {
  return measureEditRequest(() => loadAlbumEditPage({ params }));
  });
}

async function loadAlbumEditPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await traceAlbumLoad("edit.create-client", () => createClient(measuredEditFetch));
  const {
    data: { user },
    error: userError,
  } = await traceAlbumLoad("edit.auth", () => supabase.auth.getUser());
  if (userError || !user) redirect("/login");

  const context = createAlbumRequestContext(supabase, user.id);
  const [album, { data: pet }] = await Promise.all([
    traceAlbumLoad("edit.album", () => traceAuthStage("page.edit.owner", () => context.album(albumId))),
    traceAlbumLoad("edit.pet", () => supabase.from("pets").select("id, name, owner_user_id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle()),
  ]);
  if (!album || album.owner_user_id !== user.id || album.pet_id !== petId) notFound();
  if (album.status === "ordered") redirect(`/pets/${petId}/album/${albumId}`);
  if (!pet) notFound();

  const version = await context.version(albumId);
  const [metadata, cover] = await Promise.all([
    traceAlbumLoad("edit.read-draft", () => readDraft(supabase, albumId, version ? { resolveUrls: false } : undefined, context)),
    version ? traceAlbumLoad("edit.cover", () => readDraftCover(supabase, version.id, {}, user.id, context)) : Promise.resolve(null),
  ]);
  const draft = cover?.previewUrl || !version ? metadata : await readDraft(supabase, albumId, undefined, context);
  const stream = draft && version && cover?.previewUrl ? streamDraft(supabase, context, albumId, version, cover, draft) : undefined;
  const { monthLabel, coverDateLabel } = formatAlbumPeriodLabels(album.period_from, album.period_to);
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", monthLabel);
  const fallbackCoverUrls = !cover?.previewUrl && album.cover_photo_id && !draft?.previewUrls[album.cover_photo_id] ? await traceAlbumLoad("edit.cover-fallback-urls", () => signedPreviewUrls(supabase, [album.cover_photo_id!], false, user.id)) : new Map<string, string>();
  return traceAlbumLoad("edit.response-preparation", async () => {
  const coverSrc = cover?.previewUrl ?? (album.cover_photo_id ? draft?.previewUrls[album.cover_photo_id] ?? fallbackCoverUrls.get(album.cover_photo_id) : null) ?? null;
  const pages: AlbumEditPageEntry[] = [{ kind: "cover", id: "cover", label: "表紙" }, ...(draft?.spreads.map((spread, index): AlbumEditPageEntry => ({ kind: "spread", id: spread.id, label: `${index * 2 + 1} - ${index * 2 + 2}`, spread })) ?? [])];
  const pageCount = (draft?.spreads.length ?? 0) * 2;

  const base = `/pets/${petId}/album/${albumId}`;

  return (
    <AlbumEditScreen
      key={`${albumId}:${draft?.versionId}:${draft?.revision}:${cover?.revision}:${cover?.clientSeq}`}
      stream={stream}
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
      backHref={`${base}?view=preview`}
      previewHref={`${base}?view=preview`}
      coverChangeHref={`${base}/cover/edit`}
      addPhotosHref={`${base}/add`}
      titleEditHref={base}
      doneHref={`${base}?view=preview`}
      pageEditHref={`${base}/pages/edit`}
    />
  );
  });
}
