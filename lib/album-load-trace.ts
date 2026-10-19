import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type Measurement = { stage: string; durationMs: number; outcome: string };
const editMeasurements = new AsyncLocalStorage<Measurement[]>();

/** Request-local measurement only; never records identifiers, URLs, or credentials. */
export async function measureEditRequest<T>(work: () => Promise<T>): Promise<T> {
  const measurements: Measurement[] = [];
  const started = performance.now();
  let outcome = "error";
  return editMeasurements.run(measurements, async () => {
    try { const result = await work(); outcome = "ok"; return result; }
    finally { console.info("Album edit request", JSON.stringify({ outcome, durationMs: Math.round(performance.now() - started), measurements })); }
  });
}

const tables = new Set(["albums", "pets", "album_draft_versions", "album_draft_spreads", "album_draft_frames", "album_draft_text_elements", "album_draft_decorations", "album_draft_page_elements", "album_draft_spread_backgrounds", "photos", "album_draft_covers"]);
export const measuredEditFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.match(/\/rest\/v1\/([^/]+)$/)?.[1];
  const stage = table && tables.has(table) ? `query.${table}` : url.pathname.startsWith("/auth/") ? "transport.auth" : url.pathname.startsWith("/storage/") ? "transport.storage" : "transport.other";
  return traceAlbumLoad(stage, () => fetch(input, init));
};

export async function traceAlbumLoad<T>(stage: string, work: () => PromiseLike<T>): Promise<T> {
  const startedAt = performance.now();
  let outcome: "ok" | "error" = "ok";

  try {
    return await work();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    editMeasurements.getStore()?.push({ stage, outcome, durationMs: Math.round(performance.now() - startedAt) });
    if (process.env.NODE_ENV !== "test") {
      console.info("Album GET stage", {
        stage,
        outcome,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  }
}
