"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PHOTO_INTAKE_CONFIG, runnerRetryDelay, shouldContinueIntake } from "@/lib/photo-intake";

type QueueState = {
  ready?: boolean;
  waitMs?: number;
  changed?: boolean;
  stopped?: boolean;
  stage?: "semantic" | "intelligence" | null;
};
// Shared across StrictMode/remounts. Route changes never start overlapping batches.
let activeRequest: Promise<QueueState> | null = null;
async function requestQueue(method: "GET" | "POST", preferred?: "semantic" | "intelligence"): Promise<QueueState> {
  const response = await fetch("/api/photo-analysis", {
    method, credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.timeout(75_000),
    headers: {
      "x-uchinoco-runner": "1",
      ...(preferred ? { "x-uchinoco-intake-stage": preferred } : {}),
    },
  });
  if (!response.ok) throw new Error("queue_unavailable");
  return response.json();
}

export function AIAnalysisRunner() {
  const pathname = usePathname();
  const router = useRouter();
  const [organizing, setOrganizing] = useState(false);
  const processed = useRef(0);
  const consecutiveFailures = useRef(0);
  const lastStage = useRef<"semantic" | "intelligence" | null>(null);
  const uploading = pathname.endsWith("/photos/new");

  useEffect(() => {
    if (uploading) processed.current = 0;
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule(delay: number) {
      clearTimeout(timer);
      if (!disposed && delay > 0) timer = setTimeout(tick, delay);
    }
    async function tick() {
      if (disposed || running || uploading || document.visibilityState !== "visible") return;
      running = true;
      try {
        // A previous route's request can finish normally, without aborting its lease.
        if (activeRequest) await activeRequest;
        if (disposed) return;
        const batch = async () => {
          const state = await requestQueue("GET");
          if (disposed || document.visibilityState !== "visible" || !state.ready || state.stopped) return state;
          if (!shouldContinueIntake(processed.current, true)) return { ...state, stopped: true };
          setOrganizing(true);
          const preferred = lastStage.current === "semantic" ? "intelligence" : "semantic";
          const next = await requestQueue("POST", preferred);
          processed.current += 1;
          lastStage.current = next.stage ?? preferred;
          return next;
        };
        const request = batch();
        activeRequest = request;
        let state: QueueState;
        try { state = await request; }
        finally { if (activeRequest === request) activeRequest = null; }
        if (disposed) return;
        setOrganizing(false);
        if (state.stopped) {
          consecutiveFailures.current += 1;
          schedule(PHOTO_INTAKE_CONFIG.runnerRecheckDelayMs);
          return;
        }
        consecutiveFailures.current = 0;
        if (state.changed) router.refresh();
        const waitMs = state.waitMs ?? 0;
        if (shouldContinueIntake(processed.current, Boolean(state.ready), state.stopped)) {
          schedule(waitMs || PHOTO_INTAKE_CONFIG.runnerDelayMs);
        } else if (!state.stopped && state.ready) {
          timer = setTimeout(() => {
            processed.current = 0;
            void tick();
          }, PHOTO_INTAKE_CONFIG.workWindowMs);
        } else if (waitMs > 0) {
          schedule(waitMs);
        }
      } catch {
        if (!disposed) {
          setOrganizing(false);
          consecutiveFailures.current += 1;
          schedule(runnerRetryDelay(consecutiveFailures.current));
        }
      } finally { running = false; }
    }
    const wake = () => { if (document.visibilityState === "visible") schedule(1000); };
    schedule(1000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [pathname, router, uploading]);

  return organizing && !uploading ? (
    <p role="status" className="mx-auto max-w-3xl px-4 py-2 text-xs text-muted">
      写真を整理しています…
    </p>
  ) : null;
}
