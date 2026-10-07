"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep production logs free of exception messages and user data.
    console.error("Application route failed", { digest: error.digest ?? null });
  }, [error]);

  return (
    <main className="app-page items-center justify-center text-center">
      <p className="ds-editorial">UCHINOCO</p>
      <h1 className="ds-heading">画面を表示できませんでした</h1>
      <p className="ds-body text-muted">通信状態を確認して、もう一度お試しください。</p>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button type="button" className="app-button-primary flex-1" onClick={reset}>もう一度試す</button>
        <Link className="app-button-secondary flex-1" href="/home">ホームへ戻る</Link>
      </div>
    </main>
  );
}
