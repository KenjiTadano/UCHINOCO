import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { newPlacementTrace, placementMeasuredFetch, attachPlacementTrace, type PlacementRoute } from "./placement-diagnostic-core";

// Only diagnostic counters are memoized within a React server request.
const requestTrace = cache(() => {
  const trace = newPlacementTrace(process.env.VERCEL_REGION);
  const started = performance.now();
  after(() => { trace.lifecycleMs = Math.round(performance.now() - started); console.info("Placement diagnostic", JSON.stringify(trace)); });
  return trace;
});
export function markPlacementRoute(route: PlacementRoute) { requestTrace().route = route; }
export function placementFetch(): typeof fetch {
  return placementMeasuredFetch(requestTrace(), process.env.NEXT_PUBLIC_SUPABASE_URL, fetch);
}

export function placementClient<T extends object>(client: T): T { return attachPlacementTrace(client, requestTrace()); }
