import { admissionScope, parsePinnedAdmission } from "./finite-source-admission";
import { optionalCacheBudget, OptionalCacheTimeout } from "./optional-cache-budget";
import "server-only";
import { getCache } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reuseSignedSourceMap } from "./signed-source-lease";

export { sourceReuseEnabled } from "./source-reuse-mode";

/** Only postprocess sources obtained after fresh route/photo authorization. */
export async function applySourceReuse(supabase: SupabaseClient, userId: string, fresh: Map<string, string>, enabled: boolean, albumId?: string) {
  if (!enabled || process.env.VERCEL_ENV !== "preview" || !process.env.VERCEL_GIT_COMMIT_SHA || !albumId || process.env.SUSPENSE_CACHE_DEBUG === "true") return fresh;
  const manifestStart = performance.now();
  const manifest = parsePinnedAdmission(process.env.SOURCE_REUSE_ADMISSION, process.env.SOURCE_REUSE_ADMISSION_DIGEST, { environment: process.env.VERCEL_ENV, build: process.env.VERCEL_GIT_COMMIT_SHA, region: process.env.VERCEL_REGION });
  if (!manifest) return fresh;
  console.info("Album route loader", JSON.stringify({ stage: "manifest-evaluation", durationMs: Math.round(performance.now() - manifestStart) }));
  const start = performance.now();
  const budget = optionalCacheBudget();
  try {
    const { data, error } = await budget.run("session", () => supabase.auth.getSession());
    if (error || !data.session) return fresh;
    let cache;
    try { cache = getCache({ namespace: "uchinoco-preview-source-lease-v1", keyHashFunction: key => key }); } catch {
      console.info("Signed source lease", JSON.stringify({ outcome: "cache-unavailable", photoCount: fresh.size, reusedCount: 0, durationMs: Math.round(performance.now() - start) }));
      return fresh;
    }
    const result = await reuseSignedSourceMap(fresh, {
      verifiedUserId: userId,
      sessionUserId: data.session.user.id,
      accessToken: data.session.access_token,
      sessionExpiresAt: (data.session.expires_at ?? 0) * 1000,
      scope: admissionScope(process.env.VERCEL_PROJECT_ID ?? "uchinoco", manifest, albumId),
      admission: manifest,
    }, { get: key => cache.get(key), set: (key, value, ttl) => cache.set(key, value, { ttl, name: "" }) }, Date.now(), budget);
    console.info("Signed source lease", JSON.stringify({ outcome: result.outcome, photoCount: fresh.size, reusedCount: result.reusedCount, durationMs: Math.round(performance.now() - start) }));
    return result.urls;
  } catch (error) {
    console.info("Signed source lease", JSON.stringify({ outcome: error instanceof OptionalCacheTimeout ? "session-timeout" : "cache-unavailable", photoCount: fresh.size, reusedCount: 0, durationMs: Math.round(performance.now() - start) }));
    return fresh;
  }
}
