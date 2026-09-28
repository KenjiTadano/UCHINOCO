import type { SmartCropPhotoAnalysis } from "./types.ts";

type CacheEntry = {
  analysis: SmartCropPhotoAnalysis;
  storedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const globalStore = globalThis as typeof globalThis & {
  __uchinocoSmartCropCache?: Map<string, CacheEntry>;
};
const store = (globalStore.__uchinocoSmartCropCache ??= new Map());

export function smartCropCacheKey(
  photoId: string,
  storagePath: string,
  sourceFingerprint: string,
  analysisVersion: string,
) {
  return `${analysisVersion}::${photoId}::${storagePath}::${sourceFingerprint}`;
}

export function getSmartCropCache(key: string): SmartCropPhotoAnalysis | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.analysis;
}

export function setSmartCropCache(key: string, analysis: SmartCropPhotoAnalysis) {
  store.set(key, { analysis, storedAt: Date.now() });
  // Bound memory in long-lived dev servers
  if (store.size > 80) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}
