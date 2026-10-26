import {headingSpan,headingCurrent,headingDuration,headingOutcome} from "../heading-trace-core";
import { runPrivateSourceHandoff } from "./private-source-handoff";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runEditSourceCanary, type CanaryMetrics } from "./edit-source-canary-core";
import type { CanaryEnvironment } from "./source-canary-control";

function environment(): CanaryEnvironment {
  return {
    environment: process.env.VERCEL_ENV, build: process.env.VERCEL_GIT_COMMIT_SHA, region: process.env.VERCEL_REGION,
    project: process.env.VERCEL_PROJECT_ID, enable: process.env.EDIT_SOURCE_CANARY_ENABLE,
    manifest: process.env.EDIT_SOURCE_CANARY_MANIFEST, pin: process.env.EDIT_SOURCE_CANARY_PIN,
    controlId: process.env.EDIT_SOURCE_CANARY_CONTROL_ID, controlToken: process.env.EDIT_SOURCE_CANARY_CONTROL_TOKEN,
  };
}
function metric(value: CanaryMetrics) {
  // Fixed schema only: no exceptions, IDs, paths, bindings or source values.
  console.info("Edit source canary", JSON.stringify(value));
}
export function recordEditCanaryAuthDeny() {
  if (process.env.EDIT_SOURCE_CANARY_ENABLE === "true") console.info("Edit source canary auth", JSON.stringify({ outcome: "auth-deny", count: 1 }));
}
export async function applyEditSourceCanary(supabase: SupabaseClient, verifiedUserId: string, albumId: string, fresh: Map<string, string>, petId?: string) {
  const handoff = process.env.EDIT_SOURCE_HANDOFF_ENABLE === "true" && petId ? await headingSpan("source.adapter",()=>runPrivateSourceHandoff(supabase,albumId,petId,fresh)) : null;
  if(process.env.EDIT_SOURCE_HANDOFF_ENABLE === "true" && !petId)return fresh;
  if(handoff?.handled && !handoff.canary)return fresh;
  const trace=headingCurrent();if(trace&&handoff?.canary)trace.arm=handoff.canary.control.enabled?"on":"off";
  const env = environment();
  if(handoff?.canary){env.manifest=JSON.stringify(handoff.canary.manifest);env.pin=handoff.canary.digest;}
  return runEditSourceCanary(fresh, "edit", verifiedUserId, albumId, env, {
    async control(signal) {
      if(handoff?.canary)return {version:1,enabled:handoff.canary.control.enabled,manifestDigest:handoff.canary.digest,validUntil:handoff.canary.control.validUntil};
      if (!env.controlId || !/^ecfg_[a-zA-Z0-9]+$/.test(env.controlId) || !env.controlToken) throw new Error("Control unavailable");
      const response = await fetch(`https://global-config.vercel.com/${env.controlId}/item/editReuse`, {
        headers: { Authorization: `Bearer ${env.controlToken}` }, cache: "no-store", signal,
      });
      if (!response.ok) throw new Error("Control unavailable");
      return response.json();
    },
    session: () => supabase.auth.getSession(),
    store: async namespace => {
      const { getCache } = await headingSpan("cache.sdk",()=>import("@vercel/functions"));
      const cache = getCache({ namespace, keyHashFunction: key => key });
      // SDK has no AbortSignal support; shared deadline ignores late results.
      return { get: key => headingSpan("cache.get",()=>cache.get(key)), set: (key, value, ttl) => headingSpan("cache.set",()=>cache.set(key, value, { ttl, name: "" })) };
    },
    metric: value => {headingDuration("source.optional",value.optionalElapsedMs);headingOutcome(value.outcome,value.reusedCount);metric({...value,controlElapsedMs:value.controlElapsedMs+(handoff?.canary?.controlElapsedMs??0)});},
  });
}
