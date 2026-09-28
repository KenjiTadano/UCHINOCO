import { analysisReadPlan } from "../photo-analysis/policy.ts";
import type { CacheSource } from "../photo-analysis/constants.ts";
import type { StoredCaption } from "./types.ts";

export type CaptionMemory = {
  read(key: string): StoredCaption | null;
  write(key: string, value: StoredCaption): void;
};

export function captionCacheKey(spreadId: string, kind: string, version: string, fingerprint: string): string {
  return `${version}::${spreadId}::${kind}::${fingerprint}`;
}

export function createCaptionMemory(): CaptionMemory {
  const store = new Map<string, StoredCaption>();
  return {
    read(key) {
      return store.get(key) ?? null;
    },
    write(key, value) {
      store.set(key, value);
    },
  };
}

const globalStore = globalThis as typeof globalThis & {
  __uchinocoCaptionCache?: Map<string, StoredCaption>;
};

export function globalCaptionMemory(): CaptionMemory {
  const store = (globalStore.__uchinocoCaptionCache ??= new Map());
  return {
    read(key) {
      return store.get(key) ?? null;
    },
    write(key, value) {
      store.set(key, value);
    },
  };
}

/** A cached row is reused only for the same version and fingerprint. */
export function reusableCaption(stored: StoredCaption | null, requested: { analysisVersion: string; inputFingerprint: string }): StoredCaption | null {
  if (!stored) return null;
  if (stored.suggestions.length === 0) return null;
  if (stored.analysisVersion !== requested.analysisVersion) return null;
  if (stored.inputFingerprint !== requested.inputFingerprint) return null;
  return stored;
}

export function captionReadPlan(input: { force: boolean; memoryHit: boolean; dbHit: boolean }): CacheSource {
  return analysisReadPlan(input);
}

/** replace / hidden keep the current text on screen until the user picks a line. */
export function captionLeavesCurrentText(mode: string | null | undefined): boolean {
  return mode === "replace" || mode === "hidden";
}
