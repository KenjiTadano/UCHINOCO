import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { groupPhotosByTokyoDate } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";

type PetDetailPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ message?: string }>;
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
  const [{ petId }, { message }] = await Promise.all([params, searchParams]);
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

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("id, storage_path, taken_at, created_at, favorite")
    .eq("pet_id", pet.id)
    .order("created_at", { ascending: false });

  const [avatarResult, photoUrlsResult] = await Promise.all([
    pet.avatar_url
      ? supabase.storage.from("pet-avatars").createSignedUrl(pet.avatar_url, 3600)
      : Promise.resolve({ data: null, error: null }),
    photos && photos.length > 0
      ? supabase.storage
          .from("pet-photos")
          .createSignedUrls(
            photos.map((photo) => photo.storage_path),
            3600,
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  const signedUrlByPath = new Map(
    (photoUrlsResult.data ?? [])
      .filter((item) => item.path && item.signedUrl && !item.error)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
  const timeline = groupPhotosByTokyoDate(photos ?? []);

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
          <h1 className="break-words text-2xl font-bold tracking-tight">{pet.name}</h1>
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
        <div className="flex items-center justify-between gap-4">
          <h2 id="photos-heading" className="app-section-title">
            思い出写真
          </h2>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="app-button-secondary"
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
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 id={`date-${group.dateKey}`} className="font-semibold">
                    {group.dateLabel}
                  </h3>
                  <p className="shrink-0 text-sm text-muted">
                    {group.photos.length}枚
                  </p>
                </div>

                <ul className="grid grid-cols-3 gap-1.5">
                  {group.photos.map((photo, index) => {
                    const signedUrl = signedUrlByPath.get(photo.storage_path);
                    return (
                      <li
                        key={photo.id}
                        className="app-photo-frame aspect-square"
                      >
                        {signedUrl ? (
                          <Link
                            className="relative block size-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            href={`/pets/${pet.id}/photos/${photo.id}`}
                            aria-label={`${group.dateLabel}の思い出写真${index + 1}を詳しく見る`}
                          >
                            <Image
                              className="size-full object-cover transition-opacity hover:opacity-85"
                              src={signedUrl}
                              alt={`${pet.name}の思い出写真${index + 1}`}
                              fill
                              sizes="(max-width: 640px) 33vw, 180px"
                              unoptimized
                            />
                            {photo.favorite ? (
                              <span
                                className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-sm text-favorite shadow-sm"
                                aria-label="お気に入り"
                              >
                                ★
                              </span>
                            ) : null}
                          </Link>
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-muted">
                            表示できません
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
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
    </main>
  );
}
