"use client";

import Link from "next/link";

export default function AlbumGenerationError({ reset }: { reset: () => void }) {
  return (
    <main className="app-page items-center justify-center text-center">
      <h1 className="ds-heading">アルバムの作成を完了できませんでした</h1>
      <p className="ds-body text-muted" role="status">
        アルバムの作成に時間がかかっているか、写真の整理がまだ完了していない可能性があります。ホームで整理状況を確認してから、もう一度お試しください。
      </p>
      <button type="button" className="app-button-primary" onClick={reset}>
        もう一度表示する
      </button>
      <Link className="app-button-secondary" href="/home">
        ホームで整理を待つ
      </Link>
    </main>
  );
}
