import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One production boundary for every /dev page. Individual labs may keep their
 * stricter redirect, while allowlisted internal tools (currently metrics) can
 * opt to render. An empty allowlist fails closed.
 */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  if (process.env.NODE_ENV === "production") {
    const allowed = new Set(
      (process.env.UCHINOCO_INTERNAL_USER_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!allowed.has(user.id)) notFound();
  }

  return children;
}
