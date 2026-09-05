import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PetDeleteControl } from "./pet-delete-control";
import { PetEditForm } from "./pet-edit-form";

type PetEditPageProps = {
  params: Promise<{ petId: string }>;
};

export default async function PetEditPage({ params }: PetEditPageProps) {
  const { petId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select(
      "id, owner_user_id, name, species, breed, gender, birthday, adoption_date, avatar_url",
    )
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet || pet.owner_user_id !== user.id) {
    notFound();
  }

  const avatarResult = pet.avatar_url
    ? await supabase.storage
        .from("pet-avatars")
        .createSignedUrl(pet.avatar_url, 3600)
    : { data: null, error: null };

  return (
    <main className="app-page-narrow">
      <header>
        <p className="app-eyebrow">{pet.name}</p>
        <h1 className="app-title">プロフィールを編集</h1>
      </header>

      <PetEditForm
        petId={pet.id}
        initialValues={{
          name: pet.name,
          species: pet.species,
          breed: pet.breed ?? "",
          gender: pet.gender ?? "",
          birthday: pet.birthday,
          adoption_date: pet.adoption_date ?? "",
        }}
        currentAvatarUrl={avatarResult.data?.signedUrl ?? null}
      />

      <PetDeleteControl petId={pet.id} petName={pet.name} />
    </main>
  );
}
