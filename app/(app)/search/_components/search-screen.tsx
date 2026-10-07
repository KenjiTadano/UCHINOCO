import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, Cake, ChevronRight, CircleHelp, Sparkles } from "lucide-react";
import { PetSwitcher } from "@/app/(app)/_components/pet-switcher";
import { PlusUpsell } from "@/app/(app)/_components/plus-upsell";
import { EmptyState } from "@/app/_components/ui";
import { freeSearchSelection, isAdvancedSearchSelection } from "@/lib/entitlements";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { loadOwnerPetsForSwitcher } from "@/lib/owner-pets";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { paginationHref } from "@/lib/photo-pagination";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { discoveryDateBounds, interpretMemoryQuery, loadDiscoveryGroups } from "@/lib/memory-discovery";
import {
  parseSearchState,
  SEARCH_PAGE_SIZE,
  searchHref,
  searchValues,
  type SearchFacets,
  type SearchPageData,
  type SearchParams,
  type SearchPhoto,
  type WordKind,
  UUID_PATTERN,
} from "@/lib/search-state";
import { createClient } from "@/lib/supabase/server";
import { SearchControls } from "./search-controls";

type SampleCard = {
  kind: WordKind;
  value: string;
  count: number;
  photo: SearchPhoto | null;
  src: string | null;
};

async function sampleForWord(
  // Typed loosely: server client RPC surface matches production facets.
  supabase: Awaited<ReturnType<typeof createClient>>,
  petId: string | undefined,
  kind: WordKind,
  value: string,
): Promise<SearchPhoto | null> {
  const { data, error } = await supabase.rpc("search_photos_page", {
    p_pet_id: petId,
    p_kind: kind,
    p_value: value,
    p_limit: 1,
  });
  if (error || !data) return null;
  const page = data as unknown as SearchPageData;
  return page.photos[0] ?? null;
}

function recCaption(photo: SearchPhoto | null, value: string) {
  if (photo?.caption?.trim()) return photo.caption.trim();
  if (photo?.description?.trim()) return photo.description.trim();
  return `「${value}」の写真が見つかりました`;
}

