import Image from "next/image";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { logout } from "../../(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "../../_components/pending-submit-button";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { EditorialPhotoGrid, EmptyState, PageHeader } from "@/app/_components/ui";
import { findMemoryCandidate } from "@/lib/home-memory";

type HomePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

type DashboardPhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
};

const DASHBOARD_PHOTO_LIMIT = 6;

const SPECIES_LABELS: Record<string, string> = { dog: "犬", cat: "猫" };

function toSignedUrlMap(
  items: Array<{
    path?: string | null;
    signedUrl?: string | null;
    error?: string | null;
  }>,
) {
  return new Map(
    items
      .filter((item) => item.path && item.signedUrl && !item.error)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
}

function MemoryGrid({
  photos,
  petNameById,
  signedUrlByPath,
  favorite = false,
}: {
  photos: DashboardPhoto[];
  petNameById: Map<string, string>;
  signedUrlByPath: Map<string, string>;
  favorite?: boolean;
}) {
  const editorialPhotos = photos.flatMap((photo) => {
        const petName = petNameById.get(photo.pet_id) ?? "うちの子";
        const signedUrl = signedUrlByPath.get(listImagePath(photo));
        return signedUrl ? [{ id: photo.id, src: signedUrl, alt: `${petName}の思い出写真`, href: `/pets/${photo.pet_id}/photos/${photo.id}`, favorite }] : [];
      });
  return <EditorialPhotoGrid photos={editorialPhotos} />;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { error: actionError, message: actionMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const [profileResult, petsResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, gender, birthday, adoption_date, avatar_url, created_at",
      )
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const pets = petsResult.data ?? [];
  const emptyPhotoResult = { data: [] as DashboardPhoto[], error: null };
  const [recentResult, favoriteResult] =
    pets.length > 0
      ? await Promise.all([
          (supabase as unknown as SupabaseClient).rpc("get_dashboard_photos", { p_favorite_only: false, p_limit: DASHBOARD_PHOTO_LIMIT }),
          (supabase as unknown as SupabaseClient).rpc("get_dashboard_photos", { p_favorite_only: true, p_limit: DASHBOARD_PHOTO_LIMIT }),
        ])
      : [emptyPhotoResult, emptyPhotoResult];

  const recentPhotos = (recentResult.data ?? []) as DashboardPhoto[];
  const favoritePhotos = (favoriteResult.data ?? []) as DashboardPhoto[];
  const avatarPaths = Array.from(
    new Set(pets.flatMap((pet) => (pet.avatar_url ? [pet.avatar_url] : []))),
  );
  const resurfacingResult = await findMemoryCandidate(supabase, pets.map((pet) => pet.id));
  const heroPhotos = resurfacingResult.photo ? [resurfacingResult.photo] : recentPhotos.slice(0, 1);

  const [avatarUrlsResult, photoUrlsResult] = await Promise.all([
    avatarPaths.length
      ? supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
    createListImageUrls(supabase, [...recentPhotos, ...favoritePhotos, ...heroPhotos]),
  ]);
  const avatarUrlByPath = toSignedUrlMap(avatarUrlsResult.data ?? []);
  const photoUrlByPath = photoUrlsResult.signedUrlByPath;
  const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const eagerAvatarPath = pets.find(
    (pet) => pet.avatar_url && avatarUrlByPath.has(pet.avatar_url),
  )?.avatar_url;
  const photosFailed = Boolean(
    recentResult.error ||
      favoriteResult.error ||
      photoUrlsResult.error,
  );

  return (
    <main className="app-page gap-7">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-[0.12em] text-foreground">
          UCHINOCO
        </h1>
        <p className="min-w-0 truncate text-xs text-muted">
          {profileResult.error || !profileResult.data?.display_name
            ? (user.email ?? "ログイン中")
            : `${profileResult.data.display_name}さん`}
        </p>
      </header>

      {actionError ? (
        <p role="alert" className="app-error">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p role="status" className="app-status">
          {actionMessage}
        </p>
      ) : null}

      {heroPhotos.length > 0 && !photosFailed ? (
        <section aria-labelledby="reunion-heading" className="flex flex-col gap-3">
          <PageHeader eyebrow="MEMORIES" title={resurfacingResult.label ?? "最近の思い出"} description={resurfacingResult.photo?.caption ?? "また会いたくなる、うちの子との時間。"} />
          <EditorialPhotoGrid photos={heroPhotos.flatMap((photo) => {
            const signedUrl = photoUrlByPath.get(listImagePath(photo));
            return signedUrl ? [{ id: photo.id, src: signedUrl, alt: `${petNameById.get(photo.pet_id) ?? "うちの子"}の思い出`, href: `/pets/${photo.pet_id}/photos/${photo.id}`, favorite: photo.favorite }] : [];
          })} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="pets-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="pets-heading" className="app-section-title">うちの子</h2>
          {pets.length ? (
            <Link className="ds-focus rounded-lg px-2 py-1 text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground" href="/pets/new">
              ＋ 追加
            </Link>
          ) : null}
        </div>

        {petsResult.error ? (
          <p role="alert" className="app-error">
            ペット情報を取得できませんでした。
          </p>
        ) : pets.length ? (
          <ul className="grid gap-2">
            {pets.map((pet) => {
              const avatarUrl = pet.avatar_url
                ? avatarUrlByPath.get(pet.avatar_url)
                : null;
              return (
                <li key={pet.id} className="app-card p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {avatarUrl ? (
                      <Image
                        className="size-14 shrink-0 rounded-full object-cover"
                        src={avatarUrl}
                        alt={`${pet.name}のプロフィール写真`}
                        width={56}
                        height={56}
                        loading={pet.avatar_url === eagerAvatarPath ? "eager" : "lazy"}
                        unoptimized
                      />
                    ) : (
                      <div
                        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xl"
                        aria-label={`${pet.name}の画像は未設定です`}
                      >
                        {pet.species === "dog" ? "🐶" : "🐱"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold">
                        {pet.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[
                          SPECIES_LABELS[pet.species] ?? "不明",
                          pet.breed,
                        ]
                          .filter(Boolean)
                          .join(" ・ ")}
                      </p>
                    </div>
                    <Link
                      className="ds-focus shrink-0 rounded-lg px-2 py-1 text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground"
                      href={`/pets/${pet.id}/edit`}
                    >
                      編集
                    </Link>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link className="app-button-primary flex-1" href={`/pets/${pet.id}`}>
                      思い出を見る
                    </Link>
                    <Link className="app-button-secondary" href={`/pets/${pet.id}/photos/new`}>
                      写真を追加
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="まだペットが登録されていません"
            action={<Link className="app-button-primary" href="/pets/new">うちの子を登録する</Link>}
          />
        )}
      </section>

      {!petsResult.error && pets.length ? (
        <>
          <section className="flex flex-col gap-4" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="app-section-title">最近の思い出</h2>
            {photosFailed ? (
              <p role="alert" className="app-error">思い出写真を取得できませんでした。</p>
            ) : recentPhotos.length ? (
              <MemoryGrid photos={recentPhotos} petNameById={petNameById} signedUrlByPath={photoUrlByPath} />
            ) : (
              <EmptyState
                title="まだ思い出がありません"
                action={pets.length === 1 ? (
                  <Link className="app-button-primary" href={`/pets/${pets[0].id}/photos/new`}>写真を追加</Link>
                ) : undefined}
              />
            )}
          </section>

          {!photosFailed ? (
            <section className="flex flex-col gap-4" aria-labelledby="favorites-heading">
              <h2 id="favorites-heading" className="app-section-title">お気に入りの思い出</h2>
              {favoritePhotos.length ? (
                <MemoryGrid photos={favoritePhotos} petNameById={petNameById} signedUrlByPath={photoUrlByPath} favorite />
              ) : (
                <EmptyState title="お気に入りの思い出はまだありません" />
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <form action={logout} className="flex justify-center pb-2">
        <PendingSubmitButton className="ds-focus rounded-lg px-3 py-1 text-xs text-muted underline decoration-border underline-offset-4 hover:text-foreground" pendingText="ログアウト中...">
          ログアウト
        </PendingSubmitButton>
      </form>
    </main>
  );
}
