import { ALBUM_CANDIDATES_VERSION } from "./config.ts";
import type { AlbumCandidateResult } from "./types.ts";

const TTL_MS = 30 * 60 * 1000;

type Entry = { result: AlbumCandidateResult; storedAt: number };

const globalStore = globalThis as typeof globalThis & {
  __uchinocoAlbumCandidateCache?: Map<string, Entry>;
};
const store = (globalStore.__uchinocoAlbumCandidateCache ??= new Map());

export function albumCandidateCacheKey(
  petId: string,
  period: { start: string; end: string; type?: string },
  sceneIds: string[],
  fingerprint: string,
) {
  const ids = [...sceneIds].sort().join(",");
  return `${ALBUM_CANDIDATES_VERSION}::${petId}::${period.type ?? "custom"}::${period.start}::${period.end}::${fingerprint}::${ids}`;
}

export function getAlbumCandidateCache(key: string): AlbumCandidateResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function setAlbumCandidateCache(key: string, result: AlbumCandidateResult) {
  store.set(key, { result, storedAt: Date.now() });
  if (store.size > 40) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function clearAlbumCandidateCache() {
  store.clear();
}
