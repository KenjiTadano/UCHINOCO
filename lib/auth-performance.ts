import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { after } from "next/server";
import { authTraceEnabled, authTraceEvent, authTraceWork, currentAuthTrace, forwardedAuthTrace } from "./auth-performance-core";

const renderTrace = cache(async () => {
  const trace = forwardedAuthTrace(await headers());
  // Request APIs are resolved before after(); this callback contains diagnostic metadata only.
  after(() => { authTraceEvent(trace, "request.response-finished", Date.now() - trace.started); });
  return trace;
});
export async function requestAuthTrace() { return currentAuthTrace() ?? await renderTrace(); }
export async function traceAuthStage<T>(phase: string, work: () => PromiseLike<T>): Promise<T> {
  if (!authTraceEnabled()) return await work();
  return authTraceWork(await requestAuthTrace(), phase, work);
}
