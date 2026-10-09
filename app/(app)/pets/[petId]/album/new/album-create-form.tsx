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
  { value: "custom", label: "期間を指定" },
] as const;

const initialState: CreateAlbumState = { error: null };

export function AlbumCreateForm({ petId, petName, petOptions, backHref }: { petId: string; petName: string; petOptions: Array<{ id: string; name: string; photoCount: number }>; backHref: string }) {
  const boundAction = createAlbumDraft.bind(null, petId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [selected, setSelected] = useState<string>("3months");
  const [petSelection, setPetSelection] = useState("all");
  const [petIds,setPetIds]=useState(petOptions.map(pet=>pet.id));
  const [pageCount,setPageCount]=useState(48);
  const generatingStep = useGeneratingStep(pending);
  const selectedPets = petSelection === "all" ? petOptions : petOptions.filter((pet) => petIds.includes(pet.id));
  const selectedPhotoCount = selectedPets.reduce((sum, pet) => sum + pet.photoCount, 0);
  const selectedPetLabel = petSelection === "all" ? "すべてのペット" : (selectedPets.map(pet=>pet.name).join("・") || petName);
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

        <section className="ai-gen-options" aria-label="アルバムの作成条件">
          <input type="hidden" name="petSelection" value={petSelection} />
          <fieldset className="ai-gen-period">
            <legend>アルバムに含めるペット</legend>
            <div className="ai-gen-period-grid">
              {petOptions.length > 1 ? (
                <label className={`ai-gen-period-option ds-focus${petSelection === "all" ? " is-selected" : ""}`}>
                  <input type="checkbox" checked={petSelection === "all"} onChange={(event) => { setPetSelection(event.target.checked ? "all" : "selected"); setPetIds(event.target.checked ? petOptions.map(pet=>pet.id) : []); }} />
                  すべて
                </label>
              ) : null}
              {petOptions.map((pet) => (
                <label key={pet.id} className={`ai-gen-period-option ds-focus${petIds.includes(pet.id) ? " is-selected" : ""}`}>
                  <input type="checkbox" name="petIds" value={pet.id} checked={petIds.includes(pet.id)} onChange={(event) => { setPetSelection("selected"); setPetIds(ids => event.target.checked ? [...ids,pet.id] : ids.filter(id=>id!==pet.id)); }} />
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
          {selected === "custom" ? <div className="grid grid-cols-2 gap-3">
            <label>開始日<input type="date" name="periodFrom" required className="app-input" /></label>
            <label>終了日<input type="date" name="periodTo" required className="app-input" /></label>
          </div> : null}
          <fieldset className="ai-gen-period">
            <legend>本文のページ数（表紙・裏表紙は別）</legend>
            <div className="ai-gen-period-grid">
              {[24,48,72].map(count=><label key={count} className={`ai-gen-period-option${pageCount===count ? " is-selected" : ""}`}>
                <input type="radio" name="pageCount" value={count} checked={pageCount===count} onChange={()=>setPageCount(count)} />
                {count}P{count===48 ? "（おすすめ）" : ""}
              </label>)}
            </div>
            <p className="app-help">良い写真を大きく使い、日付やことばと組み合わせます。少なくとも{pageCount/2}枚の異なる写真が必要です。</p>
          </fieldset>
        </section>

        {state.error ? (
          <p role="alert" className="app-error">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={selectedPhotoCount === 0} className="app-button-primary">
          AIにおまかせで作る
        </button>

        <p className="app-help text-center">完成したら、まずアルバムをプレビュー。写真やレイアウトは必要なときだけ編集できます。</p>
      </form>
    </main>
  );
}
