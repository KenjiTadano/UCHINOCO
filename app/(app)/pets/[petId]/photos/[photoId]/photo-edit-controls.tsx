"use client";

import { useActionState } from "react";
import {
  togglePhotoFavorite,
  updatePhotoCaption,
  updatePhotoTakenAt,
  type PhotoMutationState,
  type TakenAtMutationState,
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
  takenAtInputValue,
  takenAtUsesCreatedAt,
}: {
  petId: string;
  photoId: string;
  caption: string | null;
  favorite: boolean;
  takenAtInputValue: string;
  takenAtUsesCreatedAt: boolean;
}) {
  const captionAction = updatePhotoCaption.bind(null, petId, photoId);
  const favoriteAction = togglePhotoFavorite.bind(null, petId, photoId);
  const takenAtAction = updatePhotoTakenAt.bind(null, petId, photoId);
  const [captionState, captionFormAction, captionPending] = useActionState(
    captionAction,
    initialState,
  );
  const [favoriteState, favoriteFormAction, favoritePending] = useActionState(
    favoriteAction,
    initialState,
  );
  const [takenAtState, takenAtFormAction, takenAtPending] = useActionState(
    takenAtAction,
    {
      success: false,
      message: null,
      value: takenAtInputValue,
    } satisfies TakenAtMutationState,
  );

  return (
    <section
      className="app-card-flat grid gap-5"
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
          className="app-button-secondary w-full border-favorite/40 bg-favorite-soft text-favorite"
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
                ? "text-sm text-success"
                : "text-sm text-danger"
            }
          >
            {favoriteState.message}
          </p>
        ) : null}
      </form>

      <form action={takenAtFormAction} className="grid gap-3">
        <label htmlFor="photo-taken-at" className="text-sm font-medium">
          撮影日時を編集
        </label>
        <input
          key={takenAtState.value}
          id="photo-taken-at"
          name="taken_at"
          type="datetime-local"
          defaultValue={takenAtState.value}
          required
          disabled={takenAtPending}
          aria-invalid={Boolean(takenAtState.message && !takenAtState.success)}
          aria-describedby="photo-taken-at-help"
          className="app-input"
        />
        <p id="photo-taken-at-help" className="app-help">
          日本時間で入力してください。
          {takenAtUsesCreatedAt
            ? " 現在は撮影日時が未設定のため、登録日時を参考表示しています。"
            : ""}
        </p>
        {takenAtState.message ? (
          <p
            role={takenAtState.success ? "status" : "alert"}
            className={
              takenAtState.success
                ? "text-sm text-success"
                : "text-sm text-danger"
            }
          >
            {takenAtState.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={takenAtPending}
          className="app-button-primary"
        >
          {takenAtPending ? "保存中..." : "撮影日時を保存"}
        </button>
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
          className="app-input w-full resize-y disabled:bg-primary-soft"
          placeholder="この思い出について入力してください"
        />
        <p className="app-help">
          500文字まで。空欄で保存するとキャプションを削除します。
        </p>
        {captionState.message ? (
          <p
            role={captionState.success ? "status" : "alert"}
            className={
              captionState.success
                ? "text-sm text-success"
                : "text-sm text-danger"
            }
          >
            {captionState.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={captionPending}
            className="app-button-primary"
          >
            {captionPending ? "保存中..." : "保存"}
          </button>
          <button
            type="reset"
            disabled={captionPending}
            className="app-button-secondary"
          >
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
}
