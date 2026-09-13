import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { groupPhotosByTokyoDate } from "@/lib/photo-timeline";
import { getPhotoPage, nextPhotoCursor, paginationHref, parsePhotoCursor } from "@/lib/photo-pagination";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";
import { PhotoThumbnailBackfill } from "./_components/photo-thumbnail-backfill";
import { ContentHashBackfill } from "./_components/content-hash-backfill";
import {
  EditorialPhotoGrid,
  MemoryDateHeader,
  PageHeader,
  SegmentControl,
} from "@/app/_components/ui";

type PetDetailPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ message?: string; before?: string; beforeId?: string }>;
};

const SPECIES_LABELS: Record<string, string> = {
  dog: "犬",
  cat: "猫",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

export default async function PetDetailPage({
  params,
  searchParams,
}: PetDetailPageProps) {
  const [{ petId }, { message, before, beforeId }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, name, species, breed, birthday, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet || pet.owner_user_id !== user.id) {
    notFound();
  }

  const [{ photos, hasMore, error: photosError }, backfillCountResult, hashBackfillCountResult] =
    await Promise.all([
      getPhotoPage(
        supabase,
        pet.id,
        30,
        parsePhotoCursor(before, beforeId),
      ),
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("pet_id", pet.id)
        .eq("uploader_user_id", user.id)
        .is("thumbnail_path", null),
      supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("pet_id", pet.id)
        .eq("uploader_user_id", user.id)
        .is("content_hash", null)
        .is("content_hash_backfilled_at", null),
    ]);

  const [avatarResult, photoUrlsResult] = await Promise.all([
    pet.avatar_url
      ? supabase.storage.from("pet-avatars").createSignedUrl(pet.avatar_url, 3600)
      : Promise.resolve({ data: null, error: null }),
    createListImageUrls(supabase, photos),
  ]);
  const signedUrlByPath = photoUrlsResult.signedUrlByPath;
  const timeline = groupPhotosByTokyoDate(photos);

  return (
    <main className="app-page">
      <Link className="app-back-link" href="/home">
        homeへ戻る
      </Link>

      {message ? (
        <p role="status" className="app-status">
          {message}
        </p>
      ) : null}

      <header className="flex items-center gap-4">
        {avatarResult.data?.signedUrl ? (
          <Image
            className="size-24 shrink-0 rounded-full border object-cover"
            src={avatarResult.data.signedUrl}
            alt={`${pet.name}のプロフィール写真`}
            width={96}
            height={96}
            unoptimized
          />
        ) : (
          <div
            className="flex size-24 shrink-0 items-center justify-center rounded-full bg-primary-soft text-4xl"
            aria-label={`${pet.name}のプロフィール画像は未設定です`}
          >
            {pet.species === "dog" ? "🐶" : "🐱"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <PageHeader eyebrow="思い出" title={pet.name} />
          <dl className="mt-2 grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted">種類</dt>
              <dd>{SPECIES_LABELS[pet.species] ?? "不明"}</dd>
            </div>
            {pet.breed ? (
              <div className="flex gap-2">
                <dt className="text-muted">犬種・猫種</dt>
                <dd>{pet.breed}</dd>
              </div>
            ) : null}
            {pet.birthday ? (
              <div className="flex gap-2">
                <dt className="text-muted">誕生日</dt>
                <dd>{formatDate(pet.birthday)}</dd>
              </div>
            ) : null}
          </dl>
          <Link
            className="app-back-link mt-1"
            href={`/pets/${pet.id}/edit`}
          >
            プロフィールを編集
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="photos-heading">
        <SegmentControl
          currentHref={`/pets/${pet.id}`}
          items={[
            { label: "すべて", href: `/pets/${pet.id}` },
            { label: "♡ お気に入り", href: `/pets/${pet.id}/favorites` },
          ]}
        />
        <div className="flex justify-end gap-2">
          <Link className="app-button-secondary" href={`/pets/${pet.id}/album`}>アルバムを見る</Link>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h2 id="photos-heading" className="app-section-title">
            思い出写真
          </h2>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="app-button-ghost"
              href={`/pets/${pet.id}/search`}
            >
              思い出を検索
            </Link>
            <Link
              className="app-button-primary"
              href={`/pets/${pet.id}/photos/new`}
            >
              写真を追加
            </Link>
          </div>
        </div>

        {photosError || photoUrlsResult.error ? (
          <p role="alert" className="app-error">
            思い出写真を取得できませんでした。
          </p>
        ) : timeline.length > 0 ? (
          <div className="flex flex-col gap-8">
            {timeline.map((group) => (
              <section key={group.dateKey} aria-labelledby={`date-${group.dateKey}`}>
                <MemoryDateHeader date={group.dateLabel} count={group.photos.length} />
                <EditorialPhotoGrid photos={group.photos.flatMap((photo) => {
                  const signedUrl = signedUrlByPath.get(listImagePath(photo));
                  return signedUrl ? [{ id: photo.id, src: signedUrl, alt: `${pet.name}の思い出写真`, href: `/pets/${pet.id}/photos/${photo.id}`, favorite: photo.favorite }] : [];
                })} />
              </section>
            ))}
            {hasMore ? (
              <Link
                className="app-button-secondary self-center"
                href={paginationHref(`/pets/${pet.id}`, nextPhotoCursor(photos))}
              >
                さらに見る
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="app-empty">
            <p>まだ思い出がありません</p>
            <Link
              className="app-button-primary mt-4"
              href={`/pets/${pet.id}/photos/new`}
            >
              最初の写真を追加する
            </Link>
          </div>
        )}
      </section>

      <PhotoThumbnailBackfill
        petId={pet.id}
        initialPendingCount={
          backfillCountResult.error ? null : (backfillCountResult.count ?? 0)
        }
      />
      {!hashBackfillCountResult.error ? (
        <ContentHashBackfill petId={pet.id} initialPendingCount={hashBackfillCountResult.count ?? 0} />
      ) : null}
    </main>
  );
}
