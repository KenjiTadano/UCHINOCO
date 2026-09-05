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
        className="app-button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "AI解析中..." : retry ? "AI解析を再試行" : "AIで写真を解析"}
      </button>
    </form>
  );
}
