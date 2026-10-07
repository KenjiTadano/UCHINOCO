"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Cake,
  Flower2,
  Heart,
  Mountain,
  PawPrint,
  Search,
  SlidersHorizontal,
  Sofa,
  Sun,
  Tag,
  Users,
  Volleyball,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, useTransition } from "react";
import {
  searchHref,
  type SearchFacets,
  type SearchState,
  type WordKind,
} from "@/lib/search-state";

type KeywordItem = {
  kind: WordKind;
  value: string;
  count: number;
};

type KeywordGlyph = {
  Icon: LucideIcon;
  /** Design tints a few chips away from the shared terracotta. */
  tone?: string;
  filled?: boolean;
};

const KEYWORD_GLYPHS: { match: RegExp; glyph: KeywordGlyph }[] = [
  { match: /寝|sleep|睡眠|リラックス|くつろ|室内|おうち/, glyph: { Icon: Sofa } },
  {
    match: /おでかけ|outing|晴|太陽|sun|日向|ひなた|公園/,
    glyph: { Icon: Sun, tone: "#df8a3c" },
  },
  { match: /誕生日|birthday|cake|記念|お祝い/, glyph: { Icon: Cake } },
  {
    match: /桜|花|flower|春|sakura/,
    glyph: { Icon: Flower2, tone: "#e08aa6" },
  },
  {
    match: /海|sea|波|wave|川|プール|水遊/,
    glyph: { Icon: Waves, tone: "#6fa6c8" },
  },
  {
    match: /山|mountain|森|登山|ハイキング/,
    glyph: { Icon: Mountain, tone: "#6a5247" },
  },
  { match: /おもちゃ|toy|ボール|ball|遊/, glyph: { Icon: Volleyball } },
  {
    match: /かわいい|cute|好き|heart|笑顔|癒/,
    glyph: { Icon: Heart, filled: true },
  },
  { match: /家族|family|みんな|親子|一緒/, glyph: { Icon: Users } },
  {
    match: /散歩|さんぽ|walk|paw|猫|犬|ペット/,
    glyph: { Icon: PawPrint, filled: true },
  },
];

function KeywordIcon({ value }: { value: string }) {
  const v = value.toLowerCase();
  const { Icon, tone, filled } =
    KEYWORD_GLYPHS.find((entry) => entry.match.test(v))?.glyph ?? {
      Icon: Tag,
    };

  return (
    <span
      className="search-kw-icon"
      style={tone ? { color: tone } : undefined}
      aria-hidden="true"
    >
      <Icon
        strokeWidth={1.7}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
      />
    </span>
  );
}

