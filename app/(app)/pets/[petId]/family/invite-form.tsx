"use client";

import { useActionState } from "react";
import { createFamilyInvite, type InviteState } from "./actions";

const INITIAL_STATE: InviteState = { message: null, inviteUrl: null };

export function FamilyInviteForm({ petId }: { petId: string }) {
  const [state, action, pending] = useActionState(createFamilyInvite, INITIAL_STATE);
  return (
    <form action={action} className="grid gap-3 rounded-[14px] bg-surface-warm p-4">
      <input type="hidden" name="petId" value={petId} />
      <label className="grid gap-1.5 text-sm font-medium">
        家族のメールアドレス
        <input
          className="app-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          disabled={pending}
        />
      </label>
      <button className="app-button-primary min-h-11" type="submit" disabled={pending}>
        {pending ? "招待を準備しています..." : "招待リンクを作る"}
      </button>
      {state.message ? <p role="status" className="text-sm text-muted">{state.message}</p> : null}
      {state.inviteUrl ? (
        <div className="grid gap-1.5">
          <label htmlFor="family-invite-url" className="text-xs font-medium text-muted">招待リンク</label>
          <input id="family-invite-url" className="app-input text-xs" readOnly value={state.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
        </div>
      ) : null}
    </form>
  );
}
