"use client";

import { useActionState, useState } from "react";
import { deletePhoto, type DeletePhotoState } from "./actions";

const initialState: DeletePhotoState = {
  success: false,
  message: null,
};

export function PhotoDeleteControl({
  petId,
  photoId,
}: {
  petId: string;
  photoId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const deleteAction = deletePhoto.bind(null, petId, photoId);
  const [state, formAction, pending] = useActionState(
    deleteAction,
    initialState,
  );

  return (
    <section
      className="grid gap-3 border-t border-zinc-200 pt-6"
      aria-labelledby="delete-photo-heading"
    >
      <h2 id="delete-photo-heading" className="text-sm font-medium text-red-800">
        写真の削除
      </h2>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded border border-red-300 px-4 py-2 text-sm text-red-700"
        >
          写真を削除
        </button>
      ) : (
        <div className="grid gap-4 rounded border border-red-300 bg-red-50 p-4">
          <div>
            <p className="font-medium text-red-900">
              この思い出を削除しますか？
            </p>
            <p className="mt-1 text-sm text-red-800">
              この操作は取り消せません。
            </p>
          </div>

          {state.message ? (
            <p role="alert" className="text-sm text-red-800">
              {state.message}
            </p>
          ) : null}

          <form action={formAction} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-red-700 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "削除中..." : "削除する"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
