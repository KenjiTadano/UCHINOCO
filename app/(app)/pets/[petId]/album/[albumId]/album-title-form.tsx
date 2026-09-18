"use client";

import { useActionState } from "react";
import { updateAlbumTitle, type AlbumMutationState } from "./actions";

const initialState: AlbumMutationState = { success: false, message: null };

export function AlbumTitleForm({
  petId,
  albumId,
  title,
}: {
  petId: string;
  albumId: string;
  title: string;
}) {
  const boundAction = updateAlbumTitle.bind(null, petId, albumId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <label htmlFor="album-title" className="sr-only">
        アルバムタイトル
      </label>
      <input
        id="album-title"
        name="title"
        type="text"
        defaultValue={title}
        maxLength={100}
        required
        disabled={pending}
        aria-invalid={state.message && !state.success ? true : undefined}
        className="app-input w-full text-base font-semibold"
        placeholder="アルバムのタイトル"
      />
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={state.success ? "text-sm text-success" : "text-sm text-danger"}
        >
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="app-button-primary w-fit">
        {pending ? "保存中..." : "タイトルを保存"}
      </button>
    </form>
  );
}
