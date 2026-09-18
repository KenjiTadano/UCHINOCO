import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { groupPhotosByTokyoDate } from "@/lib/photo-timeline";
import { getMemoryPhotoPage, nextPhotoCursor, paginationHref, parsePhotoCursor } from "@/lib/photo-pagination";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";
import { PhotoThumbnailBackfill } from "./_components/photo-thumbnail-backfill";
import { ContentHashBackfill } from "./_components/content-hash-backfill";
import {
  EditorialPhotoGrid,
  EmptyState,
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
      getMemoryPhotoPage(
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
        ホームへ戻る
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
          <p className="mt-1 text-xs text-muted">
            {[SPECIES_LABELS[pet.species] ?? "不明", pet.breed].filter(Boolean).join(" ・ ")}
            {pet.birthday ? `　${formatDate(pet.birthday)}生まれ` : ""}
          </p>
          <Link
            className="ds-focus mt-1 inline-flex rounded-lg px-1 text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground"
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

        <div className="flex items-center justify-between gap-3">
          <h2 id="photos-heading" className="app-section-title">
            思い出写真
          </h2>
          <div className="flex flex-wrap justify-end gap-2">
            <Link className="app-button-ghost" href={`/pets/${pet.id}/search`}>
              探す
            </Link>
            <Link className="app-button-ghost" href={`/pets/${pet.id}/album`}>
              アルバム
            </Link>
            <Link className="app-button-primary" href={`/pets/${pet.id}/photos/new`}>
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
                  return signedUrl ? [{ id: photo.id, src: signedUrl, alt: `${pet.name}の思い出写真`, href: `/pets/${photo.pet_id}/photos/${photo.id}`, favorite: photo.favorite }] : [];
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
          <EmptyState
            title="まだ思い出がありません"
            action={<Link className="app-button-primary" href={`/pets/${pet.id}/photos/new`}>最初の写真を追加する</Link>}
          />
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
