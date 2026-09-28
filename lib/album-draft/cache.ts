import { ALBUM_DRAFT_VERSION } from "./config.ts";
import type { AlbumDraftResult } from "./types.ts";

const TTL_MS = 30 * 60 * 1000;

type Entry = { result: AlbumDraftResult; storedAt: number };

const globalStore = globalThis as typeof globalThis & {
  __uchinocoAlbumDraftCache?: Map<string, Entry>;
};
const store = (globalStore.__uchinocoAlbumDraftCache ??= new Map());

export function albumDraftCacheKey(
  storySpreadIds: string[],
  photoIds: string[],
  fingerprint: string,
) {
  return `${ALBUM_DRAFT_VERSION}::${[...storySpreadIds].sort().join(",")}::${[...photoIds].sort().join(",")}::${fingerprint}`;
}

export function getAlbumDraftCache(key: string): AlbumDraftResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function setAlbumDraftCache(key: string, result: AlbumDraftResult) {
  store.set(key, { result, storedAt: Date.now() });
  if (store.size > 40) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}
