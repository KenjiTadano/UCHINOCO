import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Bottom-nav entry: land on a pet's album TOP (PetSwitcher handles the rest). */
export default async function SelectPetForAlbumPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pets, error } = await supabase
    .from("pets")
    .select("id")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  if (error || !pets?.length) redirect("/pets/new");
  redirect(`/pets/${pets[0].id}/album`);
}
