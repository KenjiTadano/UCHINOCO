"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { materializeAnnualCandidate, type MaterializeAnnualCandidateState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="ds-button ds-button-primary min-h-11" disabled={pending}>{pending ? "アルバムを準備しています..." : "1年を振り返る"}</button>;
}

export function AnnualCandidateOpenForm({ petId, year, fingerprint }: { petId: string; year: number; fingerprint: string }) {
  const action = materializeAnnualCandidate.bind(null, petId, year);
  const [state, formAction] = useActionState<MaterializeAnnualCandidateState, FormData>(action, { error: null });
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="fingerprint" value={fingerprint} />
      {state.error ? <p role="alert" className="ds-caption text-danger">{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}
