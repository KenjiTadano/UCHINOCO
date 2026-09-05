import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";

type PetSearchPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 50;
const ANALYSIS_SEARCH_FIELDS = [
  "description",
  "activity",
  "scene",
  "emotion",
] as const;

type SearchPhoto = {
  id: string;
  storage_path: string;
  taken_at: string | null;
  created_at: string;
  caption: string | null;
  favorite: boolean;
};

type SearchAnalysis = {
  photo_id: string;
  description: string | null;
  tags: string[];
};

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export default async function PetSearchPage({
  params,
  searchParams,
}: PetSearchPageProps) {
  const [{ petId }, queryParams] = await Promise.all([params, searchParams]);
  const rawQuery = Array.isArray(queryParams.q)
    ? (queryParams.q[0] ?? "")
    : (queryParams.q ?? "");
  const query = rawQuery.trim();
  const queryIsTooLong = query.length > MAX_QUERY_LENGTH;
  const shouldSearch = query.length > 0 && !queryIsTooLong;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (petError || !pet || pet.owner_user_id !== user.id) {
    notFound();
  }

  let results: SearchPhoto[] = [];
  let analysisByPhotoId = new Map<string, SearchAnalysis>();
  let signedUrlByPath = new Map<string, string>();
  let searchFailed = false;

  if (shouldSearch) {
    const { data: petPhotoIds, error: photoIdsError } = await supabase
      .from("photos")
      .select("id")
      .eq("pet_id", pet.id);

    if (photoIdsError) {
      searchFailed = true;
    } else if (petPhotoIds && petPhotoIds.length > 0) {
      const ownedPhotoIds = petPhotoIds.map((photo) => photo.id);
      const likePattern = `%${escapeLikePattern(query)}%`;
      const [captionResult, tagsResult, ...textResults] = await Promise.all([
        supabase
          .from("photos")
          .select("id")
          .eq("pet_id", pet.id)
          .ilike("caption", likePattern),
        supabase
          .from("photo_ai_analyses")
          .select("photo_id, description, tags")
          .eq("status", "completed")
          .in("photo_id", ownedPhotoIds)
          .contains("tags", [query]),
        ...ANALYSIS_SEARCH_FIELDS.map((field) =>
          supabase
            .from("photo_ai_analyses")
            .select("photo_id, description, tags")
            .eq("status", "completed")
            .in("photo_id", ownedPhotoIds)
            .ilike(field, likePattern),
        ),
      ]);
      const analysisResults = [tagsResult, ...textResults];

      if (
        captionResult.error ||
        analysisResults.some((result) => result.error)
      ) {
        searchFailed = true;
      } else {
        const matchedPhotoIds = new Set(
          (captionResult.data ?? []).map((photo) => photo.id),
        );
        for (const result of analysisResults) {
          for (const analysis of result.data ?? []) {
            matchedPhotoIds.add(analysis.photo_id);
          }
        }

        if (matchedPhotoIds.size > 0) {
          const { data: matchedPhotos, error: matchedPhotosError } =
            await supabase
              .from("photos")
              .select(
                "id, storage_path, taken_at, created_at, caption, favorite",
              )
              .eq("pet_id", pet.id)
              .in("id", Array.from(matchedPhotoIds));

          if (matchedPhotosError) {
            searchFailed = true;
          } else {
            results = (matchedPhotos ?? [])
              .sort(
                (left, right) =>
                  new Date(photoTimestamp(right)).getTime() -
                  new Date(photoTimestamp(left)).getTime(),
              )
              .slice(0, MAX_RESULTS);

            const resultPhotoIds = results.map((photo) => photo.id);
            const [analysesResult, signedUrlsResult] = await Promise.all([
              resultPhotoIds.length > 0
                ? supabase
                    .from("photo_ai_analyses")
                    .select("photo_id, description, tags")
                    .eq("status", "completed")
                    .in("photo_id", resultPhotoIds)
                : Promise.resolve({ data: [], error: null }),
              results.length > 0
                ? supabase.storage
                    .from("pet-photos")
                    .createSignedUrls(
                      results.map((photo) => photo.storage_path),
                      3600,
                    )
                : Promise.resolve({ data: [], error: null }),
            ]);

            if (analysesResult.error || signedUrlsResult.error) {
              searchFailed = true;
              results = [];
            } else {
              analysisByPhotoId = new Map(
                (analysesResult.data ?? []).map((analysis) => [
                  analysis.photo_id,
                  analysis,
                ]),
              );
              signedUrlByPath = new Map(
                (signedUrlsResult.data ?? [])
                  .filter(
                    (item) => item.path && item.signedUrl && !item.error,
                  )
                  .map((item) => [
                    item.path as string,
                    item.signedUrl as string,
                  ]),
              );
            }
          }
        }
      }
    }
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>
        {pet.name}の思い出へ戻る
      </Link>

      <header>
        <p className="app-eyebrow">{pet.name}</p>
        <h1 className="app-title">思い出を検索</h1>
      </header>

      <form method="get" className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="memory-search">
          思い出のキーワード
        </label>
        <input
          id="memory-search"
          name="q"
          type="search"
          defaultValue={rawQuery}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="公園、散歩、楽しそう…"
          className="app-input min-w-0 flex-1"
        />
        <button
          type="submit"
          className="app-button-primary shrink-0"
        >
          検索
        </button>
      </form>

      {queryIsTooLong ? (
        <p role="alert" className="app-error">
          キーワードは100文字以内で入力してください。
        </p>
      ) : searchFailed ? (
        <p role="alert" className="app-error">
          思い出を検索できませんでした。時間をおいて再度お試しください。
        </p>
      ) : !shouldSearch ? (
        <p className="app-empty">
          キーワードを入力して思い出を検索できます。
        </p>
      ) : results.length === 0 ? (
        <p className="app-empty">
          該当する思い出が見つかりませんでした。
        </p>
      ) : (
        <section aria-labelledby="search-results-heading">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="search-results-heading" className="text-lg font-semibold">
              検索結果
            </h2>
            <p className="text-sm text-muted">{results.length}件</p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {results.map((photo) => {
              const analysis = analysisByPhotoId.get(photo.id);
              const signedUrl = signedUrlByPath.get(photo.storage_path);

              return (
                <li key={photo.id}>
                  <Link
                    href={`/pets/${pet.id}/photos/${photo.id}`}
                    className="app-card block overflow-hidden p-0 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <div className="relative aspect-square bg-primary-soft">
                      {signedUrl ? (
                        <>
                          <Image
                            className="object-cover"
                            src={signedUrl}
                            alt={`${pet.name}の検索結果の思い出写真`}
                            fill
                            sizes="(max-width: 640px) 100vw, 288px"
                            unoptimized
                          />
                          {photo.favorite ? (
                            <span
                              className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-sm text-favorite shadow-sm"
                              aria-label="お気に入り"
                            >
                              ★
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <div className="flex size-full items-center justify-center text-sm text-muted">
                          表示できません
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2 p-3 text-sm">
                      <time className="text-muted">
                        {formatTokyoDateTime(photoTimestamp(photo))}
                      </time>
                      {photo.caption ? (
                        <p className="line-clamp-2 whitespace-pre-wrap break-words">
                          {photo.caption}
                        </p>
                      ) : null}
                      {analysis?.description ? (
                        <p className="line-clamp-3 text-muted">
                          {analysis.description}
                        </p>
                      ) : null}
                      {analysis && analysis.tags.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label="AIタグ">
                          {analysis.tags.map((tag) => (
                            <li
                              key={tag}
                              className="app-tag"
                            >
                              {tag}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
