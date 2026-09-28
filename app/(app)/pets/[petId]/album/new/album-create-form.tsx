"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { createAlbumDraft, type CreateAlbumState } from "./actions";
import {
  AlbumGeneratingScreen,
  useGeneratingStep,
} from "./album-generating-screen";

const PERIOD_OPTIONS = [
  { value: "3months", label: "最近3か月" },
  { value: "6months", label: "最近半年" },
  { value: "1year", label: "最近1年" },
  { value: "all", label: "すべて" },
] as const;

const initialState: CreateAlbumState = { error: null };

export function AlbumCreateForm({
  petId,
  petName,
  photoCount,
  backHref,
}: {
  petId: string;
  petName: string;
  photoCount: number;
  backHref: string;
}) {
  const boundAction = createAlbumDraft.bind(null, petId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [selected, setSelected] = useState<string>("3months");
  const generatingStep = useGeneratingStep(pending);

  if (pending) {
    return (
      <AlbumGeneratingScreen
        petName={petName}
        photoCount={photoCount}
        backHref={backHref}
        activeStep={generatingStep}
      />
    );
  }

  return (
    <main className="ai-gen-page ai-gen-page--form">
      <header className="ai-gen-header">
        <Link
          href={backHref}
          className="ai-gen-header-side ai-gen-back ds-focus"
          aria-label="戻る"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="ai-gen-header-title">AIアルバムを作る</h1>
        <Link href={backHref} className="ai-gen-header-side ai-gen-cancel ds-focus">
          キャンセル
        </Link>
      </header>

      <form action={formAction} className="ai-gen-form">
        <h2 className="ai-gen-form-title">{petName}のアルバムを作る</h2>
        {photoCount > 0 ? (
          <p className="ai-gen-form-desc">
            {photoCount.toLocaleString()}枚の思い出から選びます
          </p>
        ) : (
          <p className="ai-gen-form-desc">写真を追加してからアルバムを作れます</p>
        )}

        <fieldset className="ai-gen-period">
          <legend>対象期間</legend>
          <div className="ai-gen-period-grid">
            {PERIOD_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`ai-gen-period-option ds-focus${
                  selected === opt.value ? " is-selected" : ""
                }`}
              >
                <input
                  type="radio"
                  name="period"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {state.error ? (
          <p role="alert" className="app-error">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={photoCount === 0}
          className="app-button-primary"
        >
          アルバム案を作る
        </button>

        <p className="app-help text-center">
          AIが写真を選び、タイトルを提案します。内容は後から自由に変更できます。
        </p>
      </form>
    </main>
  );
}