export function SearchControls({
  base,
  state,
  facets,
  contextPetName,
  popularKeywords,
  advancedEnabled,
}: {
  base: string;
  state: SearchState;
  facets: SearchFacets | null;
  contextPetName?: string;
  popularKeywords: KeywordItem[];
  advancedEnabled: boolean;
}) {
  const router = useRouter();
  const filterId = useId();
  const [pending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(state.from || state.to || state.favorite || state.year || state.month || state.season || state.best || state.anniversary || state.story),
  );
  const [showAllKeywords, setShowAllKeywords] = useState(false);

  const change = (patch: Partial<SearchState>) =>
    startTransition(() => {
      router.push(searchHref(base, state, patch), { scroll: false });
    });
  const reset = () =>
    startTransition(() => {
      router.push(base, { scroll: false });
    });

  const isFiltered = Boolean(
    state.q ||
      state.word ||
      state.favorite ||
      state.from ||
      state.to ||
      state.year ||
      state.month ||
      state.season ||
      state.best ||
      state.anniversary ||
      state.story ||
      (!contextPetName && state.pet),
  );

  const allUniqueWords = (() => {
    const ranked = (facets?.words ?? []).slice().sort((a, b) => b.count - a.count);
    const seen = new Set<string>();
    const unique: KeywordItem[] = [];
    for (const word of ranked) {
      if (seen.has(word.value)) continue;
      seen.add(word.value);
      unique.push(word);
    }
    return unique;
  })();

  const keywords = showAllKeywords ? allUniqueWords : popularKeywords;
  const selectedIsShown = facets?.words.some(
    (w) => w.kind === state.kind && w.value === state.word,
  );

  return (
    <div className="search-controls" aria-busy={pending}>
      <form action={base} method="get" role="search" className="search-form">
        <label className="sr-only" htmlFor="memory-search">
          写真を検索
        </label>
        <div className="search-bar">
          <span className="search-bar-icon" aria-hidden="true">
            <Search strokeWidth={1.8} />
          </span>
          <input
            id="memory-search"
            name="q"
            type="search"
            defaultValue={state.q}
            maxLength={100}
            placeholder="写真の内容で検索できます"
            className="search-bar-input"
            autoComplete="off"
          />
          <button
            type="button"
            className={`search-bar-filter ds-focus ${filtersOpen ? "is-open" : ""}`}
            aria-expanded={filtersOpen}
            aria-controls={filterId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span className="sr-only">詳細条件</span>
            <SlidersHorizontal strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        <p className="search-bar-hint">
          例）海、散歩、寝顔、おもちゃ、桜、誕生日 など
        </p>

        {contextPetName && state.pet ? <input type="hidden" name="pet" value={state.pet} /> : null}
        {state.kind ? <input type="hidden" name="kind" value={state.kind} /> : null}
        {state.word ? <input type="hidden" name="word" value={state.word} /> : null}
        {state.favorite ? <input type="hidden" name="favorite" value="1" /> : null}
        {state.best ? <input type="hidden" name="best" value="1" /> : null}

        <div
          id={filterId}
          className="search-filters"
          hidden={!filtersOpen}
        >
          <div className="search-filters-dates">
            {!contextPetName ? (
              <label className="search-filter-label" htmlFor="search-pet">
                ペット
                <select className="app-input min-w-0" id="search-pet" name="pet" defaultValue={state.pet}>
                  <option value="">すべてのうちの子</option>
                  {(facets?.pets ?? []).map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
                </select>
              </label>
            ) : null}
            {advancedEnabled ? <><label className="search-filter-label" htmlFor="search-year">
              年
              <input className="app-input min-w-0" id="search-year" name="year" inputMode="numeric" pattern="[0-9]{4}" placeholder="2026" defaultValue={state.year} />
            </label>
            <label className="search-filter-label" htmlFor="search-month">
              月
              <select className="app-input min-w-0" id="search-month" name="month" defaultValue={state.month}>
                <option value="">すべて</option>
                {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}月</option>)}
              </select>
            </label>
            <label className="search-filter-label" htmlFor="search-season">
              季節
              <select className="app-input min-w-0" id="search-season" name="season" defaultValue={state.season}>
                <option value="">すべて</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option>
              </select>
            </label>
            <label className="search-filter-label" htmlFor="search-from">
              開始日
              <input
                className="app-input min-w-0"
                id="search-from"
                type="date"
                name="from"
                defaultValue={state.from}
              />
            </label>
            <label className="search-filter-label" htmlFor="search-to">
              終了日
              <input
                className="app-input min-w-0"
                id="search-to"
                type="date"
                name="to"
                defaultValue={state.to}
              />
            </label>
            <label className="search-filter-label" htmlFor="search-anniversary">
              記念日
              <select className="app-input min-w-0" id="search-anniversary" name="anniversary" defaultValue={state.anniversary}>
                <option value="">すべて</option><option value="birthday">誕生日</option><option value="adoption">お迎え日</option><option value="on_this_day">過去の今日</option>
              </select>
            </label>
            <label className="search-filter-label" htmlFor="search-story">
              Story
              <select className="app-input min-w-0" id="search-story" name="story" defaultValue={state.story}>
                <option value="">すべて</option><option value="event">イベント</option><option value="same_day">同じ日のStory</option><option value="sequence">連続したStory</option><option value="contrast">対比</option><option value="everyday">日常</option><option value="single">1枚のStory</option>
              </select>
            </label>
            </> : (
              <div className="rounded-[14px] border border-border-warm bg-surface-warm px-4 py-3 text-sm text-muted sm:col-span-2">
                <p>年・月・季節・記念日・Storyでの詳細検索はPLUSで利用できます。</p>
                <Link href={`/plus?next=${encodeURIComponent(base)}`} className="ds-focus mt-2 inline-flex min-h-11 items-center font-semibold text-brand-terracotta-strong">
                  PLUSを見る
                </Link>
              </div>
            )}
          </div>
          <div className="search-filters-actions">
            <button type="submit" className="app-button-secondary" disabled={pending}>
              この条件で検索
            </button>
            <button
              type="button"
              className={`search-fav-toggle ds-focus ${state.favorite ? "is-on" : ""}`}
              aria-pressed={state.favorite}
              disabled={pending}
              onClick={() => change({ favorite: !state.favorite })}
            >
              <span aria-hidden="true">♡</span> お気に入り
              {facets ? (
                <span className="tabular-nums text-[10px]">{facets.favorites}</span>
              ) : null}
            </button>
            {advancedEnabled ? <button type="button" className={`search-fav-toggle ds-focus ${state.best ? "is-on" : ""}`} aria-pressed={state.best} disabled={pending} onClick={() => change({ best: !state.best })}>
              <span aria-hidden="true">★</span> Best Shot
            </button> : null}
            {isFiltered ? (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="search-clear ds-focus"
              >
                条件をクリア
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {keywords.length > 0 ? (
        <section aria-labelledby="search-keywords-heading" className="search-section">
          <div className="search-section-head">
            <h2 id="search-keywords-heading" className="search-section-title">
              人気のキーワード
            </h2>
            {allUniqueWords.length > popularKeywords.length ? (
              <button
                type="button"
                className="search-section-more ds-focus"
                onClick={() => setShowAllKeywords((v) => !v)}
              >
                {showAllKeywords ? "閉じる" : "すべて見る →"}
              </button>
            ) : null}
          </div>
          <div className="search-keywords">
            {keywords.map((word) => {
              const selected =
                state.kind === word.kind && state.word === word.value;
              return (
                <button
                  key={`${word.kind}:${word.value}`}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  className={`search-kw ds-focus ${selected ? "is-active" : ""}`}
                  onClick={() =>
                    change({
                      kind: selected ? "" : word.kind,
                      word: selected ? "" : word.value,
                    })
                  }
                >
                  <KeywordIcon value={word.value} />
                  <span>{word.value}</span>
                </button>
              );
            })}
          </div>
          {state.word && !selectedIsShown ? (
            <button
              type="button"
              className="search-clear ds-focus mt-2"
              disabled={pending}
              onClick={() => change({ kind: "", word: "" })}
            >
              「{state.word}」を解除
            </button>
          ) : null}
        </section>
      ) : facets ? (
        <p className="search-empty-hint">
          写真の整理が進むと、ここにキーワードが増えていきます。
        </p>
      ) : (
        <p className="search-empty-hint">
          言葉の候補を読み込めませんでした。キーワードで検索できます。
        </p>
      )}

      <p className="sr-only" role="status">
        {pending ? "思い出を探しています" : ""}
      </p>
    </div>
  );
}
