"use client";

import { useActionState } from "react";
import {
  togglePhotoFavorite,
  updatePhotoCaption,
  type PhotoMutationState,
} from "./actions";

const initialState: PhotoMutationState = {
  success: false,
  message: null,
};

export function PhotoEditControls({
  petId,
  photoId,
  caption,
  favorite,
}: {
  petId: string;
  photoId: string;
  caption: string | null;
  favorite: boolean;
}) {
  const captionAction = updatePhotoCaption.bind(null, petId, photoId);
  const favoriteAction = togglePhotoFavorite.bind(null, petId, photoId);
  const [captionState, captionFormAction, captionPending] = useActionState(
    captionAction,
    initialState,
  );
  const [favoriteState, favoriteFormAction, favoritePending] = useActionState(
    favoriteAction,
    initialState,
  );

  return (
    <section
      className="grid gap-5 rounded border border-zinc-200 p-4"
      aria-labelledby="photo-edit-heading"
    >
      <h2 id="photo-edit-heading" className="text-lg font-semibold">
        思い出を編集
      </h2>

      <form action={favoriteFormAction} className="grid gap-2">
        <button
          type="submit"
          disabled={favoritePending}
          aria-pressed={favorite}
          className="w-full rounded border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {favoritePending
            ? "更新中..."
            : favorite
              ? "★ お気に入り済み"
              : "☆ お気に入り"}
        </button>
        {favoriteState.message ? (
          <p
            role={favoriteState.success ? "status" : "alert"}
            className={
              favoriteState.success
                ? "text-sm text-emerald-700"
                : "text-sm text-red-700"
            }
          >
            {favoriteState.message}
          </p>
        ) : null}
      </form>

      <form action={captionFormAction} className="grid gap-3">
        <label htmlFor="photo-caption" className="text-sm font-medium">
          キャプションを編集
        </label>
        <textarea
          key={caption ?? ""}
          id="photo-caption"
          name="caption"
          defaultValue={caption ?? ""}
          maxLength={500}
          rows={5}
          disabled={captionPending}
          className="w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
          placeholder="この思い出について入力してください"
        />
        <p className="text-xs text-zinc-500">
          500文字まで。空欄で保存するとキャプションを削除します。
        </p>
        {captionState.message ? (
          <p
            role={captionState.success ? "status" : "alert"}
            className={
              captionState.success
                ? "text-sm text-emerald-700"
                : "text-sm text-red-700"
            }
          >
            {captionState.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={captionPending}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {captionPending ? "保存中..." : "保存"}
          </button>
          <button
            type="reset"
            disabled={captionPending}
            className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
}
