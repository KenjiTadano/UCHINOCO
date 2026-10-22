/** Request-client association only. No URLs, IDs or credentials are recorded. */
export type IoVariant = "baseline" | "candidate";
export type IoEvent = { metric: string; count: number; durationMs: number };
type Observer = { variant: IoVariant; record: (event: IoEvent) => void };
const clients = new WeakMap<object, Observer>();
const names = new Set([
  "url.cache.hit", "url.cache.miss", "presence.hit", "presence.miss", "presence.probe", "availability.cache.hit", "availability.cache.miss",
  "thumbnail.cache.hit", "thumbnail.cache.miss", "thumbnail.local.hit", "thumbnail.queue",
  "sign.main", "sign.derivative", "sign.original", "sign.availability", "sign.transform",
  "font.cache.hit", "font.cache.miss", "font.file.read", "font.file.error",
  "progressive.metadata", "progressive.revision-check", "progressive.phase",
  "metadata.hit", "metadata.miss", "draft.photo.metadata", "draft.assembly",
  "draft.cover", "draft.cover.missing", "draft.effective", "draft.reset.only", "draft.initial.body", "draft.offscreen.body",
  "print.original.active", "print.original.download", "print.original.probe", "print.original.local.hit",
]);
export function registerIoObserver(client: object, observer: Observer) { clients.set(client, observer); }
export function ioVariant(client: object): IoVariant { return clients.get(client)?.variant ?? "candidate"; }
export function observeIo(client: object | undefined, metric: string, count = 1, durationMs = 0) {
  if (!client || !names.has(metric) || !Number.isFinite(count) || count < 0 || !Number.isFinite(durationMs) || durationMs < 0) return;
  clients.get(client)?.record({ metric, count: Math.min(count, 1000000), durationMs: Math.round(durationMs) });
}
export async function ioWork<T>(client: object, metric: string, count: number, work: () => PromiseLike<T>): Promise<T> {
  const started = performance.now();
  try { return await work(); }
  finally { observeIo(client, metric, count, performance.now() - started); }
}
