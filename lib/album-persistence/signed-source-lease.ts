import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const MARGIN = 30_000;
const LEASE_MS = 5 * 60_000;
const MAX_URL_AGE_MS = 50 * 60_000;
const MAX_ITEMS = 100;
const MAX_BYTES = 128 * 1024;
export type SourceLease = { verifiedUserId: string; sessionUserId: string; accessToken: string; sessionExpiresAt: number; scope: string };
export type LeaseStore = { get(key: string): Promise<unknown>; set(key: string, value: string, ttl: number): Promise<unknown> };

type Item = { identity: string; url: string; validUntil: number };
function inspect(url: string, now: number) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.hash) return null;
    const m = u.pathname.match(/^\/storage\/v1\/(object\/sign|render\/image\/sign)\/(pet-photos|pet-photo-thumbnails)\/(.+)$/);
    if (!m) return null;
    const path = decodeURIComponent(m[3]);
    if (!path || path.startsWith("/") || path.split("/").some(p => p === "." || p === "..")) return null;
    const token = u.searchParams.get("token");
    if (!token || token.length > 20_000) return null;
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now + MARGIN) return null;
    const variant = [...u.searchParams].filter(([k]) => k !== "token").sort(([a], [b]) => a.localeCompare(b));
    return { identity: JSON.stringify([u.origin, m[1], m[2], path, variant]), expiry: claims.exp * 1000 };
  } catch { return null; }
}
function encrypt(value: unknown, key: Buffer) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64url");
}
function decrypt(value: string, key: Buffer) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29 || bytes.length > MAX_BYTES) throw new Error("Invalid lease");
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"));
}
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Lease timeout")), 1000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

/** Fresh auth + RLS reads are mandatory. This cache never authenticates a request. */
export async function reuseSignedSourceMap(fresh: Map<string, string>, lease: SourceLease, store: LeaseStore, now = Date.now()) {
  const fallback = (outcome: string) => ({ urls: fresh, outcome, reusedCount: 0 });
  if (!lease.verifiedUserId || lease.sessionUserId !== lease.verifiedUserId || !lease.accessToken || !lease.scope || !Number.isFinite(lease.sessionExpiresAt) || lease.sessionExpiresAt <= now + MARGIN || fresh.size === 0 || fresh.size > MAX_ITEMS) return fallback("scope-disabled");
  const parsed = [...fresh].map(([id, url]) => ({ id, url, source: inspect(url, now) }));
  if (parsed.some(p => !p.source)) return fallback("source-unavailable");
  const identities = [...new Set(parsed.map(p => p.source!.identity))].sort();
  const key = createHmac("sha256", lease.accessToken).update("uchinoco-preview-source-lease-v1").digest();
  const binding = createHmac("sha256", key).update(JSON.stringify([lease.scope, lease.verifiedUserId, identities, Math.floor(now / LEASE_MS)])).digest("hex");
  const items: Item[] = identities.map(identity => {
    const p = parsed.find(p => p.source!.identity === identity)!;
    return { identity, url: p.url, validUntil: Math.min(p.source!.expiry, now + MAX_URL_AGE_MS, lease.sessionExpiresAt) };
  });
  const reuseUntil = Math.min(now + LEASE_MS, ...items.map(i => i.validUntil - MARGIN));
  const payload = { binding, createdAt: now, reuseUntil, items };
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_BYTES / 2 || reuseUntil <= now + 1000) return fallback("size-or-age-disabled");
  try {
    const stored = await bounded(store.get(binding));
    if (stored === null || stored === undefined) {
      const seed = encrypt(payload, key);
      await bounded(store.set(binding, seed, Math.min(300, Math.floor((reuseUntil - now) / 1000))));
      return fallback("seed");
    }
    if (typeof stored !== "string") return fallback("invalid-lease");
    const cached = decrypt(stored, key);
    if (cached.binding !== binding || !Number.isFinite(cached.createdAt) || cached.createdAt > now || now - cached.createdAt >= LEASE_MS || !Number.isFinite(cached.reuseUntil) || cached.reuseUntil <= now || cached.reuseUntil > cached.createdAt + LEASE_MS || !Array.isArray(cached.items) || cached.items.length !== items.length) return fallback("invalid-lease");
    const byIdentity = new Map<string, Item>();
    for (const item of cached.items) {
      if (typeof item?.url !== "string" || typeof item.identity !== "string" || !Number.isFinite(item.validUntil) || item.validUntil <= now + MARGIN || item.validUntil > lease.sessionExpiresAt || item.validUntil > cached.createdAt + MAX_URL_AGE_MS) return fallback("invalid-lease");
      const checked = inspect(item.url, now);
      if (!checked || checked.identity !== item.identity || !identities.includes(item.identity) || item.validUntil > checked.expiry || byIdentity.has(item.identity)) return fallback("invalid-lease");
      byIdentity.set(item.identity, item);
    }
    const urls = new Map(parsed.map(p => [p.id, byIdentity.get(p.source!.identity)!.url]));
    return { urls, outcome: "reuse", reusedCount: urls.size };
  } catch { return fallback("cache-unavailable"); }
}
