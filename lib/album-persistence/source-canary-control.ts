import { admissionActive, admissionDigest, parsePinnedAdmission, type AdmissionRuntime } from "./finite-source-admission.ts";

export const CONTROL_BUDGET_MS = 200;
export type ControlOutcome = "enabled" | "disabled" | "control-timeout" | "control-error" | "control-invalid";
export type CanaryEnvironment = AdmissionRuntime & { enable?: string; manifest?: string; pin?: string; project?: string; controlId?: string; controlToken?: string };

/** Deployment input only; no branch/query/user-percentage enrollment. */
export function configuredAdmission(route: string, env: CanaryEnvironment, now = Date.now()) {
  if (route !== "edit" || env.enable !== "true" || !env.project || env.region !== "sin1") return null;
  const m = parsePinnedAdmission(env.manifest, env.pin, env);
  return m && admissionActive(m, now) ? m : null;
}

export async function readCanaryControl(read: (signal: AbortSignal) => Promise<unknown>, digest: string, end: number, now = Date.now()) {
  const started = performance.now(), controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: ControlOutcome = "control-error";
  try {
    const value = await Promise.race([Promise.resolve().then(() => read(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Control deadline")); }, CONTROL_BUDGET_MS);
    })]);
    const p = value as Record<string, unknown> | null;
    if (!p || p.version !== 1 || p.manifestDigest !== digest || p.validUntil !== end || end <= now + performance.now() - started || typeof p.enabled !== "boolean") outcome = "control-invalid";
    else outcome = p.enabled ? "enabled" : "disabled";
  } catch { outcome = controller.signal.aborted ? "control-timeout" : "control-error"; }
  finally { if (timer) clearTimeout(timer); }
  return { enabled: outcome === "enabled", outcome, controlElapsedMs: Math.round(performance.now() - started) };
}

export { admissionDigest };
