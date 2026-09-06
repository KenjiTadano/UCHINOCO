import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTokyoDateTime, parseTokyoLocalDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { paginationHref, parsePhotoCursor } from "@/lib/photo-pagination";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<Record<"q" | "from" | "to" | "favorite" | "before" | "beforeId", string | string[] | undefined>>;
};
type SearchPhoto = { id: string; pet_id: string; storage_path: string; taken_at: string | null; created_at: string; caption: string | null; favorite: boolean; timeline_at: string; description: string | null; tags: string[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 50;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function isValidDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export default async function PetSearchPage({ params, searchParams }: Props) {
  const [{ petId }, queryParams] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(petId)) notFound();

  const rawQuery = first(queryParams.q);
  const from = first(queryParams.from);
  const to = first(queryParams.to);
  const rawFavorite = first(queryParams.favorite);
  const cursor = parsePhotoCursor(first(queryParams.before), first(queryParams.beforeId));
  const query = rawQuery.trim();
  const favoriteOnly = rawFavorite === "1";
  const hasCondition = Boolean(query || from || to || favoriteOnly);
  let validationError: string | null = null;
  if (query.length > MAX_QUERY_LENGTH) validationError = "キーワードは100文字以内で入力してください。";
  else if (from && !isValidDate(from)) validationError = "正しい開始日を入力してください。";
  else if (to && !isValidDate(to)) validationError = "正しい終了日を入力してください。";
  else if (from && to && from > to) validationError = "開始日は終了日以前の日付を指定してください。";
  else if (rawFavorite && rawFavorite !== "1") validationError = "お気に入り条件が正しくありません。";
  const shouldSearch = hasCondition && !validationError;

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pet, error: petError } = await supabase.from("pets")
    .select("id, name, owner_user_id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (petError || !pet || pet.owner_user_id !== user.id) notFound();

  let results: SearchPhoto[] = [];
  let signedUrlByPath = new Map<string, string>();
  let searchFailed = false;
  let hasMore = false;

  if (shouldSearch) {
    const nextDay = to
      ? new Date(`${to}T00:00:00Z`)
      : null;
    if (nextDay) nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const { data, error } = await (supabase as unknown as SupabaseClient).rpc(
      "search_pet_photos_page",
      {
        p_pet_id: pet.id,
        p_query: query || null,
        p_from: from ? parseTokyoLocalDateTime(`${from}T00:00`)?.toISOString() : null,
        p_to: nextDay ? parseTokyoLocalDateTime(`${nextDay.toISOString().slice(0, 10)}T00:00`)?.toISOString() : null,
        p_favorite_only: favoriteOnly,
        p_limit: MAX_RESULTS,
        p_cursor_at: cursor?.at ?? null,
        p_cursor_id: cursor?.id ?? null,
      },
    );
    if (error) searchFailed = true;
    else {
      results = (data ?? []) as SearchPhoto[];
      hasMore = results.length === MAX_RESULTS;
      const urls = results.length ? await supabase.storage.from("pet-photos").createSignedUrls(results.map((photo) => photo.storage_path), 3600) : { data: [], error: null };
      if (urls.error) { searchFailed = true; results = []; }
      else signedUrlByPath = new Map((urls.data ?? []).filter((item) => item.path && item.signedUrl && !item.error).map((item) => [item.path as string, item.signedUrl as string]));
    }
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>{pet.name}の思い出へ戻る</Link>
      <header><p className="app-eyebrow">{pet.name}</p><h1 className="app-title">思い出を検索</h1></header>

      <form method="get" className="app-card-flat grid gap-4" role="search">
        <label className="app-label" htmlFor="memory-search">キーワード
          <input id="memory-search" name="q" type="search" defaultValue={rawQuery} maxLength={MAX_QUERY_LENGTH} placeholder="公園、散歩、楽しそう…" className="app-input" />
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">期間</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="app-label min-w-0" htmlFor="search-from">開始日
              <input id="search-from" name="from" type="date" defaultValue={from} className="app-input min-w-0" />
            </label>
            <label className="app-label min-w-0" htmlFor="search-to">終了日
              <input id="search-to" name="to" type="date" defaultValue={to} className="app-input min-w-0" />
            </label>
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-medium" htmlFor="favorite-only">
          <input id="favorite-only" name="favorite" type="checkbox" value="1" defaultChecked={favoriteOnly} className="size-5 accent-[var(--primary)]" />
          お気に入りのみ
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" className="app-button-primary">検索する</button>
          <Link className="app-button-ghost" href={`/pets/${pet.id}/search`}>条件をクリア</Link>
        </div>
      </form>

      {validationError ? <p role="alert" className="app-error">{validationError}</p>
        : searchFailed ? <p role="alert" className="app-error">思い出を検索できませんでした。時間をおいて再度お試しください。</p>
        : !hasCondition ? <div className="app-empty"><p className="font-medium text-foreground">検索条件を入力してください</p><p className="mt-1">キーワード、期間、お気に入りを組み合わせて検索できます。</p></div>
        : results.length === 0 ? <div className="app-empty"><p className="font-medium text-foreground">条件に一致する思い出がありません</p><p className="mt-1">検索条件を変更してみてください。</p></div>
        : <section aria-labelledby="search-results-heading">
          <div className="mb-4 flex items-baseline justify-between gap-3"><h2 id="search-results-heading" className="text-lg font-semibold">検索結果</h2><p className="text-right text-sm text-muted">{results.length}件の思い出が見つかりました</p></div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {results.map((photo) => {
              const url = signedUrlByPath.get(photo.storage_path);
              const dateLabel = formatTokyoDateTime(photoTimestamp(photo));
              return <li key={photo.id}><Link href={`/pets/${pet.id}/photos/${photo.id}`} aria-label={`${pet.name}の${dateLabel}の思い出を詳しく見る${photo.favorite ? "（お気に入り）" : ""}`} className="app-card block overflow-hidden p-0 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <div className="relative aspect-square bg-primary-soft">
                  {url ? <><Image className="object-cover" src={url} alt={`${pet.name}の検索結果の思い出写真`} fill sizes="(max-width: 640px) 100vw, 288px" unoptimized />{photo.favorite ? <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-sm text-favorite shadow-sm" aria-hidden="true">★</span> : null}</> : <div className="flex size-full items-center justify-center text-sm text-muted">表示できません</div>}
                </div>
                <div className="grid gap-2 p-3 text-sm"><time className="text-muted">{dateLabel}</time>
                  {photo.caption ? <p className="line-clamp-2 whitespace-pre-wrap break-words">{photo.caption}</p> : null}
                  {photo.description ? <p className="line-clamp-2 text-muted">{photo.description}</p> : null}
                  {photo.tags.length ? <ul className="flex flex-wrap gap-1.5" aria-label="AIタグ">{photo.tags.map((tag) => <li key={tag} className="app-tag">{tag}</li>)}</ul> : null}
                </div>
              </Link></li>;
            })}
          </ul>
          {hasMore ? <Link className="app-button-secondary mx-auto mt-5 w-fit" href={paginationHref(`/pets/${pet.id}/search`, { at: results.at(-1)!.timeline_at, id: results.at(-1)!.id }, { q: query, from, to, ...(favoriteOnly ? { favorite: "1" } : {}) })}>さらに見る</Link> : null}
        </section>}
    </main>
  );
}
