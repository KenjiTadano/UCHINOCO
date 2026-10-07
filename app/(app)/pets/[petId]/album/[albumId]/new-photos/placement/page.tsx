import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPhotoPreviewUrls } from "@/lib/photo-image-delivery";
import { parseStoredGeometry } from "@/lib/photo-analysis/stored";
import { placementFingerprint, rankPhotoPlacements, spreadHasManualEdits } from "@/lib/album-photo-placement";
import { newPhotoSuggestionFingerprint } from "@/lib/album-new-photo-suggestion-policy";
import { readDraft } from "@/lib/album-persistence/read-draft";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_LAYOUTS } from "@/lib/smart-layout/layouts";
import { applyPhotoPlacement, redoPhotoPlacement, skipPhotoPlacement, undoPhotoPlacement } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Props = { params: Promise<{ petId: string; albumId: string }>; searchParams: Promise<{ photoIds?: string; plan?: string; applied?: string; undone?: string; placementVersion?: string; parentVersion?: string }> };

function bestScore(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const nested = row.bestShot && typeof row.bestShot === "object" && !Array.isArray(row.bestShot) ? (row.bestShot as Record<string, unknown>).overall : null;
  return [row.bestShotScore, row.best_shot_score, row.overallScore, nested].find((item): item is number => typeof item === "number" && Number.isFinite(item)) ?? null;
}

