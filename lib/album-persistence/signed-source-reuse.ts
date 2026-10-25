import "server-only";
import { getCache } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reuseSignedSourceMap } from "./signed-source-lease";

import { sourceReuseEnabled } from "./source-reuse-mode";
export { sourceReuseEnabled } from "./source-reuse-mode";

/** Only postprocess sources obtained after fresh route/photo authorization. */
export async function applySourceReuse(supabase: SupabaseClient, userId: string, fresh: Map<string, string>, enabled: boolean) {
  if (!enabled || !sourceReuseEnabled("candidate") || !process.env.VERCEL_GIT_COMMIT_SHA || process.env.SUSPENSE_CACHE_DEBUG === "true") return fresh;
  const start = performance.now();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return fresh;
    const cache = getCache({ namespace: "uchinoco-preview-source-lease-v1", keyHashFunction: key => key });
    const result = await reuseSignedSourceMap(fresh, {
      verifiedUserId: userId,
      sessionUserId: data.session.user.id,
      accessToken: data.session.access_token,
      sessionExpiresAt: (data.session.expires_at ?? 0) * 1000,
      scope: `preview:${process.env.VERCEL_PROJECT_ID ?? "uchinoco"}:${process.env.VERCEL_GIT_COMMIT_SHA}`,
    }, { get: key => cache.get(key), set: (key, value, ttl) => cache.set(key, value, { ttl, name: "" }) });
    console.info("Signed source lease", JSON.stringify({ outcome: result.outcome, photoCount: fresh.size, reusedCount: result.reusedCount, durationMs: Math.round(performance.now() - start) }));
    return result.urls;
  } catch {
    console.info("Signed source lease", JSON.stringify({ outcome: "adapter-unavailable", photoCount: fresh.size, reusedCount: 0, durationMs: Math.round(performance.now() - start) }));
    return fresh;
  }
}
