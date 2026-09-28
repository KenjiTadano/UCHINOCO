import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlbumPersistenceLab, type PersistencePhotoOption } from "./album-persistence-lab";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SearchParams = Promise<{ petId?: string }>;

export default async function AlbumPersistenceDevPage({ searchParams }: { searchParams: SearchParams }) {
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
    .select("id, pet_id, taken_at, created_at")
    .eq("uploader_user_id", user.id)
    .order("taken_at", { ascending: true })
    .limit(80);
  const photos: PersistencePhotoOption[] = (photoRows ?? [])
    .filter((photo) => petNameById.has(photo.pet_id))
    .map((photo) => ({
      id: photo.id,
      petId: photo.pet_id,
      petName: petNameById.get(photo.pet_id) ?? "ペット",
      takenAt: photo.taken_at ?? photo.created_at,
    }));
  const initialPetId = params.petId && petNameById.has(params.petId) ? params.petId : (photos[0]?.petId ?? null);
  return <AlbumPersistenceLab photos={photos} initialPetId={initialPetId} />;
}
