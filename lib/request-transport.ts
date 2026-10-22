/** Transport metadata only; never an authentication/authorization assertion. */
export function requestTransport(headers: Pick<Headers, "get">, url?: string) {
  let query = false;
  try { query = Boolean(url && new URL(url).searchParams.has("_rsc")); } catch { /* no URL evidence */ }
  const rsc = headers.get("rsc") === "1" || query || (headers.get("accept") ?? "").includes("text/x-component");
  const prefetch = headers.get("next-router-prefetch") === "1" || (headers.get("purpose") ?? "").includes("prefetch") || (headers.get("sec-purpose") ?? "").includes("prefetch");
  return { kind: rsc ? prefetch ? "prefetch" as const : "rsc" as const : "document" as const, rsc, prefetch, query };
}
