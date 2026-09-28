import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, CircleHelp } from "lucide-react";
import { PetSwitcher } from "@/app/(app)/_components/pet-switcher";
import { EmptyState } from "@/app/_components/ui";
import { loadOwnerPetsForSwitcher } from "@/lib/owner-pets";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { paginationHref } from "@/lib/photo-pagination";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import {
  parseSearchState,
  SEARCH_PAGE_SIZE,
  searchDateBounds,
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
  const { state, cursor, error: validationError } = parseSearchState(
    params,
    contextPetId,
  );
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

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
    : searchDateBounds(state);

  const isFiltered = Boolean(
    state.q ||
      state.word ||
      state.favorite ||
      state.from ||
      state.to ||
      (!contextPetId && state.pet),
  );

  const [ownerPetsResult, facetResult, photoResult] = await Promise.all([
    loadOwnerPetsForSwitcher(supabase, user.id),
    supabase.rpc("get_search_facets", {
      p_pet_id: state.pet || undefined,
    }),
    validationError
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("search_photos_page", {
          p_pet_id: state.pet || undefined,
          p_query: state.q || undefined,
          p_kind: state.kind || undefined,
          p_value: state.word || undefined,
          p_favorite_only: state.favorite,
          p_from: dates.from ?? undefined,
          p_to: dates.to ?? undefined,
          p_limit: isFiltered ? SEARCH_PAGE_SIZE : 8,
          p_cursor_at: cursor?.at,
          p_cursor_id: cursor?.id,
        }),
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
  ]);

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
      />

      {validationError ? (
        <p role="alert" className="app-error">
          {validationError}
        </p>
      ) : photoResult.error ? (
        <p role="alert" className="app-error">
          思い出を読み込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : isFiltered ? (
        <section
          aria-labelledby="search-results-heading"
          className="search-results"
        >
          <div className="search-section-head">
            <h2 id="search-results-heading" className="search-section-title">
              見つかった思い出
            </h2>
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-[11px] text-muted"
            >
              {(page?.total ?? 0).toLocaleString()}枚
            </p>
          </div>
          {images.error ? (
            <p className="mb-2 text-[11px] text-muted">
              一部の写真を表示できませんでした。
            </p>
          ) : null}
          {!resultPhotos.length ? (
            <EmptyState
              title="この条件の思い出はまだありません"
              description="言葉を解除するか、別の条件で探してみてください。"
              action={
                <Link href={base} className="app-button-ghost">
                  条件をクリア
                </Link>
              }
            />
          ) : (
            <ul className="search-result-grid">
              {resultPhotos.map((photo) => {
                const url = images.signedUrlByPath.get(listImagePath(photo));
                const date = formatTokyoDateTime(photoTimestamp(photo));
                return (
                  <li key={photo.id} className="min-w-0">
                    <Link
                      href={`/pets/${photo.pet_id}/photos/${photo.id}`}
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
          )}
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
        </section>
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
