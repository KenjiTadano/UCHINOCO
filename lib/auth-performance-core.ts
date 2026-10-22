import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { channel } from "node:diagnostics_channel";
import { randomUUID } from "node:crypto";

export const AUTH_DELIVERY_MODE_HEADER = "x-uchinoco-delivery-mode";
export const AUTH_REQUEST_KIND_HEADER = "x-uchinoco-request-kind";
export const AUTH_IO_VARIANT_HEADER = "x-uchinoco-io-variant";
export const AUTH_TRACE_HEADER = "x-uchinoco-auth-trace";
export const AUTH_START_HEADER = "x-uchinoco-auth-start";
export const AUTH_ROUTE_HEADER = "x-uchinoco-auth-route";
export const authTraceEnabled = () => process.env.VERCEL_ENV === "preview" || process.env.UCHINOCO_AUTH_PERF === "1";
export type AuthTrace = { requestId: string; route: string; started: number; deliveryMode?: "baseline" | "candidate"; requestKind?: "document" | "rsc" | "prefetch"; ioVariant?: "baseline" | "candidate"; ioMetrics?: Record<string, { count: number; durationMs: number; maxMs: number; maxCount?: number }>; dbHttpByTable?: Record<string, number>; supabaseCounts?: { selectHttp: number; writeHttp: number; rpcHttp: number; storageHttp: number } };
const scope = new AsyncLocalStorage<{ trace: AuthTrace; phase: string }>();
const routes = new Set(["login", "home", "pet", "complete", "preview", "detail", "edit", "page-editor", "cover", "print", "create", "other"]);
export function authRoute(pathname: string, view?: string | null) {
  if (pathname === "/login") return "login";
  if (pathname === "/home") return "home";
  if (/\/pages\/edit$/.test(pathname)) return "page-editor";
  if (/\/cover\/edit$/.test(pathname)) return "cover";
  if (/\/album\/new$/.test(pathname)) return "create";
  if (/\/album\/[^/]+\/print$/.test(pathname)) return "print";
  if (/\/album\/[^/]+\/edit$/.test(pathname)) return "edit";
  if (/\/album\/[^/]+$/.test(pathname)) return view === "preview" ? "preview" : view === "complete" ? "complete" : "detail";
  return /^\/pets\/[^/]+$/.test(pathname) ? "pet" : "other";
}
export function newAuthTrace(route = "other"): AuthTrace { return { requestId: randomUUID(), route: routes.has(route) ? route : "other", started: Date.now() }; }
export function forwardedAuthTrace(headers: Headers): AuthTrace {
  const id = headers.get(AUTH_TRACE_HEADER);
  const start = Number(headers.get(AUTH_START_HEADER));
  const route = headers.get(AUTH_ROUTE_HEADER) ?? "other";
  return { deliveryMode: process.env.VERCEL_ENV === "preview" && headers.get(AUTH_DELIVERY_MODE_HEADER) === "baseline" ? "baseline" : "candidate", requestKind: headers.get(AUTH_REQUEST_KIND_HEADER) === "prefetch" ? "prefetch" : headers.get(AUTH_REQUEST_KIND_HEADER) === "rsc" ? "rsc" : "document", ioVariant: process.env.VERCEL_ENV === "preview" && headers.get(AUTH_IO_VARIANT_HEADER) === "baseline" ? "baseline" : "candidate", requestId: id && /^[a-f0-9-]{36}$/.test(id) ? id : randomUUID(), route: routes.has(route) ? route : "other", started: Number.isFinite(start) && start > Date.now() - 300_000 && start <= Date.now() ? start : Date.now() };
}
// Diagnostic metadata only. Never attach user/session/query arguments to this scope.
export const currentAuthTrace = () => scope.getStore()?.trace;
export const currentAuthPhase = () => scope.getStore()?.phase;
export function authTraceEvent(trace: AuthTrace, phase: string, durationMs?: number, status?: number) {
  if (!authTraceEnabled()) return;
  console.info("Auth request stage", JSON.stringify({ requestId: trace.requestId, route: trace.route, phase, elapsedMs: Date.now() - trace.started, ...(durationMs === undefined ? {} : { durationMs: Math.round(durationMs) }), ...(status === undefined ? {} : { status }) }));
}
export async function authTraceWork<T>(trace: AuthTrace, phase: string, work: () => PromiseLike<T>): Promise<T> {
  if (!authTraceEnabled()) return await work();
  const start = performance.now();
  if (!phase.includes("fetch.storage") && phase !== "print.image-download" && phase !== "print.raster-orientation") authTraceEvent(trace, `${phase}.start`);
  return scope.run({ trace, phase }, async () => {
    try { return await work(); }
    finally { authTraceEvent(trace, `${phase}.end`, performance.now() - start); }
  });
}
export function recordIoMetric(trace: AuthTrace, metric: string, count: number, durationMs = 0) {
  const metrics = trace.ioMetrics ??= {};
  const value = metrics[metric] ??= { count: 0, durationMs: 0, maxMs: 0, maxCount: 0 };
  value.count += count; value.durationMs += Math.round(durationMs); value.maxMs = Math.max(value.maxMs, Math.round(durationMs)); value.maxCount = Math.max(value.maxCount ?? 0, count);
}
const physicalRequests = new WeakMap<object, { trace: AuthTrace; metric: string; started: number }>();
channel("undici:request:headers").subscribe(event => {
  const request = (event as { request?: object }).request;
  const active = request && physicalRequests.get(request);
  if (!active) return;
  recordIoMetric(active.trace, active.metric + ".headers", 1, performance.now() - active.started);
  physicalRequests.delete(request!);
});
channel("undici:request:error").subscribe(event => {
  const request = (event as { request?: object }).request;
  const active = request && physicalRequests.get(request);
  if (!active) return;
  recordIoMetric(active.trace, active.metric + ".error", 1, performance.now() - active.started);
  physicalRequests.delete(request!);
});
// Observes actual undici request creation, below Next's fetch memoization. No headers/body/URL are logged.
channel("undici:request:create").subscribe((event) => {
  const active = scope.getStore();
  if (!active || !authTraceEnabled()) return;
  const request = (event as { request?: { origin?: string; path?: string; method?: string } }).request;
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured || !request?.origin || !request.path) return;
  try { if (new URL(request.origin).origin !== new URL(configured).origin) return; } catch { return; }
  if (request.path.startsWith("/auth/v1/")) {
    authTraceEvent(active.trace, request.path.startsWith("/auth/v1/.well-known/") ? "http.auth.jwks" : "http.auth.request");
  } else if (request.path.startsWith("/rest/v1/")) {
    const table = request.path.split("?")[0].split("/").at(-1) ?? "other";
    const allowedTables = new Set(["albums", "pets", "album_pets", "album_draft_versions", "album_draft_spreads", "album_draft_frames", "album_draft_text_elements", "album_draft_decorations", "album_draft_page_elements", "album_draft_spread_backgrounds", "album_draft_covers", "photos", "album_print_snapshots"]);
    const label = allowedTables.has(table) ? table : "other";
    physicalRequests.set(request, { trace: active.trace, metric: `db.http.${label}`, started: performance.now() });
    const byTable = active.trace.dbHttpByTable ??= {};
    byTable[label] = (byTable[label] ?? 0) + 1;
    const counts = active.trace.supabaseCounts ??= { selectHttp: 0, writeHttp: 0, rpcHttp: 0, storageHttp: 0 };
    if (request.path.startsWith("/rest/v1/rpc/")) counts.rpcHttp++;
    else if (request.method === "GET" || request.method === "HEAD") counts.selectHttp++;
    else counts.writeHttp++;
  } else if (request.path.startsWith("/storage/v1/")) {
    const counts = active.trace.supabaseCounts ??= { selectHttp: 0, writeHttp: 0, rpcHttp: 0, storageHttp: 0 };
    counts.storageHttp++;
  }
});
export function authMeasuredFetch(trace: AuthTrace, downstream: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    if (!authTraceEnabled()) return downstream(input, init);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.match(/^\/rest\/v1\/(pets|albums|album_pets)$/)?.[1];
    const queryTable = url.pathname.match(/^\/rest\/v1\/(album_draft_versions|album_draft_spreads|album_draft_frames|album_draft_text_elements|album_draft_decorations|album_draft_page_elements|album_draft_spread_backgrounds|album_draft_covers|photos|album_print_snapshots)$/)?.[1];
    const kind = url.pathname.startsWith("/auth/v1/") ? "fetch.auth" : table ? `fetch.validation.${table}` : url.pathname.startsWith("/rest/v1/rpc/") ? "fetch.db.rpc" : url.pathname.startsWith("/rest/v1/") ? "fetch.db" : url.pathname.startsWith("/storage/v1/") ? "fetch.storage" : null;
    if (!kind) return downstream(input, init);
    const phase = `${currentAuthPhase() ?? "helper"}.${kind}${queryTable ? "." + queryTable : ""}`;
    return authTraceWork(trace, phase, async () => {
      const response = await downstream(input, init);
      if (kind === "fetch.auth") authTraceEvent(trace, `${phase}.response`, undefined, response.status);
      return response;
    });
  };
}

/** Preview-only controlled comparison; never changes authentication or delivery security. */
export const baselineProgressiveDelivery = () => process.env.VERCEL_ENV === "preview" && currentAuthTrace()?.deliveryMode === "baseline";
