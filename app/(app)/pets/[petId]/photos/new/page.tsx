import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { History } from "lucide-react";
import { PetSwitcher } from "@/app/(app)/_components/pet-switcher";
import { safeAppReturnPath } from "@/lib/app-return-path";
import { loadOwnerPetsForSwitcher } from "@/lib/owner-pets";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";
import { PhotoUploadForm } from "./photo-upload-form";

type NewPhotosPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

type RecentPhoto = {
  id: string;
  src: string;
  href: string;
};

export default async function NewPhotosPage({
  params,
  searchParams,
}: NewPhotosPageProps) {
  const [{ petId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const client = supabase as unknown as SupabaseClient;
  const { data: pet, error } = await client
    .from("pets")
    .select("id, name, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !pet || pet.owner_user_id !== user.id) {
    notFound();
  }

  const [ownerPetsResult, recentPhotosResult] = await Promise.all([
    loadOwnerPetsForSwitcher(client, user.id),
    client
      .from("photos")
      .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
      .eq("pet_id", pet.id)
      .eq("uploader_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const ownerPets = ownerPetsResult.pets;
  const recentPhotos = recentPhotosResult.data ?? [];
  const photoUrlsResult = await createListImageUrls(supabase, recentPhotos);

  const recentItems: RecentPhoto[] = recentPhotos.flatMap((photo) => {
    const src = photoUrlsResult.signedUrlByPath.get(listImagePath(photo));
    if (!src) return [];
    return [
      {
        id: photo.id,
        src,
        href: `/pets/${photo.pet_id}/photos/${photo.id}`,
      },
    ];
  });

  const returnTo = safeAppReturnPath(query.returnTo) ?? `/pets/${pet.id}`;
  const historyHref = `/pets/${pet.id}`;

  return (
    <main className="add-page">
      <header className="add-header">
        <div className="min-w-0">
          <h1 className="add-title">写真を追加</h1>
          <p className="add-subtitle">今日のかわいいを、未来の宝物に。</p>
        </div>
        <Link href={historyHref} className="add-history ds-focus">
          <History size={12} strokeWidth={1.8} aria-hidden="true" />
          撮影の履歴
        </Link>
      </header>

      {ownerPetsResult.error ? (
        <p role="alert" className="app-error">
          ペット情報を取得できませんでした。
        </p>
      ) : (
        <PetSwitcher
          pets={ownerPets}
          activePetId={pet.id}
          hrefForPet={(id) =>
            `/pets/${id}/photos/new?returnTo=${encodeURIComponent(returnTo)}`
          }
          trailing={
            <p className="add-deco" aria-hidden="true">
              <span className="add-deco-line">どんな日も、</span>
              <span className="add-deco-line">大切な思い出に。</span>
              <svg
                className="add-deco-curve"
                viewBox="0 0 140 20"
                preserveAspectRatio="none"
              >
                <path
                  d="M4 13 C 30 4, 55 16, 82 8 S 118 5, 136 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </p>
          }
        />
      )}

      <PhotoUploadForm
        petId={pet.id}
        returnTo={returnTo}
        recentPhotos={recentItems}
        allPhotosHref={`/pets/${pet.id}`}
      />
    </main>
  );
}
