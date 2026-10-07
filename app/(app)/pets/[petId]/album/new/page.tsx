import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlbumCreateForm } from "./album-create-form";
import { AlbumGeneratingScreen } from "./album-generating-screen";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Props = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export default async function AlbumNewPage({ params, searchParams }: Props) {
  const { petId } = await params;
  const { preview } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name, owner_user_id").eq("owner_user_id", user.id).order("created_at", { ascending: true });

  if (petsError || !pets) notFound();
  const pet = pets.find((item) => item.id === petId);
  if (!pet || pet.owner_user_id !== user.id) notFound();

  const petOptions = await Promise.all(
    pets.map(async (item) => {
      const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("pet_id", item.id);
      return { id: item.id, name: item.name, photoCount: count ?? 0 };
    }),
  );
  const photoCount = petOptions.find((item) => item.id === pet.id)?.photoCount ?? 0;

  const backHref = `/pets/${pet.id}/album`;
  const count = photoCount ?? 0;

  // UI preview only — does not run createAlbumDraft
  if (preview === "generating") {
    return <AlbumGeneratingScreen petName={pet.name} photoCount={count} backHref={backHref} activeStep={3} />;
  }

  return <AlbumCreateForm petId={pet.id} petName={pet.name} petOptions={petOptions} backHref={backHref} />;
}
