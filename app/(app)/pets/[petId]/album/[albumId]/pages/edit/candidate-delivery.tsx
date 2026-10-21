"use client";
import { use, useEffect } from "react";
import type { PageEditCandidatePhoto } from "./page-edit-screen";
export type CandidateDelivery = { ok: boolean; photos: PageEditCandidatePhoto[] };
export function CandidateReceiver({ promise, receive }: { promise: Promise<CandidateDelivery>; receive: (value: CandidateDelivery) => void }) {
  const value = use(promise);
  useEffect(() => { receive(value); }, [value, receive]);
  return null;
}