export async function SearchScreen({
  params,
  contextPetId,
}: {
  params: SearchParams;
  contextPetId?: string;
}) {
  const parsed = parseSearchState(
    params,
    contextPetId,
  );
  const interpretation = interpretMemoryQuery(parsed.state);
  const { cursor, error: validationError } = parsed;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const entitlements = await loadUserEntitlements(supabase, user.id);
  const advancedRequested = isAdvancedSearchSelection(interpretation.state);
  const advancedSearchBlocked = advancedRequested && !entitlements.canUseAdvancedSearch;
  const state = advancedSearchBlocked
    ? freeSearchSelection(interpretation.state)
    : interpretation.state;

  let petName: string | undefined;
  if (state.pet) {
    if (!UUID_PATTERN.test(state.pet)) notFound();
    const { data: pet, error } = await supabase
      .from("pets")
      .select("id, name, owner_user_id")
      .eq("id", state.pet)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error || !pet || pet.owner_user_id !== user.id) notFound();
    petName = pet.name;
  }

  const base = contextPetId ? `/pets/${contextPetId}/search` : "/search";
  const dates = validationError
    ? { from: null, to: null }
    : discoveryDateBounds(state);

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
      (!contextPetId && state.pet),
  );

  const photoQuery = advancedSearchBlocked
    ? ""
    : interpretation.photoQuery || (state.anniversary === "birthday" ? "誕生日" : state.anniversary === "adoption" ? "お迎え" : "");
  const skipPhotoSearch = (state.best || state.story) && !photoQuery && !state.word && !state.favorite;
  const [ownerPetsResult, facetResult, photoResult, discovery] = await Promise.all([
    loadOwnerPetsForSwitcher(supabase, user.id),
    supabase.rpc("get_search_facets", {
      p_pet_id: state.pet || undefined,
    }),
    validationError || skipPhotoSearch
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("search_photos_page", {
          p_pet_id: state.pet || undefined,
          p_query: photoQuery || undefined,
          p_kind: state.kind || undefined,
          p_value: state.word || undefined,
          p_favorite_only: state.favorite,
          p_from: dates.from ?? undefined,
          p_to: dates.to ?? undefined,
          p_limit: isFiltered ? SEARCH_PAGE_SIZE : 8,
          p_cursor_at: cursor?.at,
          p_cursor_id: cursor?.id,
        }),
    validationError || !isFiltered
      ? Promise.resolve({ bestShots: [], stories: [], albums: [], anniversaries: [], error: null })
      : loadDiscoveryGroups({ supabase, userId: user.id, state }),
  ]);

  const facets =
    facetResult.error || !facetResult.data
      ? null
      : (facetResult.data as unknown as SearchFacets);
  const page =
    photoResult.error || !photoResult.data
      ? null
      : (photoResult.data as unknown as SearchPageData);

  const resultPhotos = isFiltered
    ? (page?.photos.slice(0, SEARCH_PAGE_SIZE) ?? [])
    : [];
  const recentPhotos = !isFiltered
    ? (page?.photos.slice(0, 5) ?? [])
    : [];
  const hasMore =
    isFiltered && (page?.photos.length ?? 0) > SEARCH_PAGE_SIZE;
  const last = resultPhotos.at(-1);

  const popularKeywords = (() => {
    const ranked = (facets?.words ?? [])
      .slice()
      .sort((a, b) => b.count - a.count);
    const seen = new Set<string>();
    const unique: typeof ranked = [];
    for (const word of ranked) {
      if (seen.has(word.value)) continue;
      seen.add(word.value);
      unique.push(word);
      if (unique.length >= 6) break;
    }
    return unique;
  })();

  const sceneFacets = (facets?.words ?? [])
    .filter((w) => w.kind === "scene")
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const aiFacets = (facets?.words ?? [])
    .filter((w) => w.kind === "emotion" || w.kind === "tag" || w.kind === "activity")
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const discoveryWords = !isFiltered
    ? [...sceneFacets, ...aiFacets]
    : [];

  const samples = await Promise.all(
    discoveryWords.map(async (w) => {
      const photo = await sampleForWord(
        supabase,
        state.pet || undefined,
        w.kind,
        w.value,
      );
      return { ...w, photo } as SampleCard & { photo: SearchPhoto | null };
    }),
  );

  const samplePhotos = samples
    .map((s) => s.photo)
    .filter((p): p is SearchPhoto => Boolean(p));

  const images = await createListImageUrls(supabase, [
    ...resultPhotos,
    ...recentPhotos,
    ...samplePhotos,
    ...discovery.bestShots,
  ]);

  const groupedResultCount = discovery.bestShots.length + discovery.stories.length + discovery.albums.length + discovery.anniversaries.length;
  const hasAnyResult = resultPhotos.length > 0 || groupedResultCount > 0;
  if (!cursor) {
    await recordProductAnalyticsEvent({ supabase, userId: user.id, eventType: "search_opened" });
  }
  if (!cursor && isFiltered && !validationError && !photoResult.error && !hasAnyResult) {
    await recordProductAnalyticsEvent({ supabase, userId: user.id, eventType: "search_empty" });
  }
  const storyLabels: Record<string, string> = { single: "1枚のStory", sequence: "連続したStory", contrast: "対比のStory", event: "イベント", same_day: "同じ日のStory", everyday: "日常のStory" };

  const sceneCards: SampleCard[] = samples
    .filter((s) => s.kind === "scene")
    .map((s) => ({
      ...s,
      src: s.photo
        ? (images.signedUrlByPath.get(listImagePath(s.photo)) ?? null)
        : null,
    }));

  const aiCards: SampleCard[] = samples
    .filter((s) => s.kind !== "scene")
    .map((s) => ({
      ...s,
      src: s.photo
        ? (images.signedUrlByPath.get(listImagePath(s.photo)) ?? null)
        : null,
    }));

  const ownerPets = ownerPetsResult.pets;
  const activePetId =
    contextPetId ??
    state.pet ??
    ownerPets[0]?.id ??
    "";

  return (
    <main className="search-page">
      <header className="search-header">
        <div className="min-w-0">
          <h1 className="search-title">探す</h1>
          <p className="search-subtitle">写真から、あの幸せをすぐに。</p>
        </div>
        {ownerPetsResult.error ? (
          <p role="alert" className="app-error text-[10px]">
            ペット情報を取得できませんでした。
          </p>
        ) : ownerPets.length > 0 && activePetId ? (
          <PetSwitcher
            layout="header"
            pets={ownerPets}
            activePetId={activePetId}
            hrefForPet={(id) => `/pets/${id}/search`}
          />
        ) : null}
      </header>

      {contextPetId && petName ? (
        <p className="sr-only">{petName}の写真を探しています</p>
      ) : null}

      <SearchControls
        key={JSON.stringify(state)}
        base={base}
        state={state}
        facets={facets}
        contextPetName={contextPetId ? petName : undefined}
        popularKeywords={popularKeywords}
        advancedEnabled={entitlements.canUseAdvancedSearch}
      />

      {advancedSearchBlocked ? (
        <PlusUpsell
          title="期間や記念日で、もっと細かく探せます"
          description="年・月・季節・Best Shot・Storyなどの詳細検索はPLUSで利用できます。キーワード検索とお気に入り検索はFREEのまま使えます。"
          returnTo={base}
        />
      ) : interpretation.understood && interpretation.label ? (
        <p className="rounded-xl bg-surface-warm px-4 py-3 text-sm text-muted" role="status">
          「{interpretation.label}」として探しています。
        </p>
      ) : null}

      {validationError ? (
        <p role="alert" className="app-error">
          {validationError}
        </p>
      ) : photoResult.error ? (
        <p role="alert" className="app-error">
          思い出を読み込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : isFiltered ? (
        <div className="search-results space-y-8">
          <div className="search-section-head">
            <h2 id="search-results-heading" className="search-section-title">
              見つかった思い出
            </h2>
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-[11px] text-muted"
            >
              写真{(page?.total ?? 0).toLocaleString()}枚 · 関連{groupedResultCount.toLocaleString()}件
            </p>
          </div>
          {discovery.error ? <p role="alert" className="app-error">一部の関連する思い出を取得できませんでした。</p> : null}
          {discovery.anniversaries.length ? (
            <section aria-labelledby="anniversary-results" className="space-y-3">
              <h3 id="anniversary-results" className="search-section-title">記念日</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {discovery.anniversaries.map((item) => (
                  <li key={`${item.petId}:${item.kind}`}>
                    <Link href={`/pets/${item.petId}/anniversary`} className="ds-focus flex min-h-16 items-center gap-3 rounded-[14px] border bg-surface px-4 py-3">
                      <Cake className="size-5 text-brand-terracotta-strong" aria-hidden="true" />
                      <span><strong className="block text-sm text-foreground">{item.petName}の{item.kind === "birthday" ? "誕生日" : "お迎え日"}</strong><span className="text-xs text-muted">{item.date.replaceAll("-", ".")}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {discovery.bestShots.length ? (
            <section aria-labelledby="best-shot-results" className="space-y-3">
              <h3 id="best-shot-results" className="search-section-title">Best Shot</h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {discovery.bestShots.map((photo) => {
                  const src = images.signedUrlByPath.get(listImagePath(photo));
                  return <li key={photo.id}><Link href={`/pets/${photo.pet_id}/photos/${photo.id}?source=search`} aria-label={`${photo.pet_name}のBest Shotを見る`} className="ds-focus group block"><div className="relative aspect-square overflow-hidden rounded-photo bg-surface-warm">{src ? <Image src={src} alt="" fill sizes="120px" unoptimized className="object-cover" /> : null}<span className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white"><Sparkles className="size-3" aria-hidden="true" /></span></div><span className="mt-1 block truncate text-[11px] text-muted">{photo.pet_name} · {Math.round(photo.score)}点</span></Link></li>;
                })}
              </ul>
            </section>
          ) : null}
          {discovery.stories.length ? (
            <section aria-labelledby="story-results" className="space-y-3">
              <h3 id="story-results" className="search-section-title">Stories</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {discovery.stories.map((story) => <li key={story.id}><Link href={`/pets/${story.petId}/album/${story.albumId}`} className="ds-focus flex min-h-14 items-center justify-between rounded-[14px] border bg-surface px-4 py-3"><span><strong className="block text-sm text-foreground">{storyLabels[story.type] ?? "Story"}</strong><span className="text-xs text-muted">{story.petName}</span></span><ChevronRight className="size-4 text-muted" aria-hidden="true" /></Link></li>)}
              </ul>
            </section>
          ) : null}
          {discovery.albums.length ? (
            <section aria-labelledby="album-results" className="space-y-3">
              <h3 id="album-results" className="search-section-title">Albums</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {discovery.albums.map((album) => <li key={album.id}><Link href={`/pets/${album.petId}/album/${album.id}`} className="ds-focus flex min-h-16 items-center gap-3 rounded-[14px] border bg-surface px-4 py-3"><BookOpen className="size-5 text-brand-terracotta-strong" aria-hidden="true" /><span><strong className="block text-sm text-foreground">{album.title}</strong><span className="text-xs text-muted">{album.petName} · {album.kind === "annual" ? "Year in Review" : "月次アルバム"}</span></span></Link></li>)}
              </ul>
            </section>
          ) : null}
          {images.error ? (
            <p className="mb-2 text-[11px] text-muted">
              一部の写真を表示できませんでした。
            </p>
          ) : null}
          {!hasAnyResult ? (
            <EmptyState
              title="見つかりませんでした"
              description="年やペットを変えるか、Best Shotを選んで探してみてください。"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={base} className="app-button-ghost">条件をクリア</Link>
                  {!state.best ? <Link href={searchHref(base, state, { q: "", word: "", kind: "", best: true })} className="app-button-secondary">Best Shotを見る</Link> : null}
                </div>
              }
            />
          ) : resultPhotos.length ? (
            <section aria-labelledby="photo-results" className="space-y-3">
            <h3 id="photo-results" className="search-section-title">Photos</h3>
            <ul className="search-result-grid">
              {resultPhotos.map((photo) => {
                const url = images.signedUrlByPath.get(listImagePath(photo));
                const date = formatTokyoDateTime(photoTimestamp(photo));
                return (
                  <li key={photo.id} className="min-w-0">
                    <Link
                      href={`/pets/${photo.pet_id}/photos/${photo.id}?source=search`}
                      aria-label={`${photo.pet_name}の${date}の思い出${photo.favorite ? "（お気に入り）" : ""}を詳しく見る`}
                      className="search-result-card ds-focus group"
                    >
                      <div className="search-result-media">
                        {url ? (
                          <Image
                            src={url}
                            alt=""
                            fill
                            sizes="120px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <span className="search-result-fallback">
                            写真を表示できません
                          </span>
                        )}
                        {photo.favorite ? (
                          <span
                            aria-hidden="true"
                            className="search-result-fav"
                          >
                            ♥
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            </section>
          ) : null}
          {hasMore && last ? (
            <Link
              className="app-button-secondary mx-auto mt-4 w-fit"
              href={paginationHref(
                base,
                { at: last.timeline_at, id: last.id },
                searchValues(state),
              )}
            >
              さらに見る
            </Link>
          ) : null}
          {cursor ? (
            <Link
              href={`${base}?${new URLSearchParams(searchValues(state))}`}
              className="app-button-ghost mx-auto mt-2 w-fit"
            >
              最初のページへ
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {sceneCards.length > 0 ? (
            <section
              aria-labelledby="search-scenes-heading"
              className="search-section"
            >
              <div className="search-section-head">
                <h2 id="search-scenes-heading" className="search-section-title">
                  シーンから探す
                </h2>
              </div>
              <ul className="search-scenes">
                {sceneCards.map((card) => (
                  <li key={`scene:${card.value}`} className="search-scene">
                    <Link
                      href={searchHref(base, state, {
                        kind: card.kind,
                        word: card.value,
                      })}
                      className="search-scene-card ds-focus"
                    >
                      <div className="search-scene-media">
                        {card.src ? (
                          <Image
                            src={card.src}
                            alt=""
                            fill
                            sizes="88px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <span className="search-scene-fallback" aria-hidden="true" />
                        )}
                      </div>
                      <p className="search-scene-label">{card.value}</p>
                      <p className="search-scene-count">
                        {card.count.toLocaleString()}枚
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {aiCards.length > 0 ? (
            <section
              aria-labelledby="search-ai-heading"
              className="search-section"
            >
              <div className="search-section-head">
                <h2 id="search-ai-heading" className="search-section-title">
                  AIが見つけたおすすめ
                  <span className="search-info" title="写真の内容から自動で見つけた候補です">
                    <CircleHelp strokeWidth={1.7} aria-hidden="true" />
                  </span>
                </h2>
              </div>
              <ul className="search-ai-rail">
                {aiCards.map((card) => (
                  <li key={`ai:${card.kind}:${card.value}`} className="search-ai">
                    <Link
                      href={searchHref(base, state, {
                        kind: card.kind,
                        word: card.value,
                      })}
                      className="search-ai-card ds-focus"
                    >
                      <div className="search-ai-media">
                        {card.src ? (
                          <Image
                            src={card.src}
                            alt=""
                            fill
                            sizes="200px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <span className="search-ai-fallback" aria-hidden="true" />
                        )}
                        <span className="search-ai-badge">
                          {card.value}
                        </span>
                      </div>
                      <div className="search-ai-footer">
                        <p className="search-ai-caption">
                          {recCaption(card.photo, card.value)}
                        </p>
                        <span className="search-ai-go" aria-hidden="true">
                          <ChevronRight strokeWidth={1.8} />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {recentPhotos.length > 0 ? (
            <section
              aria-labelledby="search-recent-heading"
              className="search-section"
            >
              <div className="search-section-head">
                <h2 id="search-recent-heading" className="search-section-title">
                  最近見た写真
                </h2>
                {activePetId ? (
                  <Link
                    href={`/pets/${activePetId}`}
                    className="search-section-more ds-focus"
                  >
                    すべて見る →
                  </Link>
                ) : null}
              </div>
              <ul className="search-recent">
                {recentPhotos.map((photo) => {
                  const url = images.signedUrlByPath.get(listImagePath(photo));
                  return (
                    <li key={photo.id}>
                      <Link
                        href={`/pets/${photo.pet_id}/photos/${photo.id}`}
                        className="search-recent-thumb ds-focus"
                        aria-label={`${photo.pet_name}の写真を見る`}
                      >
                        {url ? (
                          <Image
                            src={url}
                            alt=""
                            fill
                            sizes="64px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <span className="search-recent-fallback" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="search-empty-hint">
              まだ探せる写真がありません。写真を追加すると、ここに候補が並びます。
            </p>
          )}
        </>
      )}
    </main>
  );
}
