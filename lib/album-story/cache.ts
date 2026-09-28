import { ALBUM_STORY_VERSION } from "./config.ts";
import type { AlbumStoryResult } from "./types.ts";

const TTL_MS = 30 * 60 * 1000;

type Entry = { result: AlbumStoryResult; storedAt: number };

const globalStore = globalThis as typeof globalThis & {
  __uchinocoAlbumStoryCache?: Map<string, Entry>;
};
const store = (globalStore.__uchinocoAlbumStoryCache ??= new Map());

export function albumStoryCacheKey(
  petId: string,
  period: { start: string; end: string; type?: string },
  sceneIds: string[],
  fingerprint: string,
) {
  const ids = [...sceneIds].sort().join(",");
  return `${ALBUM_STORY_VERSION}::${petId}::${period.type ?? "custom"}::${period.start}::${period.end}::${fingerprint}::${ids}`;
}

export function getAlbumStoryCache(key: string): AlbumStoryResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function setAlbumStoryCache(key: string, result: AlbumStoryResult) {
  store.set(key, { result, storedAt: Date.now() });
  if (store.size > 40) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function clearAlbumStoryCache() {
  store.clear();
}
