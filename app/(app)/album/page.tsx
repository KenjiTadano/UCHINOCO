import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPhotoPage } from "@/lib/photo-pagination";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";

export default async function SelectPetForAlbumPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (!petsError && pets?.length === 0) redirect("/pets/new");
  if (!petsError && pets?.length === 1) redirect(`/pets/${pets[0].id}/album`);

  const petList = pets ?? [];
  const petDataList = await Promise.all(
    petList.map(async (pet) => {
      const [{ photos }, { count }] = await Promise.all([
        getPhotoPage(supabase, pet.id, 3, null),
        supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .eq("pet_id", pet.id)
          .eq("uploader_user_id", user.id),
      ]);
      return { pet, coverPhotos: photos, photoCount: count ?? 0 };
    }),
  );

  const allCoverPhotos = petDataList.flatMap((d) => d.coverPhotos);
  const signedUrlsResult = await createListImageUrls(supabase, allCoverPhotos);
  const signedUrlByPath = signedUrlsResult.signedUrlByPath;

  return (
    <main className="app-page">
      <div className="flex items-start justify-between">
        <Link className="app-back-link" href="/home">
          ホームへ戻る
        </Link>
        <Link
          href="/account/orders"
          className="ds-focus text-xs text-muted hover:text-foreground"
        >
          注文履歴
        </Link>
      </div>
      <header>
        <p className="ds-editorial">ALBUM</p>
        <h1 className="app-title">アルバムを作る</h1>
        <p className="app-description mt-2">
          写真を選んで一冊にまとめる。印刷して手元に残すこともできます。
        </p>
      </header>

      {petsError ? (
        <p role="alert" className="app-error">
          ペット情報を取得できませんでした。
        </p>
      ) : (
        <ul className="grid gap-4">
          {petDataList.map(({ pet, coverPhotos, photoCount }) => {
            const coverUrls = coverPhotos
              .map((p) => signedUrlByPath.get(listImagePath(p)))
              .filter(Boolean) as string[];
            return (
              <li key={pet.id}>
                <Link
                  href={`/pets/${pet.id}/album`}
                  aria-label={`${pet.name}のアルバムを作る`}
                  className="ds-focus block overflow-hidden rounded-2xl bg-surface transition-opacity hover:opacity-90"
                >
                  <div className="bg-surface-warm">
                    {coverUrls.length === 0 ? (
                      <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted">
                        まだ思い出がありません
                      </div>
                    ) : coverUrls.length === 1 ? (
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={coverUrls[0]}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] gap-0.5">
                        <div className="relative overflow-hidden">
                          <Image src={coverUrls[0]} alt="" fill className="object-cover" unoptimized />
                        </div>
                        <div className="grid grid-rows-2 gap-0.5">
                          <div className="relative overflow-hidden">
                            <Image src={coverUrls[1]} alt="" fill className="object-cover" unoptimized />
                          </div>
                          <div className="relative overflow-hidden bg-surface-warm">
                            {coverUrls[2] ? (
                              <Image src={coverUrls[2]} alt="" fill className="object-cover" unoptimized />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="font-semibold">{pet.name}</h2>
                    {photoCount > 0 ? (
                      <p className="ds-caption mt-1">{photoCount.toLocaleString()}枚の思い出</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
