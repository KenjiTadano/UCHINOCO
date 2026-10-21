import { requestAuthTrace, traceAuthStage } from "../auth-performance";
import { authMeasuredFetch, authTraceEnabled, currentAuthPhase, authTraceEvent } from "../auth-performance-core";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient(requestFetch?: typeof fetch) {
  return traceAuthStage("supabase.client", async () => {
  const cookieStore = await cookies();

  const trace = authTraceEnabled() ? await requestAuthTrace() : null;
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(trace ? { global: { fetch: authMeasuredFetch(trace, requestFetch ?? fetch) } } : requestFetch ? { global: { fetch: requestFetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          const started = performance.now();
          let written = false;
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
            written = true;
          } catch {
            // Server Components cannot write cookies. The root proxy refreshes
            // sessions before rendering; Server Actions and Route Handlers can
            // write through this cookie store.
          } finally {
            if (trace) authTraceEvent(trace, written ? "session.cookies-written" : "session.cookies-readonly", performance.now() - started);
          }
        },
      },
    },
  );
  if (trace) {
    const getUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = (...args) => traceAuthStage(`${currentAuthPhase() ?? "helper"}.getUser`, () => getUser(...args));
    const signIn = client.auth.signInWithPassword.bind(client.auth);
    client.auth.signInWithPassword = (...args) => traceAuthStage("login.signInWithPassword", () => signIn(...args));
  }
  return client;
  });
}
