"use client";
import { initialProgressiveState, mergeDraftDelivery } from "@/lib/album-persistence/progressive-merge";
import { use, useEffect, useState, Suspense } from "react";
import type { DraftDelivery, DraftStream } from "@/lib/album-persistence/progressive-types";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
function Receiver({ promise, receive }: { promise: Promise<DraftDelivery>; receive: (value: DraftDelivery) => void }) {
  const value = use(promise);
  useEffect(() => { receive(value); }, [value, receive]);
  return null;
}
export function useDraftStream(initial: PersistedDraftView | null, stream?: DraftStream) {
  const [state, setState] = useState(() => initialProgressiveState(initial, Boolean(stream)));
  const receive = useState(() => (value: DraftDelivery) => setState(current => mergeDraftDelivery(current, value, initial)))[0];
  return { view: stream ? state.view : initial, rank: state.rank, error: state.error, ready: !stream || state.rank === 3 && !state.error,
    receivers: stream ? <><Suspense fallback={null}><Receiver promise={stream.primary} receive={receive} /></Suspense><Suspense fallback={null}><Receiver promise={stream.nearby} receive={receive} /></Suspense><Suspense fallback={null}><Receiver promise={stream.complete} receive={receive} /></Suspense></> : null };
}
