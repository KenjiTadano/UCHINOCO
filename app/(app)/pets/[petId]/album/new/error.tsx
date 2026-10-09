"use client";

import Link from "next/link";

export default function AlbumGenerationError({ reset }: { reset: () => void }) {
  return (
    <main className="app-page items-center justify-center text-center">
      <h1 className="ds-heading">アルバムの作成を完了できませんでした</h1>
      <p className="ds-body text-muted" role="status">
        写真は保存されています。この画面で作成状況をもう一度確認できます。
      </p>
      <button type="button" className="app-button-primary" onClick={reset}>
        作成状況を確認する
      </button>
      <Link className="app-button-secondary" href="/album">
        アルバム一覧へ戻る
      </Link>
    </main>
  );
}
