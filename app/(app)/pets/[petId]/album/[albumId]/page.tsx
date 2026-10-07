import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { AlbumCoverCollage } from "../_components/album-cover-collage";
import { AlbumTitleForm } from "./album-title-form";
import { AlbumPhotoControls } from "./album-photo-controls";
import { AlbumDeleteControl } from "./album-delete-control";
import { AlbumCompleteScreen } from "./album-complete-screen";
import { AlbumPreviewScreen } from "./album-preview-screen";
import { buildAlbumPreviewSpreads } from "@/lib/album-preview-spreads";
import { readDraft } from "@/lib/album-persistence/read-draft";
import { traceAlbumLoad } from "@/lib/album-load-trace";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { acceptAlbumDraft, regenerateAlbumDraft } from "./analytics-actions";
import { findNewPhotoSuggestion } from "@/lib/album-new-photo-suggestions";
import { NewPhotoSuggestionNotice } from "./new-photo-suggestion";
import { loadUserEntitlements } from "@/lib/entitlements-server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
  searchParams: Promise<{ view?: string; preview?: string }>;
};

export default async function AlbumDetailPage({ params, searchParams }: Props) {
  const { petId, albumId } = await params;
  const { view, preview } = await searchParams;
  const showComplete = view === "complete" || preview === "complete";
  const showPreview = view === "preview" || preview === "preview";

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // RLS exposes the album to its owner and accepted members of an album pet.
  const { data: album, error: albumError } = await supabase.from("albums").select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id").eq("id", albumId).eq("pet_id", petId).maybeSingle();

  if (albumError || !album) notFound();

  const isOwner = album.owner_user_id === user.id;
  const ownerEntitlements = await loadUserEntitlements(supabase, album.owner_user_id);
  // Pet RLS independently confirms that the route pet is shared with the caller.
  const { data: pet } = await supabase.from("pets").select("id, name, owner_user_id").eq("id", petId).maybeSingle();

  if (!pet) notFound();

  const albumPetsClient = supabase as unknown as SupabaseClient;
  const { data: albumPetRows } = await albumPetsClient.from("album_pets").select("pet_id").eq("album_id", albumId);
  const albumPetIds = [...new Set([petId, ...(albumPetRows ?? []).map((row) => row.pet_id)])];
  const { data: albumPets } = await supabase.from("pets").select("id, name").in("id", albumPetIds);
  const albumPetLabel = (albumPets ?? []).map((item) => item.name).join("・") || pet.name;
  const newPhotoSuggestion = isOwner ? await findNewPhotoSuggestion(supabase, { albumId, routePetId: petId, userId: user.id }) : null;
  const visibleSuggestion = newPhotoSuggestion && !newPhotoSuggestion.dismissed ? newPhotoSuggestion : null;
  if (visibleSuggestion) {
    await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: visibleSuggestion.draftVersionId, eventType: "new_photos_suggested", eventKey: visibleSuggestion.fingerprint, eventData: { photo_count: visibleSuggestion.candidates.length } });
  }

  // Latest actionable order for this album (for status banner)
  const { data: latestOrder } = await supabase.from("orders").select("id, status").eq("album_id", albumId).in("status", ["pending", "paid", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();

  // Album photos ordered by position
  const { data: rawAlbumPhotos, error: apError } = await supabase.from("album_photos").select("album_id, photo_id, position, selected_by").eq("album_id", albumId).order("position", { ascending: true });

  if (apError) {
    return (
      <main className="app-page">
        <Link className="app-back-link" href={`/pets/${petId}/album`}>
          アルバムへ戻る
        </Link>
        <p role="alert" className="app-error">
          アルバムを読み込めませんでした。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  const albumPhotos = rawAlbumPhotos ?? [];
  const photoIds = albumPhotos.map((ap) => ap.photo_id);

  // Fetch photo metadata for signed URLs
  const { data: photos } = await supabase
    .from("photos")
    .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, favorite, caption")
    .in("id", photoIds.length > 0 ? photoIds : ["00000000-0000-0000-0000-000000000000"]);

  const photoById = new Map((photos ?? []).map((p) => [p.id, p]));

  // Signed URLs
  const photosForUrls = albumPhotos.map((ap) => photoById.get(ap.photo_id)).filter(Boolean) as Array<{
    id: string;
    storage_path: string;
    thumbnail_path: string | null;
  }>;

  const signedUrlsResult = await traceAlbumLoad("detail.list-image-urls", () => createListImageUrls(supabase, photosForUrls));
  const signedUrlByPath = signedUrlsResult.signedUrlByPath;

  // Ordered photo list with URLs
  const orderedPhotos = albumPhotos
    .map((ap) => {
      const photo = photoById.get(ap.photo_id);
      if (!photo) return null;
      const src = signedUrlByPath.get(listImagePath(photo)) ?? null;
      return {
        photo_id: ap.photo_id,
        position: ap.position,
        src,
        alt: `${albumPetLabel}の思い出`,
        caption: photo.caption ?? null,
        taken_at: photo.taken_at ?? null,
      };
    })
    .filter(Boolean) as Array<{
    photo_id: string;
    position: number;
    src: string | null;
    alt: string;
    caption: string | null;
    taken_at: string | null;
  }>;

  // Cover: first 3 photos with signed URLs
  const coverUrls = orderedPhotos
    .filter((p) => p.src)
    .slice(0, 3)
    .map((p) => p.src as string);

  // Period label
  const periodLabel = formatPeriodLabel(album.period_from, album.period_to);
  const periodLabels = formatAlbumPeriodLabels(album.period_from, album.period_to);

  if (showPreview) {
    const savedDraft = await readDraft(supabase, albumId);
    if (savedDraft) {
      await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: savedDraft.versionId, eventType: "album_viewed", eventKey: `preview:${savedDraft.versionId}` });
      const base = `/pets/${petId}/album/${albumId}`;
      return <AlbumPreviewScreen draft={savedDraft} spreads={[]} backHref={`${base}?view=complete`} editHref={`${base}/pages/edit`} orderHref={`${base}/product`} printHref={`${base}/print`} />;
    }

    const analysesResult = await supabase
      .from("photo_ai_analyses")
      .select("photo_id, activity, scene, tags, description")
      .in("photo_id", photoIds.length > 0 ? photoIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "completed");

    const analysisByPhotoId = new Map((analysesResult.data ?? []).map((a) => [a.photo_id, a]));

    const spreads = buildAlbumPreviewSpreads(
      orderedPhotos
        .filter((p) => p.src)
        .map((p) => {
          const ai = analysisByPhotoId.get(p.photo_id);
          return {
            src: p.src as string,
            alt: p.alt,
            caption: p.caption,
            taken_at: p.taken_at,
            activity: ai?.activity ?? null,
            scene: ai?.scene ?? null,
            description: ai?.description ?? null,
            tags: ai?.tags ?? null,
          };
        }),
      {
        petName: albumPetLabel,
        periodMonthLabel: periodLabels.monthLabel,
      },
    );

    return <AlbumPreviewScreen spreads={spreads} backHref={`/pets/${petId}/album/${albumId}?view=complete`} editHref={`/pets/${petId}/album/${albumId}/edit`} orderHref={`/pets/${petId}/album/${albumId}/product`} printHref={`/pets/${petId}/album/${albumId}/print`} />;
  }

  if (showComplete) {
    const savedDraft = await readDraft(supabase, albumId);
    if (savedDraft) await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: savedDraft.versionId, eventType: "album_viewed", eventKey: `complete:${savedDraft.versionId}` });
    const base = `/pets/${petId}/album/${albumId}`;
    const coverSrc = (album.cover_photo_id ? orderedPhotos.find((p) => p.photo_id === album.cover_photo_id)?.src : null) ?? orderedPhotos.find((p) => p.src)?.src ?? null;

    const memoryCount = countMemoryDays(photos ?? []);
    return (
      <AlbumCompleteScreen
        petId={petId}
        albumId={albumId}
        petName={albumPetLabel}
        albumTitle={album.title ?? ""}
        coverSrc={coverSrc}
        photoCount={orderedPhotos.length}
        memoryCount={Math.max(memoryCount, orderedPhotos.length > 0 ? 1 : 0)}
        periodMonthLabel={periodLabels.monthLabel}
        coverDateLabel={periodLabels.coverDateLabel}
        backHref={`/pets/${petId}/album`}
        editHref={savedDraft ? `${base}/pages/edit` : `${base}/edit`}
        printHref={savedDraft ? `${base}/print` : null}
        acceptAction={acceptAlbumDraft.bind(null, petId, albumId)}
        regenerateAction={regenerateAlbumDraft.bind(null, petId, albumId)}
        canRegenerate={isOwner && ownerEntitlements.canRegenerateAlbum}
        newPhotoSuggestion={visibleSuggestion ? { href: `${base}/new-photos`, count: visibleSuggestion.candidates.length } : null}
      />
    );
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album`}>
        アルバムへ戻る
      </Link>

      {isOwner && visibleSuggestion ? <NewPhotoSuggestionNotice href={`/pets/${petId}/album/${albumId}/new-photos`} count={visibleSuggestion.candidates.length} /> : null}

      {/* Cover */}
      <section aria-labelledby="album-cover-heading">
        <AlbumCoverCollage urls={coverUrls} petName={albumPetLabel} />
        <div className="mt-3 grid gap-1 px-1">
          <p className="ds-editorial">ALBUM</p>
          <h1 id="album-cover-heading" className="text-xl font-semibold">
            {album.title || "（タイトル未設定）"}
          </h1>
          <p className="ds-caption">
            {albumPetLabel}
            {"　"}
            {periodLabel}
            {orderedPhotos.length > 0 ? `　${orderedPhotos.length}枚` : ""}
          </p>
        </div>
      </section>

      {/* Page preview: 3-column editorial grid */}
      {orderedPhotos.length > 0 ? (
        <section aria-labelledby="album-preview-heading">
          <h2 id="album-preview-heading" className="app-section-title mb-3">
            ページプレビュー
          </h2>
          <ul className="grid grid-cols-3 gap-1.5">
            {orderedPhotos.map((photo, i) => (
              <li key={photo.photo_id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-warm">
                {photo.src ? <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 640px) 33vw, 160px" className="object-cover" unoptimized /> : null}
                <span className="absolute left-1 top-1 rounded bg-black/40 px-1 text-[10px] text-white">{i + 1}</span>
              </li>
            ))}
          </ul>
          <Link href={`/pets/${petId}/album/${albumId}?view=preview`} className="mt-3 inline-flex text-sm font-medium text-brand-terracotta underline underline-offset-2">
            見開きプレビューを見る
          </Link>
        </section>
      ) : null}

      {/* Order status banner */}
      {album.status === "ordered" && latestOrder && (
        <div className="rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <p className="font-semibold">注文済み</p>
          <p className="ds-caption mt-0.5">印刷・製本を進めています。</p>
          <Link href={`/pets/${petId}/album/${albumId}/order/${latestOrder.id}`} className="mt-2 inline-block text-xs font-medium underline underline-offset-2">
            注文詳細を見る
          </Link>
        </div>
      )}
      {latestOrder?.status === "pending" && album.status !== "ordered" && (
        <div className="rounded-xl border border-border px-4 py-3 text-sm">
          <p className="font-semibold">お支払いを確認しています</p>
          <Link href={`/pets/${petId}/album/${albumId}/order/${latestOrder.id}`} className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
            注文状況を確認する
          </Link>
        </div>
      )}
      {latestOrder?.status === "failed" && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          <p className="font-semibold text-danger">お支払いを確認できませんでした</p>
          <Link href={`/pets/${petId}/album/${albumId}/product`} className="mt-1 inline-block text-xs font-medium text-danger underline underline-offset-2">
            再注文する
          </Link>
        </div>
      )}

      {album.status !== "ordered" ? (
        <>
          {/* Photobook CTA */}
          <Link href={`/pets/${petId}/album/${albumId}/product`} className="app-button-primary flex items-center justify-center gap-2" aria-label={`${album.title || "このアルバム"}をフォトブックにする`}>
            フォトブックにする
          </Link>

          {/* Title edit */}
          <section aria-labelledby="album-title-heading" className="app-card-flat grid gap-4">
            <h2 id="album-title-heading" className="text-sm font-medium text-muted">
              タイトルを編集
            </h2>
          {isOwner ? <AlbumTitleForm petId={petId} albumId={albumId} title={album.title} /> : <h1 className="app-title">{album.title || "アルバム"}</h1>}
          </section>

          {/* Photo add link */}
          <Link href={`/pets/${petId}/album/${albumId}/add`} className="app-button-secondary flex items-center justify-center gap-2" aria-label="アルバムに写真を追加する">
            ＋ 写真を追加
          </Link>

          {/* Photo reorder + remove */}
          {isOwner ? <AlbumPhotoControls petId={petId} albumId={albumId} initialPhotos={orderedPhotos} /> : null}

          {/* Delete */}
          {isOwner ? <AlbumDeleteControl petId={petId} albumId={albumId} /> : null}
        </>
      ) : (
        <p className="app-description text-center">注文確定後はアルバムの編集を行えません。</p>
      )}
    </main>
  );
}

function formatPeriodLabel(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) => d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "short" });
  return `${fmt(f)} 〜 ${fmt(t)}`;
}

function countMemoryDays(photos: Array<{ taken_at: string | null; created_at: string }>): number {
  const days = new Set<string>();
  for (const photo of photos) {
    const raw = photo.taken_at ?? photo.created_at;
    if (!raw) continue;
    const d = new Date(raw);
    const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    days.add(key);
  }
  return days.size;
}
