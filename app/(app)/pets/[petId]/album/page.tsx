import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPhotoPage } from "@/lib/photo-pagination";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { EmptyState } from "@/app/_components/ui";

type Props = {
  params: Promise<{ petId: string }>;
};

export default async function PetAlbumPage({ params }: Props) {
  const { petId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet || pet.owner_user_id !== user.id) notFound();

  const [{ photos, error: photosError }, { count: photoCount }, { data: albums }] =
    await Promise.all([
      getPhotoPage(supabase, pet.id, 3, null),
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("pet_id", pet.id)
        .eq("uploader_user_id", user.id),
      supabase
        .from("albums")
        .select("id, title, status, period_from, period_to, cover_photo_id")
        .eq("pet_id", pet.id)
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const signedUrlsResult = await createListImageUrls(supabase, photos);
  const coverUrls = photos
    .map((p) => signedUrlsResult.signedUrlByPath.get(listImagePath(p)))
    .filter(Boolean) as string[];

  // Cover URLs for albums (re-use signed URLs already fetched for first 3 photos)
  // No extra request needed — album cover comes from same photo pool for display preview
  const albumList = albums ?? [];

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>
        思い出へ戻る
      </Link>

      {photosError ? (
        <p role="alert" className="app-error">
          思い出を読み込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : coverUrls.length === 0 ? (
        <>
          <header>
            <p className="ds-editorial">ALBUM</p>
            <h1 className="app-title">{pet.name}のアルバム</h1>
          </header>
          <EmptyState
            title="まだ思い出がありません"
            description="写真を追加すると、アルバムを作れるようになります。"
            action={
              <Link href={`/pets/${pet.id}/photos/new`} className="app-button-primary">
                写真を追加
              </Link>
            }
          />
        </>
      ) : (
        <>
          <section aria-labelledby="album-proposal-heading">
            <AlbumCoverCollage urls={coverUrls} petName={pet.name} />
            <div className="mt-4 grid gap-4">
              <div>
                <p className="ds-editorial mb-1">ALBUM</p>
                <h1 id="album-proposal-heading" className="text-xl font-semibold">
                  {pet.name}との思い出アルバム
                </h1>
                {photoCount ? (
                  <p className="app-description mt-1">
                    {photoCount.toLocaleString()}枚の思い出から選んで、一冊に
                  </p>
                ) : null}
              </div>
              <Link href={`/pets/${pet.id}/album/new`} className="app-button-primary w-fit">
                {albumList.length > 0 ? "もう一冊作る" : "最初の一冊を作る"}
              </Link>
            </div>
          </section>

          <section aria-labelledby="album-shelf-heading">
            <h2 id="album-shelf-heading" className="app-section-title mb-4">
              作ったアルバム
            </h2>
            {albumList.length === 0 ? (
              <EmptyState
                title="まだアルバムはありません"
                description="写真を選んで一冊にまとめると、ここに並びます。"
              />
            ) : (
              <ul className="grid gap-3">
                {albumList.map((album) => (
                  <li key={album.id}>
                    <Link
                      href={`/pets/${pet.id}/album/${album.id}`}
                      aria-label={`${album.title || "タイトル未設定"}を開く`}
                      className="ds-focus flex min-h-20 items-center gap-4 rounded-2xl bg-surface px-4 py-3 transition-opacity hover:opacity-80"
                    >
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <p className="truncate font-semibold">
                          {album.title || "（タイトル未設定）"}
                        </p>
                        <p className="ds-caption">
                          {formatPeriodLabel(album.period_from, album.period_to)}
                        </p>
                      </div>
                      <span aria-hidden="true" className="shrink-0 text-muted">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function formatPeriodLabel(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) =>
    d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "short" });
  return `${fmt(f)} 〜 ${fmt(t)}`;
}

function AlbumCoverCollage({ urls, petName }: { urls: string[]; petName: string }) {
  if (urls.length === 1) {
    return (
      <div className="overflow-hidden rounded-2xl bg-surface-warm">
        <div className="relative aspect-[4/3]">
          <Image src={urls[0]} alt={`${petName}の思い出`} fill className="object-cover" unoptimized />
        </div>
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] gap-0.5 overflow-hidden rounded-2xl bg-surface-warm">
      <div className="relative overflow-hidden">
        <Image src={urls[0]} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="grid grid-rows-2 gap-0.5">
        <div className="relative overflow-hidden">
          <Image src={urls[1]} alt="" fill className="object-cover" unoptimized />
        </div>
        <div className="relative overflow-hidden">
          {urls[2] ? (
            <Image src={urls[2]} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="size-full bg-surface-warm" />
          )}
        </div>
      </div>
    </div>
  );
}
