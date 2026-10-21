import { Suspense } from "react";
import { RouteLoadingShell } from "@/app/(app)/_components/route-loading-shell";
import { traceAuthStage } from "@/lib/auth-performance";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadPrintPreviewData, ownedAlbum } from "@/lib/album-print/inspection";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { PrintPreviewScreen } from "./print-preview-screen";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumPrintPreviewPage({ params }: Props) {
  return traceAuthStage("page.print", async () => {
  const { petId, albumId } = await params;
  const authClient = await createClient();
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) redirect("/login");
  const owned = await ownedAlbum(albumId, petId);
  if (!owned) notFound();
  const { data: pet } = await owned.supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) notFound();
  const delivery = loadPrintPreviewData(petId, albumId, { owned, pet });
  return <Suspense fallback={<RouteLoadingShell title="印刷プレビュー" print />}><ResolvedPrint petId={petId} albumId={albumId} delivery={delivery} /></Suspense>;
  });
}

async function ResolvedPrint({ petId, albumId, delivery }: { petId: string; albumId: string; delivery: ReturnType<typeof loadPrintPreviewData> }) {
  const loaded = await delivery;
  if (!loaded) notFound();
  const { supabase, userId, album, pet, view, cover, inspection } = loaded;
  if (view) await recordAlbumAnalyticsEvent({ supabase, userId, albumId, draftVersionId: view.versionId, eventType: "print_preview_opened", eventKey: view.versionId });
  return <PrintPreviewScreen petId={petId} albumId={albumId} petName={pet.name} dateLabel={formatAlbumPeriodLabels(album.period_from, album.period_to).coverDateLabel} cover={cover} view={inspection.ordered ? null : view} initial={inspection} editorHref={`/pets/${petId}/album/${albumId}/pages/edit`} />;
}
