"use client";

import { useState, useTransition } from "react";
import { deleteAlbum } from "./actions";

export function AlbumDeleteControl({
  petId,
  albumId,
}: {
  petId: string;
  albumId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAlbum(petId, albumId);
      if (result && !result.success && result.message) {
        setError(result.message);
      }
    });
  }

  return (
    <section className="grid gap-3 border-t pt-7" aria-labelledby="delete-album-heading">
      <h2 id="delete-album-heading" className="text-sm font-semibold text-danger">
        アルバムを削除
      </h2>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="app-button-danger w-fit"
        >
          このアルバムを削除
        </button>
      ) : (
        <div className="grid gap-4 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <div>
            <p className="font-medium text-danger">このアルバムを削除しますか？</p>
            <p className="mt-1 text-sm text-danger">
              アルバムと写真リストが削除されます。写真本体は削除されません。
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => { setConfirming(false); setError(null); }}
              className="app-button-secondary"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleDelete}
              className="app-button-danger border-transparent bg-danger text-white hover:bg-danger"
            >
              {pending ? "削除中..." : "削除する"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
