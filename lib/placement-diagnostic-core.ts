const PHYSICAL_SEEN = Symbol("placement-response-identifiers");
export type PlacementRoute = "home" | "preview" | "complete" | "edit" | "page-editor" | "print" | "other";
export type PlacementTrace = { cache: Record<string, number>; lifecycleMs?: number; runtimeRegion: string; route: PlacementRoute; auth: { count: number; durationMs: number }; db: { count: number; durationMs: number }; storage: { count: number; durationMs: number } };
export function newPlacementTrace(region: string | undefined): PlacementTrace {
  return { cache: {}, runtimeRegion: region && /^[a-z]{3}[0-9]$/.test(region) ? region : "unknown", route: "other", auth: { count: 0, durationMs: 0 }, db: { count: 0, durationMs: 0 }, storage: { count: 0, durationMs: 0 } };
}
export function placementMeasuredFetch(trace: PlacementTrace, origin: string | undefined, upstream: typeof fetch): typeof fetch {
  const internal = trace as PlacementTrace & { [PHYSICAL_SEEN]?: { auth: Set<string>; db: Set<string>; storage: Set<string> } };
  if (!internal[PHYSICAL_SEEN]) Object.defineProperty(internal, PHYSICAL_SEEN, { value: { auth: new Set<string>(), db: new Set<string>(), storage: new Set<string>() } });
  const seen = internal[PHYSICAL_SEEN]!;
  return async (input, init) => {
    let category: "auth" | "db" | "storage" | null = null;
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (origin && url.origin === new URL(origin).origin) {
        if (url.pathname.startsWith("/auth/v1/")) category = "auth";
        else if (url.pathname.startsWith("/rest/v1/")) category = "db";
        else if (url.pathname.startsWith("/storage/v1/")) category = "storage";
      }
    } catch { /* Unknown destinations are forwarded unchanged and never logged. */ }
    const started = performance.now();
    try {
      const response = await upstream(input, init);
      if (category) {
        const id = response.headers.get("sb-request-id") ?? response.headers.get("x-request-id");
        if (id && !seen[category].has(id)) { seen[category].add(id); trace.cache[category + "ResponseIds"] = (trace.cache[category + "ResponseIds"] ?? 0) + 1; }
        if (!id) trace.cache[category + "Unattributed"] = (trace.cache[category + "Unattributed"] ?? 0) + 1;
      }
      return response;
    }
    finally {
      if (category) { trace[category].count += 1; trace[category].durationMs += Math.round(performance.now() - started); }
    }
  };
}

const DIAGNOSTIC_TRACE = Symbol("placement-diagnostic-counter");
export function attachPlacementTrace<T extends object>(client: T, trace: PlacementTrace): T {
  Object.defineProperty(client, DIAGNOSTIC_TRACE, { value: trace }); return client;
}
export function recordPlacementCounter(client: object, name: "urlHit" | "urlMiss" | "presenceHit" | "presenceMiss" | "presenceChecks" | "signingMs", count = 1) {
  const trace = (client as { [DIAGNOSTIC_TRACE]?: PlacementTrace })[DIAGNOSTIC_TRACE];
  if (trace) trace.cache[name] = (trace.cache[name] ?? 0) + count;
}
