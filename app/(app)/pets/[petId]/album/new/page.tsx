import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlbumCreateForm } from "./album-create-form";

type Props = {
  params: Promise<{ petId: string }>;
};

export default async function AlbumNewPage({ params }: Props) {
  const { petId } = await params;
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

  return (
    <main className="app-page-narrow">
      <Link className="app-back-link" href={`/pets/${pet.id}/album`}>
        アルバムへ戻る
      </Link>
      <header>
        <p className="ds-editorial">ALBUM</p>
        <h1 className="app-title">{pet.name}のアルバムを作る</h1>
        {photoCount ? (
          <p className="app-description mt-2">
            {photoCount.toLocaleString()}枚の思い出から選びます
          </p>
        ) : null}
      </header>
      <AlbumCreateForm petId={pet.id} />
    </main>
  );
}
