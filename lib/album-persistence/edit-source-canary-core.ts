import { configuredAdmission, readCanaryControl, admissionDigest, type CanaryEnvironment } from "./source-canary-control.ts";
import { admissionScope } from "./finite-source-admission.ts";
import { optionalCacheBudget, OptionalCacheTimeout } from "./optional-cache-budget.ts";
import { reuseSignedSourceMap, type LeaseStore } from "./signed-source-lease.ts";

export type CanaryMetrics = { outcome: string; count: number; reusedCount: number; controlElapsedMs: number; optionalElapsedMs: number };
type Session = { user: { id: string }; access_token: string; expires_at?: number };
export type CanaryDependencies = {
  control: (signal: AbortSignal) => Promise<unknown>;
  session: () => Promise<{ data: { session: Session | null }; error?: unknown }>;
  store: (namespace: string) => LeaseStore | Promise<LeaseStore>;
  metric: (value: CanaryMetrics) => void;
};

/** Only call with sources just signed after fresh route/photo authorization. */
export async function runEditSourceCanary(fresh: Map<string, string>, route: string, verifiedUserId: string, albumId: string, env: CanaryEnvironment, deps: CanaryDependencies, now = Date.now()) {
  const requestBegan = performance.now();
  let controlElapsedMs = 0, optionalElapsedMs = 0;
  const record = (outcome: string, reusedCount = 0) => {
    // Telemetry must never change the authorized result.
    try { deps.metric({ outcome, count: 1, reusedCount, controlElapsedMs, optionalElapsedMs }); } catch {}
  };
  const manifest = configuredAdmission(route, env, now);
  if (!manifest || !verifiedUserId || !albumId) { record("disabled"); return fresh; }
  const control = await readCanaryControl(deps.control, admissionDigest(manifest), (manifest.startWindow + 2) * 300000, now);
  controlElapsedMs = control.controlElapsedMs;
  if (!control.enabled) { record(control.outcome); return fresh; }
  const began = performance.now(), budget = optionalCacheBudget();
  try {
    const { data, error } = await budget.run("session", () => deps.session());
    if (error || !data.session) { optionalElapsedMs = Math.round(performance.now() - began); record("disabled"); return fresh; }
    let store: LeaseStore;
    try { store = await budget.run("get", () => Promise.resolve(deps.store(`uchinoco-${manifest.environment}-source-lease-v1`))); }
    catch (error) { optionalElapsedMs = Math.round(performance.now() - began); record(error instanceof OptionalCacheTimeout ? `${error.stage}-timeout` : "cache-unavailable"); return fresh; }
    const result = await reuseSignedSourceMap(fresh, {
      verifiedUserId, sessionUserId: data.session.user.id, accessToken: data.session.access_token,
      sessionExpiresAt: (data.session.expires_at ?? 0) * 1000,
      scope: admissionScope(env.project!, manifest, albumId), admission: manifest,
    }, store, Math.floor(now + performance.now() - requestBegan), budget);
    optionalElapsedMs = Math.round(performance.now() - began); record(result.outcome, result.reusedCount);
    return result.urls;
  } catch (error) {
    optionalElapsedMs = Math.round(performance.now() - began);
    record(error instanceof OptionalCacheTimeout ? `${error.stage}-timeout` : "cache-error"); return fresh;
  }
}
