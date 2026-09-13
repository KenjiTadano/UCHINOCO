"use client";

import { useState, useTransition } from "react";
import { backfillPhotoContentHashes } from "../content-hash-backfill-actions";

export function ContentHashBackfill({ petId, initialPendingCount }: { petId: string; initialPendingCount: number }) {
  const [remaining, setRemaining] = useState(initialPendingCount);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (initialPendingCount === 0 && remaining === 0 && !message) return null;

  return <section className="app-card-flat" aria-labelledby="hash-backfill-heading">
    <h2 id="hash-backfill-heading" className="font-semibold">既存写真の重複チェックを有効にする</h2>
    <p className="app-help mt-1">以前追加した写真も、重複を確認できるようにします。写真自体は変更されません。</p>
    {message ? <p className="app-status mt-3" role="status" aria-live="polite">{message}</p> : null}
    <button type="button" className="app-button-secondary mt-4 w-full sm:w-auto" disabled={isPending || remaining === 0} onClick={() => startTransition(async () => {
      const result = await backfillPhotoContentHashes(petId);
      setMessage(result.message);
      if (result.success) setRemaining(result.remaining);
    })}>{isPending ? "既存写真を確認しています..." : remaining === 0 ? "既存写真の確認が完了しました" : `写真を確認する（残り${remaining}枚）`}</button>
  </section>;
}
