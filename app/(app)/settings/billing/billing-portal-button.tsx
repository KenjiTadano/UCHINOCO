"use client";

import { useActionState } from "react";
import { startBillingPortal, type BillingPortalState } from "./actions";

const INITIAL_STATE: BillingPortalState = { error: null };

export function BillingPortalButton() {
  const [state, action, pending] = useActionState(startBillingPortal, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <button className="app-button-primary min-h-11 w-full" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "契約情報を開いています..." : "支払い・契約を管理"}
      </button>
      {state.error ? <p className="app-error" role="alert">{state.error}</p> : null}
    </form>
  );
}