import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { findNewPhotoSuggestion } from "@/lib/album-new-photo-suggestions";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { createClient } from "@/lib/supabase/server";
import { addSuggestedPhotos, dismissNewPhotos } from "./actions";

type Props = { params: Promise<{ petId: string; albumId: string }> };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export default async function NewPhotoReviewPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const suggestion = await findNewPhotoSuggestion(supabase, { albumId, routePetId: petId, userId: user.id });
  if (!suggestion) notFound();

  await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: suggestion.draftVersionId, eventType: "new_photos_reviewed", eventKey: suggestion.fingerprint, eventData: { photo_count: suggestion.candidates.length } });
  const urls = await createListImageUrls(supabase, suggestion.candidates.map((photo) => ({ id: photo.id, storage_path: photo.storagePath, thumbnail_path: photo.thumbnailPath })));
  const addAction = addSuggestedPhotos.bind(null, petId, albumId, suggestion.fingerprint);
  const dismissAction = dismissNewPhotos.bind(null, petId, albumId, suggestion.fingerprint);

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}?view=complete`}>アルバムへ戻る</Link>
      <header>
        <p className="ds-editorial">NEW MEMORIES</p>
        <h1 className="app-title">新しい写真が{suggestion.candidates.length}枚あります</h1>
        <p className="app-description mt-2">追加しても、編集済みのページや表紙は変更しません。</p>
      </header>

      <form action={addAction}>
        <ul className="grid grid-cols-2 gap-3">
          {suggestion.candidates.map((photo) => {
            const src = urls.signedUrlByPath.get(listImagePath({ storage_path: photo.storagePath, thumbnail_path: photo.thumbnailPath }));
            return (
              <li key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-square bg-surface-warm">
                  {src ? <Image src={src} alt="アルバムへの新しい写真候補" fill sizes="50vw" className="object-cover" unoptimized /> : null}
                </div>
                <div className="space-y-1 p-3 text-xs">
                  <p>{dateLabel(photo.takenAt ?? photo.createdAt)}</p>
                  <p className="text-muted">Best Shot: {photo.bestShotScore == null ? "未評価" : `${Math.round(photo.bestShotScore)}点`}</p>
                  <p className="text-muted">{photo.alreadyInAlbum ? "追加済み" : "アルバム未追加"}</p>
                  <label className="flex min-h-11 items-center gap-2 font-medium">
                    <input type="checkbox" name="photoId" value={photo.id} disabled={photo.alreadyInAlbum} />
                    この写真を追加
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 grid gap-3">
          <button type="submit" className="app-button-primary min-h-11">選んだ写真を追加</button>
        </div>
      </form>
      <form action={addAction} className="mt-3">
        {suggestion.candidates.filter((photo) => !photo.alreadyInAlbum).map((photo) => <input key={photo.id} type="hidden" name="photoId" value={photo.id} />)}
        <button type="submit" className="app-button-secondary min-h-11 w-full">すべて追加</button>
      </form>
      <form action={dismissAction} className="mt-3">
        <button type="submit" className="app-button-ghost min-h-11 w-full">今回は追加しない</button>
      </form>
    </main>
  );
}
