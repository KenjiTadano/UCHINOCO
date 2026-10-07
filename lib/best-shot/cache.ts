import { BEST_SHOT_VERSION } from "./config.ts";
import type { BestShotCandidate, BestShotResult } from "./types.ts";

const TTL_MS = 30 * 60 * 1000;

type Entry = { result: BestShotResult; storedAt: number };

const globalStore = globalThis as typeof globalThis & {
  __uchinocoBestShotCache?: Map<string, Entry>;
};
const store = (globalStore.__uchinocoBestShotCache ??= new Map());

export function bestShotCacheKey(groupId: string, photoIds: string[], fingerprint: string) {
  const ids = [...photoIds].sort().join(",");
  return `${BEST_SHOT_VERSION}::${fingerprint}::${groupId}::${ids}`;
}

export function getBestShotCache(key: string): BestShotResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function getBestShotCacheByPhotoIds(photoIds: string[]) {
  const requested = new Set(photoIds);
  const matches = new Map<
    string,
    {
      candidate: BestShotCandidate;
      confidence: BestShotResult["confidence"];
      storedAt: number;
    }
  >();
  const now = Date.now();

  for (const [key, entry] of store) {
    if (now - entry.storedAt > TTL_MS) {
      store.delete(key);
      continue;
    }
    for (const candidate of entry.result.ranking) {
      if (!requested.has(candidate.photoId)) continue;
      const previous = matches.get(candidate.photoId);
      if (previous && previous.storedAt >= entry.storedAt) continue;
      matches.set(candidate.photoId, {
        candidate,
        confidence: entry.result.confidence,
        storedAt: entry.storedAt,
      });
    }
  }

  return new Map([...matches].map(([photoId, match]) => [photoId, { candidate: match.candidate, confidence: match.confidence }]));
}

export function setBestShotCache(key: string, result: BestShotResult) {
  store.set(key, { result, storedAt: Date.now() });
  if (store.size > 80) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function clearBestShotCache() {
  store.clear();
}
