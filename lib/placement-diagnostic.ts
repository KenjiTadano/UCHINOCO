import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { newPlacementTrace, placementMeasuredFetch, type PlacementRoute } from "./placement-diagnostic-core";

// Only diagnostic counters are memoized within a React server request.
const requestTrace = cache(() => {
  const trace = newPlacementTrace(process.env.VERCEL_REGION);
  after(() => { console.info("Placement diagnostic", JSON.stringify(trace)); });
  return trace;
});
export function markPlacementRoute(route: PlacementRoute) { requestTrace().route = route; }
export function placementFetch(): typeof fetch {
  return placementMeasuredFetch(requestTrace(), process.env.NEXT_PUBLIC_SUPABASE_URL, fetch);
}
