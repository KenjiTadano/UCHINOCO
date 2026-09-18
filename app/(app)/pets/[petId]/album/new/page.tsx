import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <main className="app-page-narrow">
      <Link className="app-back-link" href={`/pets/${pet.id}/album`}>
        アルバムへ戻る
      </Link>
      <section className="px-4 py-10 text-center">
        <p className="ds-editorial mb-3">COMING SOON</p>
        <h1 className="text-xl font-semibold">アルバム作成</h1>
        <p className="app-description mx-auto mt-3 max-w-xs">
          AIが思い出の写真を選んで、一冊のアルバムにまとめます。この機能は近日公開予定です。
        </p>
        <div className="mt-6">
          <Link href={`/pets/${pet.id}/album`} className="app-button-secondary">
            アルバムへ戻る
          </Link>
        </div>
      </section>
    </main>
  );
}
