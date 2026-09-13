import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeAppReturnPath } from "@/lib/app-return-path";
import { PhotoUploadForm } from "./photo-upload-form";

type NewPhotosPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function NewPhotosPage({ params, searchParams }: NewPhotosPageProps) {
  const [{ petId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const client = supabase as unknown as SupabaseClient;
  const { data: pet, error } = await client
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !pet || pet.owner_user_id !== user.id) {
    notFound();
  }

  return (
    <main className="app-page">
      <header>
        <p className="app-eyebrow">{pet.name}</p>
        <h1 className="app-title">思い出写真を追加</h1>
      </header>

      <PhotoUploadForm
        petId={pet.id}
        returnTo={safeAppReturnPath(query.returnTo) ?? `/pets/${pet.id}`}
      />
    </main>
  );
}
