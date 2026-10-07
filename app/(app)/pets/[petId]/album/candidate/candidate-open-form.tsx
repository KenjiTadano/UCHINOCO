"use client";

import { useActionState } from "react";
import { PrimaryButton } from "@/app/_components/ui";
import { materializePassiveCandidate, type MaterializeCandidateState } from "./actions";

export function CandidateOpenForm({ petId, fingerprint, monthKey }: { petId: string; fingerprint: string; monthKey: string }) {
  const [state, action, pending] = useActionState(materializePassiveCandidate.bind(null, petId), { error: null } satisfies MaterializeCandidateState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <input type="hidden" name="monthKey" value={monthKey} />
      {state.error ? <p role="alert" className="app-error">{state.error}</p> : null}
      <PrimaryButton type="submit" disabled={pending}>{pending ? "アルバムを準備しています..." : "アルバムを見る"}</PrimaryButton>
    </form>
  );
}
