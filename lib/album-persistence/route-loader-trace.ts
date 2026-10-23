import "server-only";
/** Preview-only stage durations. Never log route identities, URLs or request credentials. */
export async function traceRouteLoader<T>(stage: string, work: () => PromiseLike<T> | T): Promise<T> {
  const start = performance.now();
  try { return await work(); }
  finally { if (process.env.VERCEL_ENV === "preview") console.info("Album route loader", JSON.stringify({ stage, durationMs: Math.round(performance.now() - start) })); }
}
