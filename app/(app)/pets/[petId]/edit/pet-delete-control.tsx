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
      className="grid gap-3 border-t pt-7"
      aria-labelledby="delete-pet-heading"
    >
      <div>
        <h2 id="delete-pet-heading" className="text-sm font-semibold text-danger">
          ペットの削除
        </h2>
        <p className="app-help mt-1">
          プロフィール編集とは別の、取り消せない操作です。
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="app-button-danger w-full"
        >
          ペットを削除
        </button>
      ) : (
        <div className="grid gap-4 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <div>
            <p className="font-medium text-danger">
              {petName}を削除しますか？
            </p>
            <p className="mt-1 text-sm text-danger">
              このペットのプロフィール、思い出写真、AI解析結果も削除されます。この操作は取り消せません。
            </p>
          </div>

          {state.message ? (
            <p role="alert" className="text-sm text-danger">
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
