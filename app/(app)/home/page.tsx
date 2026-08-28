import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "../../(auth)/actions";
import { createClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

const SPECIES_LABELS: Record<string, string> = {
  dog: "犬",
  cat: "猫",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男の子",
  female: "女の子",
  unknown: "不明",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { error: actionError, message: actionMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

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

  const { data: profile, error: profileError } = profileResult;
  const { data: pets, error: petsError } = petsResult;
  const petsWithImages = await Promise.all(
    (pets ?? []).map(async (pet) => {
      if (!pet.avatar_url) {
        return { ...pet, avatarSignedUrl: null };
      }

      const { data, error } = await supabase.storage
        .from("pet-avatars")
        .createSignedUrl(pet.avatar_url, 3600);

      return {
        ...pet,
        avatarSignedUrl: error ? null : data.signedUrl,
      };
    }),
  );
  const eagerAvatarIndex = petsWithImages.findIndex(
    (pet) => Boolean(pet.avatarSignedUrl),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">UCHINOCO</h1>
        <p className="mt-2 text-zinc-600">ログインしました</p>
      </header>

      {actionError ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {actionMessage}
        </p>
      ) : null}

      <dl className="grid gap-3 rounded border border-zinc-200 p-4">
        <div>
          <dt className="text-sm text-zinc-500">メールアドレス</dt>
          <dd>{user.email ?? "未設定"}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">表示名</dt>
          <dd>
            {profileError
              ? "プロフィールを取得できませんでした"
              : (profile?.display_name ?? "未設定")}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="pets-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="pets-heading" className="text-xl font-semibold">
            うちの子
          </h2>
          {petsWithImages.length > 0 ? (
            <Link className="rounded border border-zinc-300 px-3 py-2 text-sm" href="/pets/new">
              ペットを追加
            </Link>
          ) : null}
        </div>

        {petsError ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            ペット情報を取得できませんでした。
          </p>
        ) : petsWithImages.length > 0 ? (
          <ul className="grid gap-4">
            {petsWithImages.map((pet, index) => (
              <li key={pet.id} className="flex gap-4 rounded border border-zinc-200 p-4">
                {pet.avatarSignedUrl ? (
                  <Image
                    className="size-24 shrink-0 rounded-full border border-zinc-200 object-cover"
                    src={pet.avatarSignedUrl}
                    alt={`${pet.name}のプロフィール写真`}
                    width={96}
                    height={96}
                    loading={index === eagerAvatarIndex ? "eager" : "lazy"}
                    unoptimized
                  />
                ) : (
                  <div
                    className="flex size-24 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-4xl"
                    aria-label={`${pet.name}の画像は未設定です`}
                  >
                    {pet.species === "dog" ? "🐶" : "🐱"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-lg font-semibold">{pet.name}</h3>
                  <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">種類</dt>
                    <dd>{SPECIES_LABELS[pet.species] ?? "不明"}</dd>
                  </div>
                  {pet.breed ? (
                    <div className="flex gap-2">
                      <dt className="text-zinc-500">犬種・猫種</dt>
                      <dd>{pet.breed}</dd>
                    </div>
                  ) : null}
                  {pet.gender ? (
                    <div className="flex gap-2">
                      <dt className="text-zinc-500">性別</dt>
                      <dd>{GENDER_LABELS[pet.gender] ?? "不明"}</dd>
                    </div>
                  ) : null}
                  {pet.birthday ? (
                    <div className="flex gap-2">
                      <dt className="text-zinc-500">誕生日</dt>
                      <dd>{formatDate(pet.birthday)}</dd>
                    </div>
                  ) : null}
                  {pet.adoption_date ? (
                    <div className="flex gap-2">
                      <dt className="text-zinc-500">お迎えした日</dt>
                      <dd>{formatDate(pet.adoption_date)}</dd>
                    </div>
                  ) : null}
                  </dl>
                  <Link
                    className="mt-4 inline-block text-sm underline"
                    href={`/pets/${pet.id}`}
                  >
                    思い出を見る
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded border border-dashed border-zinc-300 p-6 text-center">
            <p>まだうちの子が登録されていません</p>
            <Link className="mt-4 inline-block rounded bg-zinc-900 px-4 py-2 text-white" href="/pets/new">
              うちの子を登録する
            </Link>
          </div>
        )}
      </section>

      <form action={logout}>
        <button className="rounded border border-zinc-300 px-4 py-2" type="submit">
          ログアウト
        </button>
      </form>
    </main>
  );
}
