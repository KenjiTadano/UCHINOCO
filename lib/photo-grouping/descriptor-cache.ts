import type { VisualDescriptor } from "./types.ts";

const globalStore = globalThis as typeof globalThis & {
  __uchinocoDescriptorCache?: Map<string, { descriptor: VisualDescriptor | null; storedAt: number }>;
};
const store = (globalStore.__uchinocoDescriptorCache ??= new Map());
const TTL_MS = 30 * 60 * 1000;

export function descriptorCacheKey(photoId: string, storagePath: string, version: string) {
  return `${version}::${photoId}::${storagePath}`;
}

export function getDescriptorCache(key: string): VisualDescriptor | null | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return hit.descriptor;
}

export function setDescriptorCache(key: string, descriptor: VisualDescriptor | null) {
  store.set(key, { descriptor, storedAt: Date.now() });
  if (store.size > 120) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}
