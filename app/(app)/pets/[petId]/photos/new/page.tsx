import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhotoUploadForm } from "./photo-upload-form";

type NewPhotosPageProps = {
  params: Promise<{ petId: string }>;
};

export default async function NewPhotosPage({ params }: NewPhotosPageProps) {
  const { petId } = await params;
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
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-sm text-zinc-500">{pet.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">思い出写真を追加</h1>
      </header>

      <PhotoUploadForm petId={pet.id} petName={pet.name} />
    </main>
  );
}
