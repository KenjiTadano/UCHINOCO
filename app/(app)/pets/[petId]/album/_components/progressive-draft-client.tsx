"use client";
import { use, useEffect, useState, Suspense } from "react";
import type { DraftDelivery, DraftStream } from "@/lib/album-persistence/progressive-types";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
function Receiver({ promise, receive }: { promise: Promise<DraftDelivery>; receive: (value: DraftDelivery) => void }) {
  const value = use(promise);
  useEffect(() => { receive(value); }, [value, receive]);
  return null;
}
export function useDraftStream(initial: PersistedDraftView | null, stream?: DraftStream) {
  const [state, setState] = useState<{ view: PersistedDraftView | null; rank: number; error: string | null }>({ view: initial, rank: stream ? 0 : 3, error: null });
  const receive = useState(() => (value: DraftDelivery) => setState(current => {
    if (!value.ok) return { ...current, error: value.message };
    const rank = { primary: 1, nearby: 2, complete: 3 }[value.stage];
    if (current.error || rank <= current.rank || value.view.versionId !== initial?.versionId || value.view.revision !== initial.revision) return current;
    return { view: value.view, rank, error: null };
  }))[0];
  return { view: stream ? state.view : initial, rank: state.rank, error: state.error, ready: !stream || state.rank === 3 && !state.error,
    receivers: stream ? <><Suspense fallback={null}><Receiver promise={stream.primary} receive={receive} /></Suspense><Suspense fallback={null}><Receiver promise={stream.nearby} receive={receive} /></Suspense><Suspense fallback={null}><Receiver promise={stream.complete} receive={receive} /></Suspense></> : null };
}
