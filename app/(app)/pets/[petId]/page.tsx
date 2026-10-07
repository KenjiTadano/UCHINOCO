import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronDown, MapPin, MoreHorizontal, Search, Users } from "lucide-react";
import { memoryDayCopy } from "@/lib/memory-day-copy";
import { groupPhotosByTokyoDate, photoTimestamp, tokyoMonthKey } from "@/lib/photo-timeline";
import { getMemoryPhotoPage, nextPhotoCursor, paginationHref, parsePhotoCursor } from "@/lib/photo-pagination";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/_components/ui";
import { PetSwitcher } from "@/app/(app)/_components/pet-switcher";
import { loadOwnerPetsForSwitcher } from "@/lib/owner-pets";
import { ContentHashBackfill } from "./_components/content-hash-backfill";
import { MemoryDayGrid } from "./_components/memory-day-grid";
import { PhotoThumbnailBackfill } from "./_components/photo-thumbnail-backfill";

type PetDetailPageProps = {
  params: Promise<{ petId: string }>;
  searchParams: Promise<{ message?: string; before?: string; beforeId?: string }>;
};

const MONTH_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"] as const;

const WEEKDAY_JA = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function weekdayLabel(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  // Noon UTC avoids DST edge cases; Tokyo calendar day is what dateKey already is.
  const utc = Date.UTC(year, month - 1, day, 12, 0, 0);
  return WEEKDAY_JA[new Date(utc).getUTCDay()];
}

