import { parsePhotoCursor, type PhotoCursor } from "@/lib/photo-pagination";
import { parseTokyoLocalDateTime } from "@/lib/photo-timeline";

export const SEARCH_PAGE_SIZE = 36;
export const WORD_KINDS = ["tag", "scene", "activity", "emotion"] as const;
export type WordKind = typeof WORD_KINDS[number];
export type SearchParams = Record<string, string | string[] | undefined>;
export type SearchState = {
  q: string; pet: string; kind: string; word: string; favorite: boolean; from: string; to: string;
};
export type SearchFacet = { kind: WordKind; value: string; count: number };
export type SearchFacets = {
  words: SearchFacet[]; pets: { id: string; name: string; count: number }[];
  total: number; completed: number; favorites: number;
};
export type SearchPhoto = {
  id: string; pet_id: string; pet_name: string; storage_path: string; thumbnail_path: string | null;
  taken_at: string | null; created_at: string; timeline_at: string; caption: string | null;
  description: string | null; favorite: boolean;
};
export type SearchPageData = { total: number; photos: SearchPhoto[] };
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

export function parseSearchState(params: SearchParams, contextPetId?: string) {
  const state: SearchState = {
    q: first(params.q).trim(), pet: contextPetId ?? first(params.pet), kind: first(params.kind),
    word: first(params.word).replace(/[\s　]+/g, " ").trim().toLowerCase(),
    favorite: first(params.favorite) === "1", from: first(params.from), to: first(params.to),
  };
  const before = first(params.before), beforeId = first(params.beforeId);
  const cursor: PhotoCursor = parsePhotoCursor(before, beforeId);
  let error: string | null = null;
  if (state.q.length > 100) error = "キーワードは100文字以内で入力してください。";
  else if (state.pet && !UUID_PATTERN.test(state.pet)) error = "ペットの条件を確認してください。";
  else if ((state.kind || state.word) && (!WORD_KINDS.includes(state.kind as WordKind) || !state.word || [...state.word].length > 24)) error = "選択した言葉を確認してください。";
  else if ((state.from && !validDate(state.from)) || (state.to && !validDate(state.to))) error = "正しい日付を入力してください。";
  else if (state.from && state.to && state.from > state.to) error = "開始日は終了日以前の日付を指定してください。";
  else if (first(params.favorite) && first(params.favorite) !== "1") error = "お気に入りの条件を確認してください。";
  else if ((before || beforeId) && (!cursor || !UUID_PATTERN.test(beforeId))) error = "ページの位置を確認してください。条件をクリアして再度お試しください。";
  return { state, cursor, error };
}

export function searchValues(state: SearchState): Record<string, string> {
  return Object.fromEntries(Object.entries({
    q: state.q, pet: state.pet, kind: state.kind, word: state.word,
    favorite: state.favorite ? "1" : "", from: state.from, to: state.to,
  }).filter(([, value]) => value !== ""));
}

// Filter changes always drop the old cursor. Browser Back restores the prior URL.
export function searchHref(base: string, state: SearchState, patch: Partial<SearchState> = {}) {
  const query = new URLSearchParams(searchValues({ ...state, ...patch })).toString();
  return query ? `${base}?${query}` : base;
}

export function searchDateBounds(state: SearchState) {
  const end = state.to ? new Date(`${state.to}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 1);
  return {
    from: state.from ? parseTokyoLocalDateTime(`${state.from}T00:00`)?.toISOString() ?? null : null,
    to: end ? parseTokyoLocalDateTime(`${end.toISOString().slice(0, 10)}T00:00`)?.toISOString() ?? null : null,
  };
}
