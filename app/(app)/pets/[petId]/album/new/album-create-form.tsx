"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { createAlbumDraft, type CreateAlbumState } from "./actions";
import { AlbumGeneratingScreen, useGeneratingStep } from "./album-generating-screen";
import { checkAlbumReadiness } from "./readiness-actions";
import { RecoveryState } from "./recovery-state";
import { ALBUM_PREPARE_MAX_POLLS, ALBUM_RECOVERY_MAX_RETRIES, boundedAlbumRecovery, intentFormData, nextAlbumIntentStep, validAlbumIntent, type AlbumIntent, type AlbumReadiness } from "@/lib/album-readiness";

const PERIOD_OPTIONS = [
  { value: "3months", label: "最近3か月" },
  { value: "6months", label: "最近半年" },
  { value: "1year", label: "最近1年" },
  { value: "all", label: "すべて" },
  { value: "custom", label: "期間を指定" },
] as const;

const initialState: CreateAlbumState = { error: null };

export function AlbumCreateForm({ petId, petName, petOptions, backHref, services }: { petId: string; petName: string; petOptions: Array<{ id: string; name: string; photoCount: number }>; backHref: string; services?: { create: typeof createAlbumDraft; readiness: typeof checkAlbumReadiness } }) {
  const boundAction = async (previous: CreateAlbumState, data: FormData): Promise<CreateAlbumState> => {
    try {
      return await (services?.create ?? createAlbumDraft)(petId, previous, data);
    } catch {
      return { error: null, status: "retryable" };
    }
  };
  const router = useRouter();
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [selected, setSelected] = useState<string>("3months");
  const [petSelection, setPetSelection] = useState("all");
  const [petIds, setPetIds] = useState(petOptions.map((pet) => pet.id));
  const [pageCount, setPageCount] = useState(48);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [intent, setIntent] = useState<AlbumIntent | null>(null);
  const [readiness, setReadiness] = useState<AlbumReadiness | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const executing = useRef(false);
  const polls = useRef(0);
  const generationRetries = useRef(0);
  const mounted = useRef(false);
  const storageKey = `uchinoco:album-intent:${petId}`;
  const ownedPetKey = petOptions.map((pet) => pet.id).join(",");
  const generatingStep = useGeneratingStep(pending);
  const selectedPets = petSelection === "all" ? petOptions : petOptions.filter((pet) => petIds.includes(pet.id));
  const selectedPhotoCount = selectedPets.reduce((sum, pet) => sum + pet.photoCount, 0);
  const selectedPetLabel = petSelection === "all" ? "すべてのペット" : selectedPets.map((pet) => pet.name).join("・") || petName;
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === selected)?.label ?? PERIOD_OPTIONS[0].label;

  const selectedIds = selectedPets.map((pet) => pet.id);
  const settingsKey = JSON.stringify({ selectedIds, selected, pageCount, periodFrom, periodTo });

  function saveIntent(next: AlbumIntent | null) {
    try {
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* State still works when browser storage is unavailable. */
    }
    setIntent(next);
  }

  function cancelIntent() {
    if (executing.current) return;
    saveIntent(null);
    polls.current = 0;
    generationRetries.current = 0;
    setRecovery(null);
    setRefreshKey((value) => value + 1);
  }

  function beginGeneration(current: AlbumIntent) {
    if (executing.current || !mounted.current) return;
    executing.current = true;
    saveIntent({ ...current, phase: "generating" });
    startTransition(() => formAction(intentFormData(current)));
  }

  const restoreIntent = useEffectEvent(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (validAlbumIntent(saved, petId, ownedPetKey.split(","))) {
        setPetSelection("selected");
        setPetIds(saved.petIds);
        setSelected(saved.period);
        setPageCount(saved.pageCount);
        setPeriodFrom(saved.periodFrom);
        setPeriodTo(saved.periodTo);
        setIntent(saved);
      } else sessionStorage.removeItem(storageKey);
    } catch {
      /* Corrupt browser state is discarded rather than submitted. */
    }
  });
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => restoreIntent(), 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [storageKey, petId, ownedPetKey]);

  const handleResult = useEffectEvent(() => {
    if (!mounted.current) return;
    if (!state.status && !state.error) return;
    executing.current = false;
    if (state.status === "complete" && state.previewHref) {
      saveIntent(null);
      router.replace(state.previewHref);
      return;
    }
    if (state.status === "preparing") {
      if (intent) saveIntent({ ...intent, phase: "preparing" });
      setReadiness(null);
      setRefreshKey((value) => value + 1);
      return;
    }
    if ((state.status === "retryable" || state.status === "in_progress") && intent && generationRetries.current < ALBUM_RECOVERY_MAX_RETRIES) {
      const delay = state.status === "in_progress" ? 60_000 : 2000 * (generationRetries.current + 1);
      generationRetries.current++;
      const timer = setTimeout(() => beginGeneration(intent), delay);
      return () => clearTimeout(timer);
    }
    setRecovery(state.status === "action_required" ? (state.error ?? "作成条件を確認できます。") : "作成を完了できませんでした。作成状況をもう一度確認できます。");
  });
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = setTimeout(() => {
      cleanup = handleResult();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [state]);

  const resumeIntent = useEffectEvent((current: AlbumIntent) => beginGeneration(current));
  const checkReadiness = useEffectEvent((data: FormData) => (services?.readiness ?? checkAlbumReadiness)(petId, data));
  useEffect(() => {
    if (pending || executing.current || recovery) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const settings = JSON.parse(settingsKey) as { selectedIds: string[]; selected: string; pageCount: number; periodFrom: string; periodTo: string };
    const currentSettings = intent ?? { id: crypto.randomUUID(), petId, petIds: settings.selectedIds, period: settings.selected, pageCount: settings.pageCount, periodFrom: settings.periodFrom, periodTo: settings.periodTo, requestedAt: new Date().toISOString(), phase: "preparing" as const };
    async function check() {
      try {
        const result = await boundedAlbumRecovery(
          async () => {
            const checked = await checkReadiness(intentFormData(currentSettings));
            if (checked.state === "unavailable") throw new Error("temporarily_unavailable");
            return checked;
          },
          (attempt) =>
            new Promise((resolve) => {
              timer = setTimeout(resolve, attempt * 2000);
            }),
        );
        if (disposed) return;
        setReadiness(result);
        if (intent) {
          if (!validAlbumIntent(intent, petId, ownedPetKey.split(","))) {
            setRecovery("準備の有効期限が過ぎました。作成条件を確認して続けられます。");
            return;
          }
          const next = nextAlbumIntentStep(intent, result, executing.current);
          if (next === "generate") {
            resumeIntent(intent);
            return;
          }
          if (next === "recover") {
            setRecovery(null);
            return;
          }
          if (++polls.current >= ALBUM_PREPARE_MAX_POLLS) {
            setRecovery("準備に時間がかかっています。写真は保存されています。ここで準備を続けるか、条件を変更できます。");
            return;
          }
          timer = setTimeout(check, 5000);
        }
      } catch {
        if (disposed) return;
        setRecovery("写真の確認を完了できませんでした。もう一度確認できます。");
      }
    }
    timer = setTimeout(() => {
      setReadiness(null);
      void check();
    }, 300);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [settingsKey, intent, refreshKey, pending, recovery, petId, ownedPetKey]);

  function requestCreation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (executing.current || pending || intent) return;
    const current: AlbumIntent = { id: crypto.randomUUID(), petId, petIds: selectedIds, period: selected, pageCount, periodFrom, periodTo, requestedAt: new Date().toISOString(), phase: "preparing" };
    polls.current = 0;
    generationRetries.current = 0;
    saveIntent(current);
  }

  function rememberForPhotoAdd() {
    if (intent) return;
    saveIntent({ id: crypto.randomUUID(), petId, petIds: selectedIds, period: selected, pageCount, periodFrom, periodTo, requestedAt: new Date().toISOString(), phase: "preparing" });
  }

  function selectSmallerPages(pages: 24 | 48) {
    if (intent) saveIntent({ ...intent, pageCount: pages, phase: "preparing" });
    else cancelIntent();
    setPageCount(pages);
  }

  const shortage = readiness?.state === "shortage";
  const locked = Boolean(intent);
  const blocked = !readiness || shortage || readiness.state === "action_required";

  if (pending || (intent?.phase === "generating" && !recovery)) {
    return (
      <div role="status" aria-live="polite">
        <AlbumGeneratingScreen petName={selectedPetLabel} photoCount={readiness?.total ?? selectedPhotoCount} backHref={backHref} activeStep={generatingStep} />
      </div>
    );
  }

  return (
    <main className="ai-gen-page ai-gen-page--form">
      <header className="ai-gen-header">
        <Link href={backHref} className="ai-gen-header-side ai-gen-back ds-focus" aria-label="戻る">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="ai-gen-header-title">AIアルバムを作る</h1>
        <Link href={backHref} onClick={cancelIntent} className="ai-gen-header-side ai-gen-cancel ds-focus">
          キャンセル
        </Link>
      </header>

      <form onSubmit={requestCreation} className="ai-gen-form">
        <h2 className="ai-gen-form-title">AIが{selectedPetLabel}のアルバムをまとめます</h2>
        {selectedPhotoCount > 0 ? <p className="ai-gen-form-desc">{selectedPeriodLabel}の思い出から、写真選びとページ構成をAIに任せて一冊にまとめます。</p> : <p className="ai-gen-form-desc">写真を追加するか、対象を変更するとアルバムを作れます。</p>}

        <fieldset disabled={locked} className="ai-gen-options min-w-0" aria-label="アルバムの作成条件">
          <input type="hidden" name="petSelection" value={petSelection} />
          <fieldset className="ai-gen-period">
            <legend>アルバムに含めるペット</legend>
            <div className="ai-gen-period-grid">
              {petOptions.length > 1 ? (
                <label className={`ai-gen-period-option ds-focus${petSelection === "all" ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={petSelection === "all"}
                    onChange={(event) => {
                      setPetSelection(event.target.checked ? "all" : "selected");
                      setPetIds(event.target.checked ? petOptions.map((pet) => pet.id) : []);
                    }}
                  />
                  すべて
                </label>
              ) : null}
              {petOptions.map((pet) => (
                <label key={pet.id} className={`ai-gen-period-option ds-focus${petIds.includes(pet.id) ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    name="petIds"
                    value={pet.id}
                    checked={petIds.includes(pet.id)}
                    onChange={(event) => {
                      setPetSelection("selected");
                      setPetIds((ids) => (event.target.checked ? [...ids, pet.id] : ids.filter((id) => id !== pet.id)));
                    }}
                  />
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
          {selected === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0">
                開始日
                <input type="date" name="periodFrom" required className="app-input w-full" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
              </label>
              <label className="min-w-0">
                終了日
                <input type="date" name="periodTo" required className="app-input w-full" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
              </label>
            </div>
          ) : null}
          <fieldset className="ai-gen-period">
            <legend>本文のページ数（表紙・裏表紙は別）</legend>
            <div className="ai-gen-period-grid">
              {[24, 48, 72].map((count) => (
                <label key={count} className={`ai-gen-period-option${pageCount === count ? " is-selected" : ""}`}>
                  <input type="radio" name="pageCount" value={count} checked={pageCount === count} onChange={() => setPageCount(count)} />
                  {count}P{count === 48 ? "（おすすめ）" : ""}
                </label>
              ))}
            </div>
            <p className="app-help">良い写真を大きく使い、日付やことばと組み合わせます。少なくとも{pageCount / 2}枚の異なる写真が必要です。</p>
          </fieldset>
        </fieldset>

        {recovery ? (
          <RecoveryState
            title="ここから続けられます"
            description={recovery}
            primaryAction={
              state.recoveryHref
                ? { label: "ログインして続ける", href: state.recoveryHref }
                : state.status === "failed" || state.status === "action_required"
                  ? { label: "作成条件を変更", onClick: cancelIntent }
                  : {
                      label: "もう一度確認する",
                      onClick: () => {
                        polls.current = 0;
                        generationRetries.current = 0;
                        setRecovery(null);
                        setRefreshKey((value) => value + 1);
                      },
                    }
            }
            secondaryAction={{ label: "アルバム一覧へ戻る", href: backHref }}
          />
        ) : shortage && readiness ? (
          <RecoveryState
            title="写真を追加すると作成できます"
            description={`${pageCount}ページのアルバムには、あと${readiness.missingPhotos}枚の写真が必要です。`}
            primaryAction={{ label: "写真を追加", href: `/pets/${petId}/photos/new?returnTo=${encodeURIComponent(`/pets/${petId}/album/new`)}`, onClick: rememberForPhotoAdd }}
            secondaryAction={readiness.suggestedPages ? { label: `${readiness.suggestedPages}ページに変更`, onClick: () => selectSmallerPages(readiness.suggestedPages!) } : { label: "対象期間を変更", onClick: cancelIntent }}
          />
        ) : readiness?.state === "action_required" ? (
          <RecoveryState
            title="作成条件を確認できます"
            description="ペット・対象期間を選び直すか、別の写真を追加できます。"
            primaryAction={readiness.action === "login" ? { label: "ログインして続ける", href: `/login?next=${encodeURIComponent(`/pets/${petId}/album/new`)}` } : { label: "条件を変更", onClick: cancelIntent }}
            secondaryAction={{ label: "アルバム一覧へ戻る", href: backHref }}
          />
        ) : readiness?.state === "preparing" ? (
          <RecoveryState
            title={intent ? "アルバムを準備しています" : "写真を確認しています"}
            description={intent ? "写真を確認して、ベストショットを選ぶ準備をしています。準備ができたら、そのままアルバムを作ります。" : "準備を始めると、写真を確認してそのままアルバムを作ります。"}
            progress={{ ready: readiness.ready, total: readiness.total }}
            secondaryAction={intent ? { label: "作成を中止して条件を変更", onClick: cancelIntent } : undefined}
          />
        ) : !readiness ? (
          <p role="status" aria-live="polite" className="text-sm text-muted">
            写真を確認しています…
          </p>
        ) : null}

        {!intent && !recovery ? (
          <button type="submit" disabled={blocked} className="app-button-primary min-h-11">
            {readiness?.state === "preparing" ? "準備してアルバムを作る" : "アルバムを作る"}
          </button>
        ) : null}

        <p className="app-help text-center">完成したら、まずアルバムをプレビュー。写真やレイアウトは必要なときだけ編集できます。</p>
      </form>
    </main>
  );
}