export default async function PlacementPage({ params, searchParams }: Props) {
  const [{ petId, albumId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: album } = await supabase.from("albums").select("id,pet_id,owner_user_id,status").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!album) notFound();
  const view = await readDraft(supabase, albumId);
  if (!view || album.status !== "draft" || view.status === "locked") notFound();

  if (query.applied && UUID.test(query.placementVersion ?? "") && UUID.test(query.parentVersion ?? "")) {
    return <main className="app-page"><h1 className="app-title">配置を反映しました</h1><p className="app-description">元のDraftは保持したまま、新しいDraft versionへ局所配置しました。</p><form action={undoPhotoPlacement.bind(null, petId, albumId, query.placementVersion!, query.parentVersion!)}><button className="app-button-secondary min-h-11" type="submit">元に戻す</button></form><Link className="app-button-primary mt-3" href={`/pets/${petId}/album/${albumId}/pages/edit`}>Editorで確認</Link></main>;
  }
  if (query.undone && UUID.test(query.placementVersion ?? "") && UUID.test(query.parentVersion ?? "")) {
    return <main className="app-page"><h1 className="app-title">元のDraftへ戻しました</h1><p className="app-description">配置Draftも残っているため、安全にやり直せます。</p><form action={redoPhotoPlacement.bind(null, petId, albumId, query.placementVersion!, query.parentVersion!)}><button className="app-button-primary min-h-11" type="submit">やり直す</button></form><Link className="app-button-secondary mt-3" href={`/pets/${petId}/album/${albumId}/pages/edit`}>Editorへ戻る</Link></main>;
  }

  const photoIds = [...new Set((query.photoIds ?? "").split(",").filter((id) => UUID.test(id)))];
  if (!photoIds.length) redirect(`/pets/${petId}/album/${albumId}/pages/edit`);
  const photoId = photoIds[0];
  const { data: photo } = await supabase.from("photos").select("id,pet_id,storage_path,thumbnail_path,taken_at,created_at").eq("id", photoId).maybeSingle();
  const { data: albumPhoto } = await supabase.from("album_photos").select("photo_id").eq("album_id", albumId).eq("photo_id", photoId).maybeSingle();
  if (!photo || !albumPhoto) notFound();
  const [{ data: analyses }, urls] = await Promise.all([
    supabase.from("photo_analysis_results").select("analysis_type,result,created_at").eq("photo_id", photoId).in("analysis_type", ["subject_geometry", "photo_intelligence_semantic"]).order("created_at", { ascending: false }),
    createPhotoPreviewUrls(supabase, [photo], true, false, user.id),
  ]);
  const geometry = parseStoredGeometry((analyses ?? []).find((row) => row.analysis_type === "subject_geometry")?.result);
  const score = bestScore((analyses ?? []).find((row) => row.analysis_type === "photo_intelligence_semantic")?.result);
  const roles = new Map((view.compositionPlan?.items ?? []).filter((item) => item.kind === "spread").map((item) => [item.storySpreadId, { role: item.role, density: item.density }]));
  const plans = rankPhotoPlacements({ id: photo.id, petId: photo.pet_id, takenAt: photo.taken_at ?? photo.created_at, orientation: geometry?.orientation ?? "square", bestShotScore: score, crop: { x: geometry?.focalPoint.x ?? 0.5, y: geometry?.focalPoint.y ?? 0.5, scale: 1 } }, view.spreads.map((spread) => ({ id: spread.id, position: spread.position, role: roles.get(spread.storySpreadId)?.role ?? "STORY", density: roles.get(spread.storySpreadId)?.density ?? "MEDIUM", storyStartedAt: spread.preview.story.startedAt ?? null, frameCount: spread.frames.length, edited: spreadHasManualEdits(spread) })));
  const index = Math.min(Math.max(Number.parseInt(query.plan ?? "0", 10) || 0, 0), plans.length - 1);
  const plan = plans[index];
  if (!plan) notFound();
  await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: view.versionId, eventType: index ? "new_photo_placement_alternative" : "new_photo_placement_previewed", eventKey: newPhotoSuggestionFingerprint(albumId, view.versionId, [photoId, String(index)]), eventData: { photo_count: 1, alternative_rank: index + 1 } });
  const src = urls.get(photo.id) ?? null;
  const fingerprint = placementFingerprint(albumId, view.versionId, photoId, plan);
  const nextIndex = (index + 1) % plans.length;
  const remaining = photoIds.join(",");
  const applyAction = applyPhotoPlacement.bind(null, petId, albumId, remaining);

  return <main className="app-page">
    <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}/pages/edit`}>Editorへ戻る</Link>
    <header><p className="ds-editorial">PLACEMENT PREVIEW</p><h1 className="app-title">この配置を使いますか？</h1><p className="app-description mt-2">Previewではまだアルバムを変更しません。</p></header>
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-semibold text-muted">BEFORE</p><p className="mt-2 text-sm">既存の{view.spreads.length}ページと編集内容を新Draftへ完全copy</p>
      <div className="my-4 border-t border-border" />
      <p className="text-xs font-semibold text-brand-terracotta">AFTER · {index === 0 ? "RECOMMENDED" : `ALTERNATIVE ${index}`}</p>
      <div className="relative mx-auto mt-3 aspect-[8/5] w-full overflow-hidden rounded-xl bg-surface-warm">
        {(ALBUM_LAYOUTS.find((layout) => layout.id === plan.layoutId)?.frames ?? []).map((frame, frameIndex) => {
          const anchor = plan.anchorSpreadId ? view.spreads.find((spread) => spread.id === plan.anchorSpreadId) : null;
          const existingPhotoId = anchor?.frames[frameIndex]?.effectivePhotoId;
          const frameSrc = frame.id === plan.frameId ? src : existingPhotoId ? view.previewUrls[existingPhotoId] : null;
          return <div key={frame.id} className="absolute overflow-hidden rounded-md bg-border" style={{ left: `${frame.rect.x * 100}%`, top: `${frame.rect.y * 100}%`, width: `${frame.rect.w * 100}%`, height: `${frame.rect.h * 100}%` }}>{frameSrc ? <Image src={frameSrc} alt="" fill className="object-cover" sizes="40vw" unoptimized /> : null}</div>;
        })}
      </div>
      <p className="mt-3 text-sm font-semibold">{plan.reason}</p><p className="ds-caption mt-1">{plan.layoutId} · {plan.kind === "EXISTING_SPREAD" ? "このページに追加" : plan.kind === "INSERT_AFTER" ? "このページの後に追加" : "最後に追加"}</p>
    </section>
    <form action={applyAction} className="grid gap-3">
      <input type="hidden" name="photoId" value={photoId}/><input type="hidden" name="mode" value={plan.kind}/><input type="hidden" name="anchorSpreadId" value={plan.anchorSpreadId ?? ""}/><input type="hidden" name="fingerprint" value={fingerprint}/><input type="hidden" name="layoutId" value={plan.layoutId}/><input type="hidden" name="frameId" value={plan.frameId}/><input type="hidden" name="cropX" value={plan.crop.x}/><input type="hidden" name="cropY" value={plan.crop.y}/><input type="hidden" name="cropScale" value={plan.crop.scale}/>
      <button type="submit" className="app-button-primary min-h-11">この配置を使う</button>
    </form>
    <Link className="app-button-secondary min-h-11" href={`?photoIds=${encodeURIComponent(remaining)}&plan=${nextIndex}`}>別案を見る</Link>
    <Link className="app-button-secondary min-h-11" href={`?photoIds=${encodeURIComponent(remaining)}&plan=${plans.length - 1}`}>新しいページにする</Link>
    <form action={skipPhotoPlacement.bind(null, petId, albumId, photoIds.length)}><button type="submit" className="app-button-ghost min-h-11 w-full">今はしない</button></form>
  </main>;
}
