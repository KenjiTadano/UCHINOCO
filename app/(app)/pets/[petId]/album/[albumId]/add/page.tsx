import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { getPhotoPage, parsePhotoCursor, nextPhotoCursor, paginationHref } from "@/lib/photo-pagination";
import { addAlbumPhoto } from "../actions";

const PAGE_SIZE = 24;

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
  searchParams: Promise<{ before?: string; beforeId?: string }>;
};

export default async function AlbumAddPhotoPage({ params, searchParams }: Props) {
  const [{ petId, albumId }, { before, beforeId }] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // Album ownership + petId match
  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();
  if (!album) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  // Photos already in album
  const { data: existingRows } = await supabase
    .from("album_photos")
    .select("photo_id")
    .eq("album_id", albumId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.photo_id));

  // Paginated primary-scope photos
  const cursor = parsePhotoCursor(before, beforeId);
  const { photos, hasMore } = await getPhotoPage(supabase, petId, PAGE_SIZE, cursor);
  const signedUrlsResult = await createListImageUrls(supabase, photos);
  const signedUrlByPath = signedUrlsResult.signedUrlByPath;

  const base = `/pets/${petId}/album/${albumId}/add`;

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}`}>
        アルバムへ戻る
      </Link>

      <header>
        <p className="ds-editorial">ALBUM</p>
        <h1 className="app-title">写真を追加</h1>
        <p className="app-description mt-2">
          追加したい写真の「追加」ボタンを押してください。
        </p>
      </header>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">追加できる写真がありません。</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => {
            const url = signedUrlByPath.get(listImagePath(photo));
            const alreadyAdded = existingIds.has(photo.id);
            const addAction = addAlbumPhoto.bind(null, petId, albumId, photo.id);
            return (
              <li key={photo.id} className="relative">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-warm">
                  {url ? (
                    <Image
                      src={url}
                      alt={`${pet.name}の思い出写真`}
                      fill
                      sizes="(max-width: 640px) 33vw, 160px"
                      className={`object-cover transition-opacity ${alreadyAdded ? "opacity-40" : ""}`}
                      unoptimized
                    />
                  ) : null}
                  {photo.favorite ? (
                    <span aria-hidden="true" className="absolute right-1.5 top-1.5 text-sm text-favorite">
                      ★
                    </span>
                  ) : null}
                </div>
                <form action={addAction} className="mt-1">
                  <button
                    type="submit"
                    disabled={alreadyAdded}
                    aria-label={alreadyAdded ? "追加済み" : `この写真をアルバムに追加`}
                    className={`w-full rounded-lg py-1.5 text-xs font-medium transition-colors ${
                      alreadyAdded
                        ? "bg-surface text-muted"
                        : "app-button-primary"
                    }`}
                  >
                    {alreadyAdded ? "追加済み" : "追加"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-3">
        {hasMore ? (
          <Link
            className="app-button-secondary"
            href={paginationHref(base, nextPhotoCursor(photos))}
          >
            さらに見る
          </Link>
        ) : null}
        {cursor ? (
          <Link href={base} className="app-button-ghost">
            最初のページへ
          </Link>
        ) : null}
      </div>
    </main>
  );
}
