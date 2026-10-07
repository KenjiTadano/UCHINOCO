import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { PlusUpsell } from "@/app/(app)/_components/plus-upsell";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createClient } from "@/lib/supabase/server";
import { PetForm } from "./pet-form";

export default async function NewPetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ count }, entitlements] = await Promise.all([
    supabase.from("pets").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
    loadUserEntitlements(supabase as unknown as SupabaseClient, user.id),
  ]);
  const canAddPet = entitlements.canUseMultiplePets || (count ?? 0) === 0;
  return (
    <main className="app-page-narrow justify-center">
      <header>
        <p className="app-eyebrow">UCHINOCO</p>
        <h1 className="app-title">うちの子を登録</h1>
      </header>

      {canAddPet ? (
        <PetForm />
      ) : (
        <PlusUpsell
          title="もう1匹のうちの子を登録する"
          description="複数ペットの登録はUCHINOCO PLUSで利用できます。既に登録済みのペットや思い出はそのまま残ります。"
          returnTo="/pets/new"
        />
      )}
    </main>
  );
}
