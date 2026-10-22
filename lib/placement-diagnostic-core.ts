export type PlacementRoute = "home" | "preview" | "complete" | "edit" | "page-editor" | "print" | "other";
export type PlacementTrace = { runtimeRegion: string; route: PlacementRoute; auth: { count: number; durationMs: number }; db: { count: number; durationMs: number }; storage: { count: number; durationMs: number } };
export function newPlacementTrace(region: string | undefined): PlacementTrace {
  return { runtimeRegion: region && /^[a-z]{3}[0-9]$/.test(region) ? region : "unknown", route: "other", auth: { count: 0, durationMs: 0 }, db: { count: 0, durationMs: 0 }, storage: { count: 0, durationMs: 0 } };
}
export function placementMeasuredFetch(trace: PlacementTrace, origin: string | undefined, upstream: typeof fetch): typeof fetch {
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
    try { return await upstream(input, init); }
    finally {
      if (category) { trace[category].count += 1; trace[category].durationMs += Math.round(performance.now() - started); }
    }
  };
}
