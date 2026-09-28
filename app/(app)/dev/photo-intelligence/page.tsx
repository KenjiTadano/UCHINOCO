import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import {
  PhotoIntelligenceLab,
  type PhotoIntelligenceOption,
} from "./photo-intelligence-lab";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SearchParams = Promise<{ petId?: string; photoId?: string }>;

export default async function PhotoIntelligenceDevPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (process.env.NODE_ENV === "production") {
    redirect("/home");
  }

  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pets } = await supabase
    .from("pets")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true });

  const petNameById = new Map((pets ?? []).map((pet) => [pet.id, pet.name]));

  const { data: photoRows } = await supabase
    .from("photos")
    .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
    .eq("uploader_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (photoRows ?? []).filter((photo) => petNameById.has(photo.pet_id));
  const { signedUrlByPath } = await createListImageUrls(supabase, rows);

  const photos: PhotoIntelligenceOption[] = rows.map((photo) => {
    const path = listImagePath(photo);
    return {
      id: photo.id,
      petId: photo.pet_id,
      petName: petNameById.get(photo.pet_id) ?? "ペット",
      thumbUrl: signedUrlByPath.get(path) ?? null,
      takenAt: photo.taken_at ?? photo.created_at,
    };
  });

  const initialPetId =
    params.petId && petNameById.has(params.petId)
      ? params.petId
      : (photos[0]?.petId ?? null);
  const initialPhotoId =
    params.photoId && photos.some((photo) => photo.id === params.photoId)
      ? params.photoId
      : (photos.find((photo) => photo.petId === initialPetId)?.id ?? null);

  return (
    <PhotoIntelligenceLab
      photos={photos}
      initialPetId={initialPetId}
      initialPhotoId={initialPhotoId}
    />
  );
}
