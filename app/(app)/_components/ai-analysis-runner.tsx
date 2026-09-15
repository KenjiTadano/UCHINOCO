"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type QueueState = { ready?: boolean; waitMs?: number; changed?: boolean; stopped?: boolean };
// Shared across StrictMode/remounts. Route changes never start overlapping batches.
let activeRequest: Promise<QueueState> | null = null;
async function requestQueue(method: "GET" | "POST"): Promise<QueueState> {
  const response = await fetch("/api/photo-analysis", {
    method, credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.timeout(75_000),
    headers: { "x-uchinoco-runner": "1" },
  });
  if (!response.ok) throw new Error("queue_unavailable");
  return response.json();
}

export function AIAnalysisRunner() {
  const pathname = usePathname();
  const router = useRouter();
  const [organizing, setOrganizing] = useState(false);
  const uploading = pathname.endsWith("/photos/new");

  useEffect(() => {
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
          setOrganizing(true);
          return requestQueue("POST");
        };
        const request = batch();
        activeRequest = request;
        let state: QueueState;
        try { state = await request; }
        finally { if (activeRequest === request) activeRequest = null; }
        if (disposed) return;
        setOrganizing(false);
        if (state.changed) router.refresh();
        if (!state.stopped) schedule(state.waitMs ?? 0);
      } catch {
        // Stop on auth/network/schema errors. A visit or visibility change resumes.
        if (!disposed) setOrganizing(false);
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
