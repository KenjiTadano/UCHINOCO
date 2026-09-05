import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "../../(auth)/actions";
import { formatTokyoDate, photoTimestamp } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

type DashboardPhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
};

const DASHBOARD_PHOTO_LIMIT = 6;

const SPECIES_LABELS: Record<string, string> = { dog: "犬", cat: "猫" };
const GENDER_LABELS: Record<string, string> = {
  male: "男の子",
  female: "女の子",
  unknown: "不明",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function newestPhotos(photos: DashboardPhoto[]) {
  return [...photos]
    .sort((left, right) => {
      const difference =
        new Date(photoTimestamp(right)).getTime() -
        new Date(photoTimestamp(left)).getTime();
      return difference || right.id.localeCompare(left.id);
    })
    .slice(0, DASHBOARD_PHOTO_LIMIT);
}

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
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => {
        const petName = petNameById.get(photo.pet_id) ?? "うちの子";
        const dateLabel = formatTokyoDate(photoTimestamp(photo));
        const signedUrl = signedUrlByPath.get(photo.storage_path);

        return (
          <li key={photo.id} className="min-w-0">
            <Link
              className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={`/pets/${photo.pet_id}/photos/${photo.id}`}
              aria-label={`${petName}の${dateLabel}の思い出を見る`}
            >
              <div className="app-photo-frame aspect-square">
                {signedUrl ? (
                  <Image
                    className="object-cover transition-opacity group-hover:opacity-85"
                    src={signedUrl}
                    alt={`${petName}の思い出写真`}
                    fill
                    sizes="(max-width: 640px) 50vw, 190px"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
                    写真を表示できません
                  </div>
                )}
                {favorite ? (
                  <span
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-sm text-favorite shadow-sm"
                    aria-label="お気に入り"
                  >
                    ★
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-sm font-medium">{petName}</p>
              <p className="truncate text-xs text-muted">{dateLabel}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
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
  const petIds = pets.map((pet) => pet.id);
  const emptyPhotoResult = { data: [] as DashboardPhoto[], error: null };
  const [
    recentTakenResult,
    recentCreatedResult,
    favoriteTakenResult,
    favoriteCreatedResult,
  ] =
    petIds.length > 0
      ? await Promise.all([
          supabase
            .from("photos")
            .select("id, pet_id, storage_path, taken_at, created_at, favorite")
            .in("pet_id", petIds)
            .not("taken_at", "is", null)
            .order("taken_at", { ascending: false })
            .limit(DASHBOARD_PHOTO_LIMIT),
          supabase
            .from("photos")
            .select("id, pet_id, storage_path, taken_at, created_at, favorite")
            .in("pet_id", petIds)
            .is("taken_at", null)
            .order("created_at", { ascending: false })
            .limit(DASHBOARD_PHOTO_LIMIT),
          supabase
            .from("photos")
            .select("id, pet_id, storage_path, taken_at, created_at, favorite")
            .in("pet_id", petIds)
            .eq("favorite", true)
            .not("taken_at", "is", null)
            .order("taken_at", { ascending: false })
            .limit(DASHBOARD_PHOTO_LIMIT),
          supabase
            .from("photos")
            .select("id, pet_id, storage_path, taken_at, created_at, favorite")
            .in("pet_id", petIds)
            .eq("favorite", true)
            .is("taken_at", null)
            .order("created_at", { ascending: false })
            .limit(DASHBOARD_PHOTO_LIMIT),
        ])
      : [
          emptyPhotoResult,
          emptyPhotoResult,
          emptyPhotoResult,
          emptyPhotoResult,
        ];

  const recentPhotos = newestPhotos([
    ...((recentTakenResult.data ?? []) as DashboardPhoto[]),
    ...((recentCreatedResult.data ?? []) as DashboardPhoto[]),
  ]);
  const favoritePhotos = newestPhotos(
    [
      ...((favoriteTakenResult.data ?? []) as DashboardPhoto[]),
      ...((favoriteCreatedResult.data ?? []) as DashboardPhoto[]),
    ],
  );
  const photoPaths = Array.from(
    new Set(
      [...recentPhotos, ...favoritePhotos].map((photo) => photo.storage_path),
    ),
  );
  const avatarPaths = Array.from(
    new Set(pets.flatMap((pet) => (pet.avatar_url ? [pet.avatar_url] : []))),
  );

  const [avatarUrlsResult, photoUrlsResult] = await Promise.all([
    avatarPaths.length
      ? supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
    photoPaths.length
      ? supabase.storage.from("pet-photos").createSignedUrls(photoPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const avatarUrlByPath = toSignedUrlMap(avatarUrlsResult.data ?? []);
  const photoUrlByPath = toSignedUrlMap(photoUrlsResult.data ?? []);
  const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const eagerAvatarPath = pets.find(
    (pet) => pet.avatar_url && avatarUrlByPath.has(pet.avatar_url),
  )?.avatar_url;
  const photosFailed = Boolean(
    recentTakenResult.error ||
      recentCreatedResult.error ||
      favoriteTakenResult.error ||
      favoriteCreatedResult.error ||
      photoUrlsResult.error,
  );

  return (
    <main className="app-page gap-7">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            UCHINOCO
          </h1>
          <p className="min-w-0 truncate text-xs text-muted">
            {profileResult.error || !profileResult.data?.display_name
              ? (user.email ?? "ログイン中")
              : `${profileResult.data.display_name}さん`}
          </p>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          うちの子との毎日を、思い出に。
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

      <section className="flex flex-col gap-3" aria-labelledby="pets-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pets-heading" className="app-section-title">うちの子</h2>
          {pets.length ? (
            <Link className="app-button-ghost min-h-11 px-2.5" href="/pets/new">
              ＋ ペットを追加
            </Link>
          ) : null}
        </div>

        {petsResult.error ? (
          <p role="alert" className="app-error">
            ペット情報を取得できませんでした。
          </p>
        ) : pets.length ? (
          <ul className="grid gap-3">
            {pets.map((pet) => {
              const avatarUrl = pet.avatar_url
                ? avatarUrlByPath.get(pet.avatar_url)
                : null;
              return (
                <li key={pet.id} className="app-card p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {avatarUrl ? (
                      <Image
                        className="size-16 shrink-0 rounded-full object-cover sm:size-18"
                        src={avatarUrl}
                        alt={`${pet.name}のプロフィール写真`}
                        width={72}
                        height={72}
                        loading={pet.avatar_url === eagerAvatarPath ? "eager" : "lazy"}
                        unoptimized
                      />
                    ) : (
                      <div
                        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-3xl sm:size-18"
                        aria-label={`${pet.name}の画像は未設定です`}
                      >
                        {pet.species === "dog" ? "🐶" : "🐱"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold">
                        {pet.name}
                      </h3>
                      <p className="mt-0.5 truncate text-sm">
                        {[
                          SPECIES_LABELS[pet.species] ?? "不明",
                          pet.breed,
                          pet.gender
                            ? GENDER_LABELS[pet.gender] ?? "不明"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ・ ")}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        誕生日 {formatDate(pet.birthday)}
                        {pet.adoption_date
                          ? ` ・ お迎え ${formatDate(pet.adoption_date)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link className="app-button-primary col-span-2" href={`/pets/${pet.id}`}>
                      思い出を見る
                    </Link>
                    <Link className="app-button-secondary" href={`/pets/${pet.id}/photos/new`}>
                      写真を追加
                    </Link>
                    <Link className="app-button-ghost" href={`/pets/${pet.id}/edit`}>
                      編集
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="app-empty">
            <p>まだペットが登録されていません</p>
            <Link className="app-button-primary mt-4" href="/pets/new">
              うちの子を登録する
            </Link>
          </div>
        )}
      </section>

      {!petsResult.error && pets.length ? (
        <>
          <section className="flex flex-col gap-4" aria-labelledby="recent-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="recent-heading" className="app-section-title">最近の思い出</h2>
              {recentPhotos.length ? (
                <p className="text-sm text-muted">最新{recentPhotos.length}件</p>
              ) : null}
            </div>
            {photosFailed ? (
              <p role="alert" className="app-error">思い出写真を取得できませんでした。</p>
            ) : recentPhotos.length ? (
              <MemoryGrid photos={recentPhotos} petNameById={petNameById} signedUrlByPath={photoUrlByPath} />
            ) : (
              <div className="app-empty">
                <p>まだ思い出がありません</p>
                {pets.length === 1 ? (
                  <Link className="app-button-primary mt-3" href={`/pets/${pets[0].id}/photos/new`}>
                    写真を追加
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-muted">上のペットカードから写真を追加できます。</p>
                )}
              </div>
            )}
          </section>

          {!photosFailed ? (
            <section className="flex flex-col gap-4" aria-labelledby="favorites-heading">
              <h2 id="favorites-heading" className="app-section-title">お気に入りの思い出</h2>
              {favoritePhotos.length ? (
                <MemoryGrid photos={favoritePhotos} petNameById={petNameById} signedUrlByPath={photoUrlByPath} favorite />
              ) : (
                <p className="app-empty">お気に入りの思い出はまだありません。</p>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <form action={logout}>
        <button className="app-button-ghost" type="submit">
          ログアウト
        </button>
      </form>
    </main>
  );
}
