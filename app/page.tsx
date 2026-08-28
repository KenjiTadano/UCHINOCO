import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  redirect(!error && data?.claims ? "/home" : "/login");
}
