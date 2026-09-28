const pdfBytes = new Map<string, Uint8Array>();
const inflight = new Map<string, Promise<unknown>>();

function key(albumId: string, fingerprint: string) {
  return `${albumId}:${fingerprint}`;
}

export function rememberPrintPdf(albumId: string, fingerprint: string, bytes: Uint8Array) {
  pdfBytes.set(key(albumId, fingerprint), bytes);
}

export function recallPrintPdf(albumId: string, fingerprint: string) {
  return pdfBytes.get(key(albumId, fingerprint)) ?? null;
}

export function takePrintFlight<T>(albumId: string, fingerprint: string, run: () => Promise<T>): Promise<T> {
  const id = key(albumId, fingerprint);
  const existing = inflight.get(id) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = run().finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, pending);
  return pending;
}
