"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchChip } from "@/app/_components/ui";
import { searchHref, type SearchFacets, type SearchState, type WordKind } from "@/lib/search-state";

const CATEGORIES: { kind: WordKind; label: string }[] = [
  { kind: "tag", label: "よくある言葉" }, { kind: "scene", label: "場所・シーン" },
  { kind: "activity", label: "していること" }, { kind: "emotion", label: "表情・気持ち" },
];

export function SearchControls({ base, state, facets, contextPetName, selectedPetName }: {
  base: string; state: SearchState; facets: SearchFacets | null; contextPetName?: string; selectedPetName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const change = (patch: Partial<SearchState>) => startTransition(() => {
    router.push(searchHref(base, state, patch), { scroll: false });
  });
  const reset = () => startTransition(() => router.push(base, { scroll: false }));
  const isFiltered = Boolean(state.q || state.word || state.favorite || state.from || state.to || (!contextPetName && state.pet));
  const selectedIsShown = facets?.words.some(w => w.kind === state.kind && w.value === state.word);

  return <div className="grid gap-6" aria-busy={pending}>
    <form action={base} method="get" role="search" className="grid gap-3">
      <label className="sr-only" htmlFor="memory-search">思い出を検索</label>
      <div className="flex gap-2">
        <input id="memory-search" name="q" type="search" defaultValue={state.q} maxLength={100}
          placeholder="思い出を検索" className="app-input min-w-0 flex-1" />
        <button type="submit" className="app-button-secondary shrink-0" disabled={pending}>検索</button>
      </div>
      {state.pet ? <input type="hidden" name="pet" value={state.pet} /> : null}
      {state.kind ? <input type="hidden" name="kind" value={state.kind} /> : null}
      {state.word ? <input type="hidden" name="word" value={state.word} /> : null}
      {state.favorite ? <input type="hidden" name="favorite" value="1" /> : null}
      <details className="text-sm text-muted" open={state.from || state.to ? true : undefined}>
        <summary className="ds-focus flex min-h-11 w-fit cursor-pointer items-center rounded-lg">期間で絞り込む</summary>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="app-label min-w-0" htmlFor="search-from">開始日
            <input className="app-input min-w-0" id="search-from" type="date" name="from" defaultValue={state.from} />
          </label>
          <label className="app-label min-w-0" htmlFor="search-to">終了日
            <input className="app-input min-w-0" id="search-to" type="date" name="to" defaultValue={state.to} />
          </label>
        </div>
      </details>
    </form>

    <section aria-labelledby="pet-filter-heading" className="grid gap-2">
      <h2 id="pet-filter-heading" className="text-sm font-semibold">うちの子</h2>
      <div className="flex flex-wrap gap-2">
        {contextPetName ? <SearchChip onClick={() => {}} pressed disabled>{contextPetName}</SearchChip> : <>
          <SearchChip onClick={() => change({ pet: "" })} pressed={!state.pet} disabled={pending}>すべて</SearchChip>
          {state.pet && selectedPetName && !facets?.pets.some(pet => pet.id === state.pet) ?
            <SearchChip onClick={() => change({ pet: "" })} pressed disabled={pending}>{selectedPetName}</SearchChip> : null}
          {facets?.pets.map(pet => <SearchChip key={pet.id} onClick={() => change({ pet: state.pet === pet.id ? "" : pet.id })}
            pressed={state.pet === pet.id} disabled={pending}>
            {pet.name}<span className="text-xs tabular-nums">{pet.count}</span>
          </SearchChip>)}
        </>}
      </div>
    </section>

    {facets ? <>
      <p className="text-xs text-muted">写真から見つけた言葉</p>
      {CATEGORIES.map(category => {
        const words = facets.words.filter(word => word.kind === category.kind);
        return words.length ? <section key={category.kind} aria-labelledby={`facet-${category.kind}`} className="grid gap-2">
          <h2 id={`facet-${category.kind}`} className="text-sm font-semibold">{category.label}</h2>
          <div className="flex flex-wrap gap-2">
            {words.map(word => {
              const selected = state.kind === word.kind && state.word === word.value;
              return <SearchChip key={word.value} pressed={selected} disabled={pending}
                onClick={() => change({ kind: selected ? "" : word.kind, word: selected ? "" : word.value })}>
                {word.value}<span className="text-xs tabular-nums">{word.count}</span>
              </SearchChip>;
            })}
          </div>
        </section> : null;
      })}
      {facets.words.length === 0 ? <p className="text-sm text-muted">写真の整理が進むと、ここに言葉が増えていきます。キーワードやお気に入りでも探せます。</p> : null}
    </> : <p className="text-sm text-muted">言葉の候補を読み込めませんでした。条件を入力して検索できます。</p>}

    <div className="flex flex-wrap items-center gap-2">
      <SearchChip pressed={state.favorite} disabled={pending} onClick={() => change({ favorite: !state.favorite })}>
        <span aria-hidden="true">♡</span> お気に入り
        {facets ? <span className="text-xs tabular-nums">{facets.favorites}</span> : null}
      </SearchChip>
      {state.word && !selectedIsShown ? <SearchChip pressed disabled={pending} onClick={() => change({ kind: "", word: "" })}>
        {state.word}を解除
      </SearchChip> : null}
      {isFiltered ? <button type="button" onClick={reset} disabled={pending} className="ds-focus min-h-11 rounded-full px-3 text-sm text-brand-terracotta-strong underline underline-offset-4">条件をクリア</button> : null}
    </div>
    <p className="sr-only" role="status">{pending ? "思い出を探しています" : ""}</p>
  </div>;
}
