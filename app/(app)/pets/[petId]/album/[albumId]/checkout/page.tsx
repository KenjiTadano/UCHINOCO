import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumCheckoutPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // IDOR: album ownership + petId route match
  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, title")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!album) notFound();

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}/product`}>
        商品選択へ戻る
      </Link>

      <div className="grid gap-5 py-10 text-center">
        <div>
          <p className="ds-editorial">CHECKOUT</p>
          <h1 className="ds-heading mt-2">注文確認</h1>
        </div>
        <p className="app-description mx-auto max-w-xs">
          この画面はまもなく実装されます。配送先の入力・送料の確認・お支払いができるようになります。
        </p>
        <Link
          href={`/pets/${petId}/album/${albumId}/product`}
          className="app-button-secondary mx-auto w-fit"
        >
          商品選択へ戻る
        </Link>
      </div>
    </main>
  );
}
