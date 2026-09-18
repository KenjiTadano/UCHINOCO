import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function CheckoutPaymentPage({ params }: Props) {
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
    .select("id, owner_user_id, pet_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!album) notFound();

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}/checkout`}>
        注文確認へ戻る
      </Link>

      <div className="grid gap-5 py-10 text-center">
        <div>
          <p className="ds-editorial">PAYMENT</p>
          <h1 className="ds-heading mt-2">お支払い</h1>
        </div>
        <p className="app-description mx-auto max-w-xs">
          配送先の入力が完了しました。お支払い機能は次のステップで実装されます（Task045-3）。
        </p>
        <Link
          href={`/pets/${petId}/album/${albumId}/checkout`}
          className="app-button-secondary mx-auto w-fit"
        >
          注文確認へ戻る
        </Link>
      </div>
    </main>
  );
}
