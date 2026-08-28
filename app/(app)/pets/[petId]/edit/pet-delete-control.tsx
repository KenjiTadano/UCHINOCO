"use client";

import { useActionState, useState } from "react";
import { deletePet, type DeletePetState } from "../../actions";

const initialState: DeletePetState = {
  success: false,
  message: null,
};

export function PetDeleteControl({
  petId,
  petName,
}: {
  petId: string;
  petName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const deleteAction = deletePet.bind(null, petId);
  const [state, formAction, pending] = useActionState(
    deleteAction,
    initialState,
  );

  return (
    <section
      className="grid gap-3 border-t border-zinc-200 pt-6"
      aria-labelledby="delete-pet-heading"
    >
      <div>
        <h2 id="delete-pet-heading" className="text-sm font-medium text-red-800">
          ペットの削除
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          プロフィール編集とは別の、取り消せない操作です。
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded border border-red-300 px-4 py-2 text-sm text-red-700"
        >
          ペットを削除
        </button>
      ) : (
        <div className="grid gap-4 rounded border border-red-300 bg-red-50 p-4">
          <div>
            <p className="font-medium text-red-900">
              {petName}を削除しますか？
            </p>
            <p className="mt-1 text-sm text-red-800">
              このペットのプロフィール、思い出写真、AI解析結果も削除されます。この操作は取り消せません。
            </p>
          </div>

          {state.message ? (
            <p role="alert" className="text-sm text-red-800">
              {state.message}
            </p>
          ) : null}

          <form
            action={formAction}
            className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
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
