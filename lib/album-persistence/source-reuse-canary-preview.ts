import "server-only";
import { admissionActive, admissionDigest, parsePinnedAdmission } from "./finite-source-admission";
import { readCanaryPolicy } from "./source-reuse-canary-policy";

/** Readiness demonstration only. Production activation remains impossible. */
export async function previewCanaryAllows(route: string, verifiedUserId: string) {
  if (process.env.VERCEL_ENV !== "preview" || route !== "edit") return false;
  const manifest = parsePinnedAdmission(process.env.SOURCE_REUSE_ADMISSION, process.env.SOURCE_REUSE_ADMISSION_DIGEST, { environment: process.env.VERCEL_ENV, build: process.env.VERCEL_GIT_COMMIT_SHA, region: process.env.VERCEL_REGION });
  if (!manifest || !admissionActive(manifest)) return false;
  const id = process.env.SOURCE_REUSE_CONTROL_ID;
  const token = process.env.SOURCE_REUSE_CONTROL_TOKEN;
  if (!id || !/^ecfg_[a-zA-Z0-9]+$/.test(id) || !token) return false;
  const enabled = await readCanaryPolicy(async signal => {
    const response = await fetch(`https://global-config.vercel.com/${id}/item/editReuse`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("Control unavailable");
    const value = await response.json();
    if (value?.manifestDigest !== admissionDigest(manifest)) throw new Error("Control scope mismatch");
    return value;
  }, route, verifiedUserId);
  console.info("Source reuse control", JSON.stringify({ route: "edit", enabled }));
  return enabled;
}
