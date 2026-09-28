import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import {
  SmartLayoutLab,
  type SmartLayoutPhotoOption,
} from "./smart-layout-lab";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ petId?: string }>;

export default async function SmartLayoutDevPage({
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

  const petNameById = new Map((pets ?? []).map((p) => [p.id, p.name]));

  const { data: photoRows } = await supabase
    .from("photos")
    .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
    .eq("uploader_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (photoRows ?? []).filter((p) => petNameById.has(p.pet_id));
  const { signedUrlByPath } = await createListImageUrls(supabase, rows);

  const photos: SmartLayoutPhotoOption[] = rows.map((p) => {
    const path = listImagePath(p);
    return {
      id: p.id,
      petId: p.pet_id,
      petName: petNameById.get(p.pet_id) ?? "ペット",
      thumbUrl: signedUrlByPath.get(path) ?? null,
      takenAt: p.taken_at ?? p.created_at,
    };
  });

  const initialPetId =
    params.petId && petNameById.has(params.petId)
      ? params.petId
      : (photos[0]?.petId ?? null);

  return <SmartLayoutLab photos={photos} initialPetId={initialPetId} />;
}
