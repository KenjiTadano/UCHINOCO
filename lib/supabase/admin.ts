import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Use ONLY in:
 *   1. Order creation Server Action (Task045-3b)
 *   2. Stripe webhook handler (Task045-3c)
 *
 * Never use for normal photo / pet / album UI paths — use createClient()
 * (server.ts) with user session + RLS instead.
 *
 * The calling Server Action is responsible for verifying:
 *   - auth.getUser() (authenticated user)
 *   - album ownership (owner_user_id === user.id)
 *   - pet ownership  (owner_user_id === user.id)
 *   - album.pet_id === route petId
 * Do NOT rely on service role as a substitute for authorization checks.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
