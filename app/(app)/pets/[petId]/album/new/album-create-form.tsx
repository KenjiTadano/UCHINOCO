"use client";

import { useActionState, useState } from "react";
import { createAlbumDraft, type CreateAlbumState } from "./actions";

const PERIOD_OPTIONS = [
  { value: "3months", label: "最近3か月" },
  { value: "6months", label: "最近半年" },
  { value: "1year", label: "最近1年" },
  { value: "all", label: "すべて" },
] as const;

const initialState: CreateAlbumState = { error: null };

export function AlbumCreateForm({ petId }: { petId: string }) {
  const boundAction = createAlbumDraft.bind(null, petId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [selected, setSelected] = useState<string>("3months");

  return (
    <form action={formAction} className="grid gap-7">
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">対象期間</legend>
        <div className="grid grid-cols-2 gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`ds-focus flex min-h-14 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors ${
                selected === opt.value
                  ? "border-brand-terracotta bg-brand-terracotta-soft text-brand-terracotta-strong"
                  : "bg-surface text-foreground hover:border-brand-terracotta/60"
              }`}
            >
              <input
                type="radio"
                name="period"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="app-error">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="app-button-primary"
        aria-busy={pending}
      >
        {pending ? "アルバム案を作成中..." : "アルバム案を作る"}
      </button>

      <p className="app-help text-center" aria-live="polite">
        {pending
          ? "写真を選んでいます。少々お待ちください。"
          : "AIが写真を選び、タイトルを提案します。内容は後から自由に変更できます。"}
      </p>
    </form>
  );
}
