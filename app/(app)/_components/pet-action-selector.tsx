import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SPECIES_LABELS: Record<string, string> = { dog: "犬", cat: "猫" };

export async function PetActionSelector({
  mode,
  returnTo,
}: {
  mode: "photo" | "search" | "memories" | "album";
  returnTo?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, owner_user_id, name, species, breed, avatar_url")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (!petsError && pets?.length === 0) {
    redirect("/pets/new");
  }
  if (!petsError && pets?.length === 1) {
    const destination =
      mode === "photo"
        ? `/pets/${pets[0].id}/photos/new${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
        : mode === "search"
          ? `/pets/${pets[0].id}/search`
          : mode === "album"
            ? `/pets/${pets[0].id}/album`
            : `/pets/${pets[0].id}`;
    redirect(destination);
  }

  const avatarPaths = Array.from(
    new Set((pets ?? []).flatMap((pet) => (pet.avatar_url ? [pet.avatar_url] : []))),
  );
  const avatarResult = avatarPaths.length
    ? await supabase.storage
        .from("pet-avatars")
        .createSignedUrls(avatarPaths, 3600)
    : { data: [], error: null };
  const avatarUrlByPath = new Map(
    (avatarResult.data ?? [])
      .filter((item) => item.path && item.signedUrl && !item.error)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
  const title =
    mode === "photo"
      ? "どの子の思い出を追加しますか？"
      : mode === "search"
        ? "どの子の思い出を検索しますか？"
        : mode === "album"
          ? "どの子のアルバムを見ますか？"
          : "どの子の思い出を見ますか？";

  return (
    <main className="app-page">
      <Link className="app-back-link" href="/home">
        ホームへ戻る
      </Link>
      <header>
        <p className="app-eyebrow">UCHINOCO</p>
        <h1 className="app-title">{title}</h1>
      </header>

      {petsError || avatarResult.error ? (
        <p role="alert" className="app-error">
          ペット情報を取得できませんでした。
        </p>
      ) : pets && pets.length > 0 ? (
        <ul className="grid gap-3">
          {pets.map((pet) => {
            const avatarUrl = pet.avatar_url
              ? avatarUrlByPath.get(pet.avatar_url)
              : null;
            const destination =
              mode === "photo"
                ? `/pets/${pet.id}/photos/new${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
                : mode === "search"
                  ? `/pets/${pet.id}/search`
                  : mode === "album"
                    ? `/pets/${pet.id}/album`
                    : `/pets/${pet.id}`;

            return (
              <li key={pet.id}>
                <Link
                  href={destination}
                  aria-label={`${pet.name}を選択`}
                  className="app-card flex min-h-24 items-center gap-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {avatarUrl ? (
                    <Image
                      className="size-16 shrink-0 rounded-full object-cover"
                      src={avatarUrl}
                      alt={`${pet.name}のプロフィール写真`}
                      width={64}
                      height={64}
                      unoptimized
                    />
                  ) : (
                    <div
                      className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-3xl"
                      aria-label={`${pet.name}の画像は未設定です`}
                    >
                      {pet.species === "dog" ? "🐶" : "🐱"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-semibold">{pet.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {SPECIES_LABELS[pet.species] ?? "不明"}
                      {pet.breed ? `・${pet.breed}` : ""}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-primary">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
