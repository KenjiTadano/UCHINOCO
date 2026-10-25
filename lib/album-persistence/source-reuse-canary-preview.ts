import "server-only";
import { readCanaryPolicy } from "./source-reuse-canary-policy";

/** Readiness demonstration only. Production activation remains impossible. */
export async function previewCanaryAllows(route: string, verifiedUserId: string) {
  if (process.env.VERCEL_ENV !== "preview" || route !== "edit") return false;
  const id = process.env.SOURCE_REUSE_CONTROL_ID;
  const token = process.env.SOURCE_REUSE_CONTROL_TOKEN;
  if (!id || !/^ecfg_[a-zA-Z0-9]+$/.test(id) || !token) return false;
  const enabled = await readCanaryPolicy(async signal => {
    const response = await fetch(`https://global-config.vercel.com/${id}/item/editReuse`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("Control unavailable");
    return response.json();
  }, route, verifiedUserId);
  console.info("Source reuse control", JSON.stringify({ route: "edit", enabled }));
  return enabled;
}
