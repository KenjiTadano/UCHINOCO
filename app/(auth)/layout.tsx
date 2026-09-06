import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LegalNavigation } from "../_components/legal-navigation";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (!error && data?.claims) {
    redirect("/home");
  }

  return (
    <>
      {children}
      <LegalNavigation />
    </>
  );
}
