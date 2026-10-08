"use client";

import { useActionState } from "react";
import Link from "next/link";
import { startPlusCheckout, type PlusCheckoutState } from "./actions";

const INITIAL_STATE: PlusCheckoutState = { error: null };

export function PlusUpgradeCta({ next, className = "" }: { next: string; className?: string }) {
  const [state, action, pending] = useActionState(startPlusCheckout, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="next" value={next} />
      <button className={`app-button-primary min-h-11 w-full ${className}`} type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "お申し込みを準備しています..." : "PLUSにアップグレード"}
      </button>
      <p className="text-center text-xs text-muted">月額 ¥680</p>
      {state.error ? (
        <div className="grid gap-2">
          <p className="app-error" role="alert">{state.error}</p>
          <Link className="ds-focus min-h-11 px-3 py-2 text-center text-sm underline underline-offset-4" href="/settings/billing">プラン・お支払いを開く</Link>
        </div>
      ) : null}
    </form>
  );
}
