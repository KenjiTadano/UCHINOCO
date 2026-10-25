import { sourceReuseEnabled } from "@/lib/album-persistence/source-reuse-mode";
import { createRouteReadContext } from "@/lib/album-persistence/route-read-context";
import { traceRouteLoader } from "@/lib/album-persistence/route-loader-trace";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadRouteDraft } from "@/lib/album-persistence/load-route-draft";
import { EDITOR_MISSING_DRAFT_MESSAGE } from "@/lib/album-persistence/editor";
import { buildCoverTitleLines, formatAlbumPeriodLabels } from "@/lib/album-cover-title";

import {
  AlbumEditScreen,
  type AlbumEditPageEntry,
} from "./album-edit-screen";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
  searchParams: Promise<{ sourceReuse?: string | string[] }>;
};

export default async function AlbumEditPage({ params, searchParams }: Props) {
  const { petId, albumId } = await params;
  const reuse = sourceReuseEnabled((await searchParams)?.sourceReuse);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await traceRouteLoader("pre-draft-auth", () => supabase.auth.getUser());
  if (userError || !user) redirect("/login");

  const [{ data: album, error: albumError }, { data: pet }] = await Promise.all([
    traceRouteLoader("album", () => supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id")
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
  const context = createRouteReadContext(supabase, user.id, album, reuse);
  if (album.status === "ordered") redirect(`/pets/${petId}/album/${albumId}`);


  const { draft, cover, coverSrc } = await traceRouteLoader("draft-cover-signing", () => loadRouteDraft(supabase, context, true));
  const { monthLabel, coverDateLabel } = formatAlbumPeriodLabels(album.period_from, album.period_to);
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", monthLabel);
  const pages: AlbumEditPageEntry[] = [{ kind: "cover", id: "cover", label: "表紙" }, ...(draft?.spreads.map((spread, index): AlbumEditPageEntry => ({ kind: "spread", id: spread.id, label: `${index * 2 + 1} - ${index * 2 + 2}`, spread })) ?? [])];
  const pageCount = (draft?.spreads.length ?? 0) * 2;

  const base = `/pets/${petId}/album/${albumId}`;

  await traceRouteLoader("return-boundary", () => undefined);
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
