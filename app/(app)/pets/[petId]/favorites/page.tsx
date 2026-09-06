import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MonthPhotoGrid } from "../_components/month-photo-grid";
import { groupPhotosByTokyoMonth } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";
import { getPhotoPage, nextPhotoCursor, paginationHref, parsePhotoCursor } from "@/lib/photo-pagination";
import { createListImageUrls } from "@/lib/photo-list-images";

type PetFavoritesPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ before?: string; beforeId?: string }>;
};

export default async function PetFavoritesPage({
  params,
  searchParams,
}: PetFavoritesPageProps) {
  const [{ petId }, { before, beforeId }] = await Promise.all([params, searchParams]);
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

  const { photos, hasMore, error: photosError } = await getPhotoPage(
    supabase, pet.id, 60, parsePhotoCursor(before, beforeId), true,
  );

  const signedUrlsResult = await createListImageUrls(supabase, photos);
  const signedUrlByPath = signedUrlsResult.signedUrlByPath;
  const monthGroups = groupPhotosByTokyoMonth(photos);

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>
        {pet.name}の思い出へ戻る
      </Link>

      <header>
        <p className="app-eyebrow">{pet.name}</p>
        <h1 className="app-title">お気に入りアルバム</h1>
        <p className="app-description">大切な思い出だけを集めました。</p>
      </header>

      {photosError || signedUrlsResult.error ? (
        <p role="alert" className="app-error">
          お気に入りを取得できませんでした。
        </p>
      ) : monthGroups.length > 0 ? (
        <div className="flex flex-col gap-6">
          <MonthPhotoGrid groups={monthGroups} petId={pet.id} petName={pet.name} signedUrlByPath={signedUrlByPath} />
          {hasMore ? <Link className="app-button-secondary self-center" href={paginationHref(`/pets/${pet.id}/favorites`, nextPhotoCursor(photos))}>さらに見る</Link> : null}
        </div>
      ) : (
        <div className="app-empty">
          <p className="font-medium text-foreground">
            お気に入りの思い出はまだありません
          </p>
          <p className="mt-1">
            写真詳細の★から、お気に入りに追加できます。
          </p>
          <Link className="app-button-secondary mt-4" href={`/pets/${pet.id}`}>
            思い出を見る
          </Link>
        </div>
      )}
    </main>
  );
}
