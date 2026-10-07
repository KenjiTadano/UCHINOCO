"use client";

import { useActionState } from "react";
import { startPlusCheckout, type PlusCheckoutState } from "./actions";

const INITIAL_STATE: PlusCheckoutState = { error: null };

export function PlusCheckoutButton({ next }: { next: string }) {
  const [state, action, pending] = useActionState(startPlusCheckout, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="next" value={next} />
      <button className="app-button-primary min-h-11" type="submit" disabled={pending}>
        {pending ? "お申し込みを準備しています..." : "PLUSをはじめる"}
      </button>
      {state.error ? <p className="app-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
