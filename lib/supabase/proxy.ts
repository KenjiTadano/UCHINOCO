import { AUTH_REQUEST_KIND_HEADER, AUTH_IO_VARIANT_HEADER, AUTH_TRACE_HEADER, AUTH_START_HEADER, AUTH_ROUTE_HEADER, authTraceEnabled, newAuthTrace, authRoute, authMeasuredFetch, authTraceWork, authTraceEvent } from "../auth-performance-core";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  const trace = authTraceEnabled() ? newAuthTrace(authRoute(request.nextUrl.pathname, request.nextUrl.searchParams.get("view"))) : null;
  if (trace) trace.requestKind = request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch" ? "prefetch" : request.headers.get("rsc") === "1" || request.nextUrl.searchParams.has("_rsc") ? "rsc" : "document";
  const run = async () => {
  const next = () => {
    const forwarded = new Headers(request.headers);
    // Always overwrite incoming correlation metadata; it is never an auth assertion.
    forwarded.delete(AUTH_REQUEST_KIND_HEADER);
    if (trace) forwarded.set(AUTH_REQUEST_KIND_HEADER, trace.requestKind!);
    forwarded.delete(AUTH_IO_VARIANT_HEADER);
    if (process.env.VERCEL_ENV === "preview") forwarded.set(AUTH_IO_VARIANT_HEADER, request.nextUrl.searchParams.get("ioMode") === "baseline" ? "baseline" : "candidate");
    if (trace) {
      forwarded.set(AUTH_TRACE_HEADER, trace.requestId);
      forwarded.set(AUTH_START_HEADER, String(trace.started));
      forwarded.set(AUTH_ROUTE_HEADER, trace.route);
    } else {
      forwarded.delete(AUTH_TRACE_HEADER); forwarded.delete(AUTH_START_HEADER); forwarded.delete(AUTH_ROUTE_HEADER);
    }
    return NextResponse.next({ request: { headers: forwarded } });
  };
  let response = next();

  const clientStarted = performance.now();
  if (trace) authTraceEvent(trace, "proxy.client.start");
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      ...(trace ? { global: { fetch: authMeasuredFetch(trace) } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = next();

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    },
  );

  if (trace) authTraceEvent(trace, "proxy.client.end", performance.now() - clientStarted);
  const verify = async () => { await supabase.auth.getClaims(); };
  if (trace) await authTraceWork(trace, "proxy.getClaims", verify);
  else await verify();

  return response;
  };
  return trace ? authTraceWork(trace, "proxy", run) : run();
}
