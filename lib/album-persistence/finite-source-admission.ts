import { createHash } from "node:crypto";

export type AdmissionGroup = { sessionTag: string; sourceSetTag: string; bindings: [string, string] };
export type FiniteAdmission = { version: 1; environment: "preview" | "production"; trial: string; build: string; region: string; startWindow: number; groups: AdmissionGroup[] };
export type AdmissionRuntime = { environment: string | undefined; build: string | undefined; region: string | undefined };
const opaque = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

/** Immutable deployment input, never a request/query enrollment list. */
export function parseFiniteAdmission(raw: string | undefined, runtime: AdmissionRuntime): FiniteAdmission | null {
  if (!raw || raw.length > 8192 || !["preview", "production"].includes(runtime.environment ?? "")) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || m.version !== 1 || m.environment !== runtime.environment || m.region !== "sin1" || typeof m.trial !== "string" || !/^[a-z0-9-]{1,48}$/.test(m.trial) || !runtime.build || m.build !== runtime.build || !runtime.region || m.region !== runtime.region || !Number.isSafeInteger(m.startWindow) || m.startWindow <= 0 || !Array.isArray(m.groups) || m.groups.length < 1 || m.groups.length > 2) return null;
    const sessions = new Set<string>(), bindings = new Set<string>();
    for (const g of m.groups) {
      if (!g || !opaque(g.sessionTag) || !opaque(g.sourceSetTag) || sessions.has(g.sessionTag) || !Array.isArray(g.bindings) || g.bindings.length !== 2) return null;
      sessions.add(g.sessionTag);
      for (const b of g.bindings) { if (!opaque(b) || bindings.has(b)) return null; bindings.add(b); }
    }
    // Construct a new bounded object; runtime control cannot inject replacement properties.
    return Object.freeze({ version: 1 as const, environment: m.environment, trial: m.trial, build: m.build, region: m.region, startWindow: m.startWindow,
      groups: Object.freeze(m.groups.map((g: AdmissionGroup) => Object.freeze({ sessionTag: g.sessionTag, sourceSetTag: g.sourceSetTag, bindings: Object.freeze([...g.bindings]) }))) }) as unknown as FiniteAdmission;
  } catch { return null; }
}
export function admissionActive(m: FiniteAdmission, now = Date.now()) {
  const window = Math.floor(now / 300000);
  return window >= m.startWindow && window < m.startWindow + 2;
}
export function admissionAllows(m: FiniteAdmission, sessionTag: string, sourceSetTag: string, binding: string, now = Date.now()) {
  if (!admissionActive(m, now)) return false;
  const offset = Math.floor(now / 300000) - m.startWindow;
  return m.groups.some(g => g.sessionTag === sessionTag && g.sourceSetTag === sourceSetTag && g.bindings[offset] === binding);
}
export function admissionDigest(m: FiniteAdmission) { return createHash("sha256").update(JSON.stringify(m)).digest("hex"); }
export function admissionScope(project: string, m: Pick<FiniteAdmission, "environment" | "build" | "trial">, albumId: string) {
  return `${m.environment}:${project}:${m.build}:trial:${m.trial}:album:${albumId}`;
}

export function parsePinnedAdmission(raw: string | undefined, digest: string | undefined, runtime: AdmissionRuntime) {
  if (!opaque(digest)) return null;
  const m = parseFiniteAdmission(raw, runtime);
  return m && admissionDigest(m) === digest ? m : null;
}

