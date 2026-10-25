import { createHash } from "node:crypto";

/** Allocation is not authorization. Call only after the route has verified ownership. */
export function canaryPolicyAllows(route: string, verifiedUserId: string, value: unknown, now = Date.now()) {
  if (route !== "edit" || !verifiedUserId || !value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (p.version !== 1 || p.enabled !== true || !Number.isInteger(p.basisPoints) || Number(p.basisPoints) <= 0 || Number(p.basisPoints) > 10000 || typeof p.validUntil !== "number" || !Number.isFinite(p.validUntil) || p.validUntil <= now || p.validUntil > now + 15 * 60_000) return false;
  const allocation = createHash("sha256").update(`uchinoco-edit-reuse-cohort-v1\0${verifiedUserId}`).digest().readUInt32BE(0) % 10000;
  return allocation < Number(p.basisPoints);
}

/** No request/process cache: a missing, slow or invalid control always disables reuse. */
export async function readCanaryPolicy(read: (signal: AbortSignal) => Promise<unknown>, route: string, userId: string) {
  if (route !== "edit" || !userId) return false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([read(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Control timeout")); }, 200);
    })]);
    return canaryPolicyAllows(route, userId, value);
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}
