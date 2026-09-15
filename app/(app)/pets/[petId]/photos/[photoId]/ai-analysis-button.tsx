"use client";

import { useActionState } from "react";
import {
  analyzePhoto,
  type AnalyzePhotoState,
} from "./actions";

const initialState: AnalyzePhotoState = {
  success: false,
  message: null,
};

export function AiAnalysisButton({
  petId,
  photoId,
  retry = false,
}: {
  petId: string;
  photoId: string;
  retry?: boolean;
}) {
  const action = analyzePhoto.bind(null, petId, photoId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success
              ? "text-sm text-success"
              : "text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="app-button-ghost text-sm"
        type="submit"
        disabled={pending}
      >
        {pending ? "写真を整理しています…" : retry ? "整理を再試行" : "写真を整理"}
      </button>
    </form>
  );
}
