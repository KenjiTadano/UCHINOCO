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
      className="grid gap-3 border-t pt-7"
      aria-labelledby="delete-photo-heading"
    >
      <h2 id="delete-photo-heading" className="text-sm font-semibold text-danger">
        写真の削除
      </h2>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="app-button-danger w-full"
        >
          写真を削除
        </button>
      ) : (
        <div className="grid gap-4 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <div>
            <p className="font-medium text-danger">
              この思い出を削除しますか？
            </p>
            <p className="mt-1 text-sm text-danger">
              この操作は取り消せません。
            </p>
          </div>

          {state.message ? (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          ) : null}

          <form action={formAction} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="app-button-secondary"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={pending}
              className="app-button-danger border-transparent bg-danger text-white hover:bg-danger"
            >
              {pending ? "削除中..." : "削除する"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
