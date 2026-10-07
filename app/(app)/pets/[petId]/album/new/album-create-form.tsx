"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { createAlbumDraft, type CreateAlbumState } from "./actions";
import { AlbumGeneratingScreen, useGeneratingStep } from "./album-generating-screen";

const PERIOD_OPTIONS = [
  { value: "3months", label: "最近3か月" },
  { value: "6months", label: "最近半年" },
  { value: "1year", label: "最近1年" },
  { value: "all", label: "すべて" },
] as const;

const initialState: CreateAlbumState = { error: null };

export function AlbumCreateForm({ petId, petName, petOptions, backHref }: { petId: string; petName: string; petOptions: Array<{ id: string; name: string; photoCount: number }>; backHref: string }) {
  const boundAction = createAlbumDraft.bind(null, petId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [selected, setSelected] = useState<string>("3months");
  const [petSelection, setPetSelection] = useState(petId);
  const generatingStep = useGeneratingStep(pending);
  const selectedPets = petSelection === "all" ? petOptions : petOptions.filter((pet) => pet.id === petSelection);
  const selectedPhotoCount = selectedPets.reduce((sum, pet) => sum + pet.photoCount, 0);
  const selectedPetLabel = petSelection === "all" ? "すべてのペット" : (selectedPets[0]?.name ?? petName);
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === selected)?.label ?? PERIOD_OPTIONS[0].label;

  if (pending) {
    return <AlbumGeneratingScreen petName={selectedPetLabel} photoCount={selectedPhotoCount} backHref={backHref} activeStep={generatingStep} />;
  }

  return (
    <main className="ai-gen-page ai-gen-page--form">
      <header className="ai-gen-header">
        <Link href={backHref} className="ai-gen-header-side ai-gen-back ds-focus" aria-label="戻る">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="ai-gen-header-title">AIアルバムを作る</h1>
        <Link href={backHref} className="ai-gen-header-side ai-gen-cancel ds-focus">
          キャンセル
        </Link>
      </header>

      <form action={formAction} className="ai-gen-form">
        <h2 className="ai-gen-form-title">AIが{selectedPetLabel}のアルバムをまとめます</h2>
        {selectedPhotoCount > 0 ? <p className="ai-gen-form-desc">{selectedPeriodLabel}の思い出から、写真選びとページ構成をAIに任せて一冊にまとめます。</p> : <p className="ai-gen-form-desc">写真を追加するか、対象を変更するとアルバムを作れます。</p>}

        <details className="ai-gen-options" open={selectedPhotoCount === 0 || Boolean(state.error)}>
          <summary>対象を調整する（{selectedPetLabel}・{selectedPeriodLabel}）</summary>
          <fieldset className="ai-gen-period">
            <legend>アルバムに含めるペット</legend>
            <div className="ai-gen-period-grid">
              {petOptions.length > 1 ? (
                <label className={`ai-gen-period-option ds-focus${petSelection === "all" ? " is-selected" : ""}`}>
                  <input type="radio" name="petSelection" value="all" checked={petSelection === "all"} onChange={() => setPetSelection("all")} className="sr-only" />
                  すべて
                </label>
              ) : null}
              {petOptions.map((pet) => (
                <label key={pet.id} className={`ai-gen-period-option ds-focus${petSelection === pet.id ? " is-selected" : ""}`}>
                  <input type="radio" name="petSelection" value={pet.id} checked={petSelection === pet.id} onChange={() => setPetSelection(pet.id)} className="sr-only" />
                  {pet.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="ai-gen-period">
            <legend>対象期間</legend>
            <div className="ai-gen-period-grid">
              {PERIOD_OPTIONS.map((opt) => (
                <label key={opt.value} className={`ai-gen-period-option ds-focus${selected === opt.value ? " is-selected" : ""}`}>
                  <input type="radio" name="period" value={opt.value} checked={selected === opt.value} onChange={() => setSelected(opt.value)} className="sr-only" />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        </details>

        {state.error ? (
          <p role="alert" className="app-error">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={selectedPhotoCount === 0} className="app-button-primary">
          AIにおまかせで作る
        </button>

        <p className="app-help text-center">完成後はそのまま楽しめます。写真やレイアウトは必要なときだけ編集できます。</p>
      </form>
    </main>
  );
}
