import "server-only";
import {headingSpan} from "./heading-trace-core";

export async function traceAlbumLoad<T>(stage: string, work: () => PromiseLike<T>): Promise<T> {
  const startedAt = performance.now();
  let outcome: "ok" | "error" = "ok";

  try {
    return await headingSpan(stage,work);
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    if (process.env.NODE_ENV !== "test") {
      console.info("Album GET stage", {
        stage,
        outcome,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  }
}
