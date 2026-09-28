import type { PhotoIntelligence, TechnicalParts, TechnicalSignals } from "./types.ts";

export type CachedPhotoIntelligence = {
  intelligence: PhotoIntelligence;
  parts: TechnicalParts;
  signals: Pick<
    TechnicalSignals,
    "width" | "height" | "pixelsKnown" | "meanLuma" | "lumaStd" | "laplacianVar"
  >;
  storedAt: number;
  expiresAt: number;
};

const globalStore = globalThis as typeof globalThis & {
  __uchinocoPhotoIntelligenceCache?: Map<string, CachedPhotoIntelligence>;
};
const store = (globalStore.__uchinocoPhotoIntelligenceCache ??= new Map());

export function photoIntelligenceCacheKey(
  photoId: string,
  storagePath: string,
  analysisVersion: string,
  sourceFingerprint: string,
) {
  // r2: sharpness curve no longer saturates typical phone laplacian values.
  return `${analysisVersion}::r2::${photoId}::${storagePath}::${sourceFingerprint}`;
}

export function getPhotoIntelligenceCache(key: string): CachedPhotoIntelligence | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit;
}

export function setPhotoIntelligenceCache(
  key: string,
  entry: Omit<CachedPhotoIntelligence, "storedAt" | "expiresAt">,
  ttlMs: number,
) {
  const now = Date.now();
  store.set(key, { ...entry, storedAt: now, expiresAt: now + ttlMs });
  if (store.size > 120) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function clearPhotoIntelligenceCache() {
  store.clear();
}
