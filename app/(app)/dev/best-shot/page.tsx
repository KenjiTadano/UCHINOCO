import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BestShotLab, type BestShotPhotoOption } from "./best-shot-lab";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SearchParams = Promise<{ petId?: string }>;

export default async function BestShotDevPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (process.env.NODE_ENV === "production") redirect("/home");
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
    .order("taken_at", { ascending: true })
    .limit(80);

  const rows = (photoRows ?? []).filter((photo) => petNameById.has(photo.pet_id));
  const photos: BestShotPhotoOption[] = rows.map((photo) => ({
    id: photo.id,
    petId: photo.pet_id,
    petName: petNameById.get(photo.pet_id) ?? "ペット",
    takenAt: photo.taken_at ?? photo.created_at,
  }));

  const initialPetId =
    params.petId && petNameById.has(params.petId) ? params.petId : (photos[0]?.petId ?? null);

  return <BestShotLab photos={photos} initialPetId={initialPetId} />;
}
