import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";

type PhotoDetailPageProps = {
  params: Promise<{ petId: string; photoId: string }>;
};

export default async function PhotoDetailPage({
  params,
}: PhotoDetailPageProps) {
  const { petId, photoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const [petResult, photoResult] = await Promise.all([
    supabase
      .from("pets")
      .select("id, name, owner_user_id")
      .eq("id", petId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select(
        "id, pet_id, storage_path, taken_at, created_at, caption, favorite",
      )
      .eq("id", photoId)
      .eq("pet_id", petId)
      .maybeSingle(),
  ]);
  const { data: pet, error: petError } = petResult;
  const { data: photo, error: photoError } = photoResult;

  if (
    petError ||
    photoError ||
    !pet ||
    !photo ||
    pet.owner_user_id !== user.id ||
    photo.pet_id !== pet.id
  ) {
    notFound();
  }

  const { data: signedPhoto, error: signedPhotoError } = await supabase.storage
    .from("pet-photos")
    .createSignedUrl(photo.storage_path, 3600);
  const displayedTimestamp = photoTimestamp(photo);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-12">
      <Link className="text-sm underline" href={`/pets/${pet.id}`}>
        {pet.name}の思い出へ戻る
      </Link>

      <header>
        <p className="text-sm text-zinc-500">{pet.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">思い出写真</h1>
      </header>

      {signedPhotoError || !signedPhoto?.signedUrl ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          写真を表示できませんでした。
        </p>
      ) : (
        <div className="relative aspect-square overflow-hidden rounded bg-zinc-100">
          <Image
            className="size-full object-contain"
            src={signedPhoto.signedUrl}
            alt={`${pet.name}の思い出写真`}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            priority
            unoptimized
          />
        </div>
      )}

      <dl className="grid gap-4 rounded border border-zinc-200 p-4 text-sm">
        <div>
          <dt className="text-zinc-500">撮影日時</dt>
          <dd className="mt-1">{formatTokyoDateTime(displayedTimestamp)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">お気に入り</dt>
          <dd className="mt-1">
            {photo.favorite ? "お気に入りに登録済み" : "お気に入りではありません"}
          </dd>
        </div>
        {photo.caption ? (
          <div>
            <dt className="text-zinc-500">キャプション</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">{photo.caption}</dd>
          </div>
        ) : null}
      </dl>
    </main>
  );
}
