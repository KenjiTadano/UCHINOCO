import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { paginationHref } from "@/lib/photo-pagination";
import { parseSearchState, SEARCH_PAGE_SIZE, searchDateBounds, searchValues,
  type SearchFacets, type SearchPageData, type SearchParams, UUID_PATTERN } from "@/lib/search-state";
import { SearchControls } from "./search-controls";

export async function SearchScreen({ params, contextPetId }: { params: SearchParams; contextPetId?: string }) {
  const { state, cursor, error: validationError } = parseSearchState(params, contextPetId);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  let petName: string | undefined;
  if (state.pet) {
    if (!UUID_PATTERN.test(state.pet)) notFound();
    const { data: pet, error } = await supabase.from("pets").select("id, name, owner_user_id")
      .eq("id", state.pet).eq("owner_user_id", user.id).maybeSingle();
    if (error || !pet || pet.owner_user_id !== user.id) notFound();
    petName = pet.name;
  }
  const base = contextPetId ? `/pets/${contextPetId}/search` : "/search";
  const dates = validationError ? { from: null, to: null } : searchDateBounds(state);
  const [facetResult, photoResult] = await Promise.all([
    supabase.rpc("get_search_facets", { p_pet_id: state.pet || undefined }),
    validationError ? Promise.resolve({ data: null, error: null }) : supabase.rpc("search_photos_page", {
      p_pet_id: state.pet || undefined, p_query: state.q || undefined,
      p_kind: state.kind || undefined, p_value: state.word || undefined, p_favorite_only: state.favorite,
      p_from: dates.from ?? undefined, p_to: dates.to ?? undefined, p_limit: SEARCH_PAGE_SIZE,
      p_cursor_at: cursor?.at, p_cursor_id: cursor?.id,
    }),
  ]);
  const facets = facetResult.error || !facetResult.data ? null : facetResult.data as unknown as SearchFacets;
  const page = photoResult.error || !photoResult.data ? null : photoResult.data as unknown as SearchPageData;
  const photos = page?.photos.slice(0, SEARCH_PAGE_SIZE) ?? [];
  const hasMore = (page?.photos.length ?? 0) > SEARCH_PAGE_SIZE;
  const images = await createListImageUrls(supabase, photos);
  const last = photos.at(-1);

  return <main className="app-page">
    {contextPetId ? <Link className="app-back-link" href={`/pets/${contextPetId}`}>{petName}の思い出へ戻る</Link> : null}
    <PageHeader title="探す" description="言葉から、思い出を見つける" />
    <SearchControls key={JSON.stringify(state)} base={base} state={state} facets={facets}
      contextPetName={contextPetId ? petName : undefined} selectedPetName={petName} />
    {validationError ? <p role="alert" className="app-error">{validationError}</p>
      : photoResult.error ? <p role="alert" className="app-error">思い出を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <section aria-labelledby="search-results-heading" className="border-t border-border pt-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="search-results-heading" className="text-base font-semibold">見つかった思い出</h2>
          <p aria-live="polite" aria-atomic="true" className="text-sm text-muted">{(page?.total ?? 0).toLocaleString()}枚の思い出</p>
        </div>
        {images.error ? <p className="mb-3 text-sm text-muted">一部の写真を表示できませんでした。</p> : null}
        {!photos.length ? <div className="app-empty">
          <p className="font-medium text-foreground">この条件の思い出はまだありません</p>
          <p className="mt-2">言葉を解除するか、別の条件で探してみてください。</p>
          <Link href={base} className="app-button-ghost mt-3">条件をクリア</Link>
        </div> : <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {photos.map(photo => {
            const url = images.signedUrlByPath.get(listImagePath(photo));
            const date = formatTokyoDateTime(photoTimestamp(photo));
            return <li key={photo.id} className="min-w-0">
              <Link href={`/pets/${photo.pet_id}/photos/${photo.id}`}
                aria-label={`${photo.pet_name}の${date}の思い出${photo.favorite ? "（お気に入り）" : ""}を詳しく見る`}
                className="ds-focus group block overflow-hidden rounded-xl border border-border bg-surface">
                <div className="relative aspect-square overflow-hidden bg-primary-soft">
                  {url ? <Image src={url} alt="" fill sizes="(max-width: 640px) 30vw, 160px" unoptimized
                    className="object-cover transition-transform group-hover:scale-[1.03]" />
                    : <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-muted">写真を表示できません</span>}
                  {photo.favorite ? <span aria-hidden="true" className="absolute right-1 top-1 rounded-full bg-surface/95 px-1.5 py-0.5 text-sm text-favorite">♥</span> : null}
                </div>
                <div className="grid gap-0.5 p-2 text-xs">
                  {!state.pet ? <p className="truncate font-medium">{photo.pet_name}</p> : null}
                  <time dateTime={photoTimestamp(photo)} className="truncate text-muted">{date.split(" ")[0]}</time>
                  {photo.caption || photo.description ? <p className="line-clamp-1 text-muted">{photo.caption || photo.description}</p> : null}
                </div>
              </Link>
            </li>;
          })}
        </ul>}
        {hasMore && last ? <Link className="app-button-secondary mx-auto mt-5 w-fit"
          href={paginationHref(base, { at: last.timeline_at, id: last.id }, searchValues(state))}>さらに見る</Link> : null}
        {cursor ? <Link href={`${base}?${new URLSearchParams(searchValues(state))}`} className="app-button-ghost mx-auto mt-3 w-fit">最初のページへ</Link> : null}
      </section>}
  </main>;
}
