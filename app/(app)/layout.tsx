import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNavigation } from "./_components/bottom-navigation";
import { LegalNavigation } from "../_components/legal-navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <>
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
        <LegalNavigation />
      </div>
      <BottomNavigation />
    </>
  );
}