export default async function PetDetailPage({ params, searchParams }: PetDetailPageProps) {
  const [{ petId }, { message, before, beforeId }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error: petError } = await supabase.from("pets").select("id, owner_user_id, name, species, breed, birthday, avatar_url").eq("id", petId).maybeSingle();

  if (petError || !pet) {
    notFound();
  }

  const [{ photos, hasMore, error: photosError }, backfillCountResult, hashBackfillCountResult, ownerPetsResult] = await Promise.all([
    getMemoryPhotoPage(supabase, pet.id, 30, parsePhotoCursor(before, beforeId)),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("pet_id", pet.id),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("pet_id", pet.id).eq("uploader_user_id", user.id).is("content_hash", null).is("content_hash_backfilled_at", null),
    loadOwnerPetsForSwitcher(supabase, user.id),
  ]);

  const ownerPets = ownerPetsResult.pets;

  const [photoUrlsResult, analysesResult] = await Promise.all([
    createListImageUrls(supabase, photos),
    photos.length
      ? supabase
          .from("photo_ai_analyses")
          .select("photo_id, description, activity, scene")
          .in(
            "photo_id",
            photos.map((p) => p.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const signedUrlByPath = photoUrlsResult.signedUrlByPath;
  const analysisByPhotoId = new Map(
    (analysesResult.data ?? []).map((row) => [
      row.photo_id as string,
      {
        description: (row.description as string | null) ?? null,
        activity: (row.activity as string | null) ?? null,
        scene: (row.scene as string | null) ?? null,
      },
    ]),
  );

  const dayGroups = groupPhotosByTokyoDate(photos);
  const monthSections = (() => {
    const map = new Map<string, { monthKey: string; year: number; monthName: string; days: typeof dayGroups }>();
    for (const day of dayGroups) {
      const sample = photoTimestamp(day.photos[0]);
      const monthKey = tokyoMonthKey(sample);
      const { year, month } = parseDateKey(day.dateKey);
      let section = map.get(monthKey);
      if (!section) {
        section = {
          monthKey,
          year,
          monthName: MONTH_EN[month - 1],
          days: [],
        };
        map.set(monthKey, section);
      }
      section.days.push(day);
    }
    return Array.from(map.values());
  })();

  return (
    <main className="mem-page">
      {message ? (
        <p role="status" className="app-status">
          {message}
        </p>
      ) : null}

      <header className="mem-header">
        <div className="min-w-0">
          <h1 className="mem-title">思い出</h1>
          <p className="mem-subtitle">うちの子との、かけがえのない時間。</p>
        </div>
        <div className="mem-header-actions">
          <Link href={`/pets/${pet.id}/family`} aria-label="家族との共有" className="mem-icon-btn ds-focus">
            <Users size={17} strokeWidth={1.7} aria-hidden="true" />
          </Link>
          <Link href={`/pets/${pet.id}/search`} aria-label="写真を探す" className="mem-icon-btn ds-focus">
            <Search size={17} strokeWidth={1.7} aria-hidden="true" />
          </Link>
          <span className="mem-icon-btn" aria-hidden="true">
            <CalendarDays size={17} strokeWidth={1.7} />
          </span>
        </div>
      </header>

      <PetSwitcher
        pets={ownerPets}
        activePetId={pet.id}
        hrefForPet={(id) => `/pets/${id}`}
        trailing={
          <nav aria-label="表示切り替え" className="mem-segments">
            <Link href={`/pets/${pet.id}`} aria-current="page" className="mem-segment is-active ds-focus">
              すべて
            </Link>
            <Link href={`/pets/${pet.id}/favorites`} className="mem-segment ds-focus">
              お気に入り
            </Link>
          </nav>
        }
      />

      {ownerPetsResult.error ? (
        <p role="alert" className="app-error">
          ペット情報を取得できませんでした。
        </p>
      ) : null}

      {photosError || photoUrlsResult.error ? (
        <p role="alert" className="app-error">
          思い出写真を取得できませんでした。
        </p>
      ) : monthSections.length > 0 ? (
        <div className="mem-timeline">
          {monthSections.map((section, sectionIndex) => (
            <section key={section.monthKey} aria-labelledby={`month-${section.monthKey}`} className="mem-month">
              <header className="mem-month-header">
                <h2 id={`month-${section.monthKey}`} className="mem-month-title">
                  <span className="mem-month-year">{section.year}</span>
                  <span className="mem-month-name">
                    {section.monthName}
                    <ChevronDown className="mem-month-chevron" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </h2>
                {sectionIndex === 0 ? (
                  <p className="mem-month-deco" aria-hidden="true">
                    ずっと、いっしょに。
                  </p>
                ) : null}
              </header>

              <div className="mem-days">
                {section.days.map((group) => {
                  const { day } = parseDateKey(group.dateKey);
                  const dayAnalyses = group.photos.map(
                    (photo) =>
                      analysisByPhotoId.get(photo.id) ?? {
                        description: null,
                        activity: null,
                        scene: null,
                      },
                  );
                  const copy = memoryDayCopy(pet.name, group.photos, dayAnalyses);
                  const gridPhotos = group.photos.flatMap((photo, index) => {
                    const src = signedUrlByPath.get(listImagePath(photo));
                    if (!src) return [];
                    return [
                      {
                        id: photo.id,
                        src,
                        alt: `${pet.name}の思い出写真`,
                        href: `/pets/${photo.pet_id}/photos/${photo.id}`,
                        favorite: photo.favorite,
                        overlay: index === 0 ? copy.overlay : null,
                      },
                    ];
                  });
                  const firstHref = gridPhotos[0]?.href;

                  return (
                    <article key={group.dateKey} className="mem-day" aria-labelledby={`date-${group.dateKey}`}>
                      <div className="mem-day-date">
                        <p id={`date-${group.dateKey}`} className="mem-day-num">
                          {day}
                        </p>
                        <p className="mem-day-weekday">{weekdayLabel(group.dateKey)}</p>
                      </div>
                      <div className="mem-day-rule" aria-hidden="true" />

                      <div className="mem-day-body">
                        <div className="mem-day-heading">
                          <h3 className="mem-day-title">{copy.title}</h3>
                          {firstHref ? (
                            <Link href={firstHref} aria-label="この日の詳細" className="mem-more ds-focus">
                              <MoreHorizontal size={15} strokeWidth={1.8} aria-hidden="true" />
                            </Link>
                          ) : null}
                        </div>
                        {copy.body ? <p className="mem-day-text">{copy.body}</p> : null}
                        {copy.place ? (
                          <p className="mem-day-place">
                            <MapPin size={10} fill="currentColor" stroke="none" aria-hidden="true" />
                            {copy.place}
                          </p>
                        ) : null}
                      </div>
                      {gridPhotos.length > 0 ? (
                        <div className="mem-day-media">
                          <MemoryDayGrid photos={gridPhotos} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {hasMore ? (
            <Link className="mem-more-link ds-focus" href={paginationHref(`/pets/${pet.id}`, nextPhotoCursor(photos))}>
              さらに見る
            </Link>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="まだ思い出がありません"
          action={
            <Link className="app-button-primary" href={`/pets/${pet.id}/photos/new`}>
              最初の写真を追加する
            </Link>
          }
        />
      )}

      <PhotoThumbnailBackfill petId={pet.id} initialPendingCount={backfillCountResult.error ? null : (backfillCountResult.count ?? 0)} />
      {!hashBackfillCountResult.error ? <ContentHashBackfill petId={pet.id} initialPendingCount={hashBackfillCountResult.count ?? 0} /> : null}
    </main>
  );
}
