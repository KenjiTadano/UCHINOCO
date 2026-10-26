import { headingFetch, headingRun } from "../heading-trace-core";
import { headingClientTrace } from "../heading-trace-server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient() {
  const trace=headingClientTrace();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(trace?{global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>headingRun(trace,()=>headingFetch(input,init))}}:{}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. The root proxy refreshes
            // sessions before rendering; Server Actions and Route Handlers can
            // write through this cookie store.
          }
        },
      },
    },
  );
}
