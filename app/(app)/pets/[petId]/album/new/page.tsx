import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlbumCreateForm } from "./album-create-form";
import { AlbumGeneratingScreen } from "./album-generating-screen";

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

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet || pet.owner_user_id !== user.id) notFound();

  const { count: photoCount } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("pet_id", pet.id)
    .eq("uploader_user_id", user.id);

  const backHref = `/pets/${pet.id}/album`;
  const count = photoCount ?? 0;

  // UI preview only — does not run createAlbumDraft
  if (preview === "generating") {
    return (
      <AlbumGeneratingScreen
        petName={pet.name}
        photoCount={count}
        backHref={backHref}
        activeStep={3}
      />
    );
  }

  return (
    <AlbumCreateForm
      petId={pet.id}
      petName={pet.name}
      photoCount={count}
      backHref={backHref}
    />
  );
}
