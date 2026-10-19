"use client";

import { useActionState } from "react";
import { unstable_rethrow } from "next/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import type { AlbumOrderIntentState } from "./analytics-actions";

type Props = { action: (state: AlbumOrderIntentState) => Promise<AlbumOrderIntentState> };

export function AlbumOrderIntentCta({ action }: Props) {
  const [state, submit, pending] = useActionState(async (previous: AlbumOrderIntentState) => {
    try { return await action(previous); }
    catch (error) {
      unstable_rethrow(error);
      return { message: "通信できませんでした。もう一度お試しください。" };
    }
  }, { message: null });

  return (
    <form action={submit} className="grid gap-2">
      <button type="submit" className="album-preview-primary ds-focus w-full disabled:cursor-wait disabled:opacity-60" disabled={pending} aria-busy={pending}>
        <BookOpen size={18} strokeWidth={1.9} aria-hidden="true" />
        {pending ? "確認しています…" : "この内容で注文へ進む"}
        <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <p className="text-center text-xs text-muted">印刷イメージを確認してから、注文内容へ進みます。</p>
      {state.message ? <p role="alert" className="text-center text-sm text-danger">{state.message}</p> : null}
    </form>
  );
}
