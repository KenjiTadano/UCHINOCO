export const OPTIONAL_CACHE_BUDGET_MS = 150;
export const MIN_SEED_BUDGET_MS = 50;
export class OptionalCacheTimeout extends Error {
  readonly stage: "get" | "set" | "session";
  constructor(stage: "get" | "set" | "session") { super("Optional cache deadline"); this.stage = stage; }
}

/** One monotonic deadline; no operation gets a fresh timeout allowance. */
export function optionalCacheBudget() {
  const deadline = performance.now() + OPTIONAL_CACHE_BUDGET_MS;
  return {
    remaining: () => Math.max(0, deadline - performance.now()),
    async run<T>(stage: "get" | "set" | "session", work: (signal: AbortSignal) => Promise<T>) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new OptionalCacheTimeout(stage);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([Promise.resolve().then(() => {
          if (performance.now() >= deadline) throw new OptionalCacheTimeout(stage);
          return work(controller.signal);
        }), new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new OptionalCacheTimeout(stage)); }, remaining);
        })]);
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}
export type OptionalCacheBudget = ReturnType<typeof optionalCacheBudget>;
