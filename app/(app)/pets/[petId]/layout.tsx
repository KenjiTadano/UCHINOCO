import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PetAuthorizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ petId: string }>;
}) {
  const { petId } = await params;
  if (!UUID_PATTERN.test(petId)) {
    notFound();
  }

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
    .select("id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet) {
    notFound();
  }

  return children;
}
