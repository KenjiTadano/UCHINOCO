import Image from "next/image";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Heart,
  ImagePlus,
  Images,
  Library,
  MoreHorizontal,
  PawPrint,
  Search,
  Users,
} from "lucide-react";
import { logout } from "../../(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { EmptyState } from "@/app/_components/ui";
import { findMemoryCandidate } from "@/lib/home-memory";

type HomePageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

type DashboardPhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
  caption?: string | null;
};

const DASHBOARD_PHOTO_LIMIT = 12;
const SEASON_DEFS = [
  { key: "spring", label: "春", range: "3月 - 5月", months: [3, 4, 5] },
  { key: "summer", label: "夏", range: "6月 - 8月", months: [6, 7, 8] },
  { key: "autumn", label: "秋", range: "9月 - 11月", months: [9, 10, 11] },
  { key: "winter", label: "冬", range: "12月 - 2月", months: [12, 1, 2] },
] as const;

function toSignedUrlMap(
  items: Array<{ path?: string | null; signedUrl?: string | null; error?: string | null }>,
) {
  return new Map(
    items
      .filter((item) => item.path && item.signedUrl && !item.error)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
}

function formatJaDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })
    .format(d)
    .replace(/(\d+日)\s*[（(]/, "$1 (")
    .replace(/[）)]$/, ")");
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${m}月${day}日`;
}

function photoMonth(photo: DashboardPhoto) {
  const iso = photo.taken_at ?? photo.created_at;
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "numeric" }).format(
      new Date(iso),
    ),
  );
}

function photoDayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function MoreIcon() {
  return (
    <MoreHorizontal
      aria-hidden="true"
      size={13}
      strokeWidth={2.4}
      className="mb-[3px] shrink-0 text-white/90"
    />
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { error: actionError, message: actionMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const petsResult = await supabase
    .from("pets")
    .select("id, name, species, breed, gender, birthday, adoption_date, avatar_url, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const pets = petsResult.data ?? [];
  const primaryPet = pets[0] ?? null;
  const emptyPhotoResult = { data: [] as DashboardPhoto[], error: null };

  const [recentResult, favoriteResult] =
    pets.length > 0
      ? await Promise.all([
          (supabase as unknown as SupabaseClient).rpc("get_dashboard_photos", {
            p_favorite_only: false,
            p_limit: DASHBOARD_PHOTO_LIMIT,
          }),
          (supabase as unknown as SupabaseClient).rpc("get_dashboard_photos", {
            p_favorite_only: true,
            p_limit: DASHBOARD_PHOTO_LIMIT,
          }),
        ])
      : [emptyPhotoResult, emptyPhotoResult];

  const recentPhotos = (recentResult.data ?? []) as DashboardPhoto[];
  const favoritePhotos = (favoriteResult.data ?? []) as DashboardPhoto[];
  const avatarPaths = Array.from(
    new Set(pets.flatMap((pet) => (pet.avatar_url ? [pet.avatar_url] : []))),
  );
  const resurfacingResult = await findMemoryCandidate(
    supabase,
    pets.map((pet) => pet.id),
  );
  const heroPhoto = resurfacingResult.photo;

  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(nowParts.find((p) => p.type === "year")?.value);
  const month = Number(nowParts.find((p) => p.type === "month")?.value);
  const monthLabel = `${year}年${month}月`;

  let monthPhotoCount = 0;
  let monthDayCount = 0;
  let monthFavoriteCount = 0;
  let daysTogetherCount = 0;

  if (pets.length > 0) {
    const { data: monthPhotos } = await supabase
      .from("photos")
      .select("id, taken_at, created_at, favorite")
      .in(
        "pet_id",
        pets.map((p) => p.id),
      )
      .order("created_at", { ascending: false })
      .limit(800);

    const inMonth = (monthPhotos ?? []).filter((row) => {
      const iso = row.taken_at ?? row.created_at;
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
      }).formatToParts(new Date(iso));
      const y = Number(parts.find((p) => p.type === "year")?.value);
      const m = Number(parts.find((p) => p.type === "month")?.value);
      return y === year && m === month;
    });
    monthPhotoCount = inMonth.length;
    monthFavoriteCount = inMonth.filter((r) => r.favorite).length;
    const days = new Set(inMonth.map((r) => photoDayKey(r.taken_at ?? r.created_at)));
    monthDayCount = days.size;
    // 一緒に過ごした日: 専用トラッキングなし → 撮影日数と同じ実データのみ表示
    daysTogetherCount = monthDayCount;
  }

  // One photo per season when available (from recent set)
  const seasonCards = SEASON_DEFS.map((season) => {
    const photo = recentPhotos.find((p) =>
      (season.months as readonly number[]).includes(photoMonth(p)),
    );
    return { season, photo: photo ?? null };
  }).filter((card) => card.photo);

  const [avatarUrlsResult, photoUrlsResult] = await Promise.all([
    avatarPaths.length
      ? supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
    createListImageUrls(supabase, [
      ...recentPhotos,
      ...favoritePhotos,
      ...(heroPhoto ? [heroPhoto] : []),
      ...seasonCards.map((s) => s.photo!).filter(Boolean),
    ]),
  ]);
  const avatarUrlByPath = toSignedUrlMap(avatarUrlsResult.data ?? []);
  const photoUrlByPath = photoUrlsResult.signedUrlByPath;
  const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const photosFailed = Boolean(
    recentResult.error || favoriteResult.error || photoUrlsResult.error,
  );

  const primaryAvatar =
    primaryPet?.avatar_url && avatarUrlByPath.has(primaryPet.avatar_url)
      ? avatarUrlByPath.get(primaryPet.avatar_url)
      : null;
  const heroSrc = heroPhoto ? photoUrlByPath.get(listImagePath(heroPhoto)) : null;
  const heroHref = heroPhoto
    ? `/pets/${heroPhoto.pet_id}/photos/${heroPhoto.id}`
    : primaryPet
      ? `/pets/${primaryPet.id}`
      : "/pets/new";
  const addPhotoHref = primaryPet ? `/pets/${primaryPet.id}/photos/new` : "/photos/new";
  const memoriesHref = primaryPet ? `/pets/${primaryPet.id}` : "/memories";

  return (
    <main className="home-page">
      <header className="flex items-center justify-between gap-3 px-0.5">
        <div>
          <p className="home-brand">UCHINOCO</p>
          <p className="home-brand-sub">うちの子、ずっとそばに。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="home-bell" aria-hidden="true">
            <Bell size={19} strokeWidth={1.7} />
            <span className="home-bell-dot" />
          </span>
          <details className="relative">
            <summary className="ds-focus flex cursor-pointer list-none items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 [&::-webkit-details-marker]:hidden">
              {primaryAvatar ? (
                <Image
                  src={primaryAvatar}
                  alt={primaryPet ? `${primaryPet.name}のアイコン` : "ペット"}
                  width={34}
                  height={34}
                  className="size-[34px] rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex size-[34px] items-center justify-center rounded-full bg-surface-warm text-sm text-muted">
                  {primaryPet ? primaryPet.name.slice(0, 1) : "＋"}
                </span>
              )}
              <span className="max-w-[4.5rem] truncate text-[13px] font-medium">
                {primaryPet?.name ?? "登録"}
              </span>
              <ChevronDown aria-hidden="true" size={14} strokeWidth={1.8} className="text-muted" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 min-w-[10rem] rounded-xl border border-border bg-surface p-2 shadow-sm">
              {pets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets/${pet.id}`}
                  className="ds-focus block rounded-lg px-3 py-2 text-sm hover:bg-surface-warm"
                >
                  {pet.name}
                </Link>
              ))}
              <Link
                href="/pets/new"
                className="ds-focus block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-warm"
              >
                うちの子を追加
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="ds-focus w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-warm"
                >
                  ログアウト
                </button>
              </form>
            </div>
          </details>
        </div>
      </header>

      {actionError ? (
        <p role="alert" className="app-error">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p role="status" className="app-status">
          {actionMessage}
        </p>
      ) : null}
      {petsResult.error ? (
        <p role="alert" className="app-error">
          ペット情報を取得できませんでした。
        </p>
      ) : null}

      {heroSrc && heroPhoto ? (
        <section aria-labelledby="hero-heading" className="home-hero">
          <Image
            src={heroSrc}
            alt={`${petNameById.get(heroPhoto.pet_id) ?? "うちの子"}の思い出`}
            fill
            className="object-cover"
            sizes="390px"
            priority
            unoptimized
          />
          <div className="home-hero-scrim" aria-hidden="true" />
          <div className="relative z-10 flex h-full flex-col justify-between p-4">
            <div className="relative">
              <h2 id="hero-heading" className="home-hero-title">
                {resurfacingResult.label ?? "思い出"}
              </h2>
              <p className="home-hero-date">
                {formatJaDate(heroPhoto.taken_at ?? heroPhoto.created_at)}
              </p>
              <p className="home-hero-hand">
                {heroPhoto.caption?.trim() || "あの日も\nこんなにいい笑顔\nだったね。"}
              </p>
              <p className="home-hero-deco">
                ずっと、
                <br />
                いっしょに。
              </p>
            </div>
            <div className="flex items-end justify-between gap-2">
              <Link href={heroHref} className="home-hero-cta">
                この日の思い出を見る
                <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
              </Link>
            </div>
          </div>
        </section>
      ) : !pets.length ? (
        <EmptyState
          title="まだペットが登録されていません"
          action={
            <Link className="app-button-primary" href="/pets/new">
              うちの子を登録する
            </Link>
          }
        />
      ) : (
        <section className="rounded-[16px] border border-dashed border-border bg-surface-warm/60 px-4 py-8 text-center">
          <p className="font-serif text-[18px] text-foreground">思い出を集めましょう</p>
          <p className="mt-2 text-[12px] text-muted">写真を追加すると、ここに再会できます。</p>
          <Link href={addPhotoHref} className="app-button-primary mt-4 inline-flex">
            写真を追加
          </Link>
        </section>
      )}

      {pets.length > 0 ? (
        <nav aria-label="クイックアクション" className="home-quick">
          <Link href={addPhotoHref} className="home-quick-item">
            <span className="home-quick-icon" aria-hidden="true">
              <ImagePlus size={20} strokeWidth={1.7} />
            </span>
            <span>写真を追加</span>
          </Link>
          <Link href="/search" className="home-quick-item">
            <span className="home-quick-icon" aria-hidden="true">
              <Search size={20} strokeWidth={1.7} />
            </span>
            <span>写真を探す</span>
          </Link>
          <Link href="/album" className="home-quick-item">
            <span className="home-quick-icon" aria-hidden="true">
              <BookOpen size={20} strokeWidth={1.7} />
            </span>
            <span>アルバム</span>
          </Link>
          <span className="home-quick-item is-soon">
            <span className="home-quick-icon" aria-hidden="true">
              <Users size={20} strokeWidth={1.7} />
            </span>
            <span>家族と共有</span>
            <span className="home-soon">近日公開</span>
          </span>
          <span className="home-quick-item is-soon">
            <span className="home-quick-icon" aria-hidden="true">
              <Library size={20} strokeWidth={1.7} />
            </span>
            <span>フォトブック</span>
            <span className="home-soon">近日公開</span>
          </span>
        </nav>
      ) : null}

      {pets.length > 0 ? (
        <section aria-labelledby="recent-heading" className="home-section">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="recent-heading" className="home-section-title">
              最近の思い出
            </h2>
            <Link href={memoriesHref} className="home-section-link">
              すべて見る →
            </Link>
          </div>
          {photosFailed ? (
            <p role="alert" className="app-error">
              思い出写真を取得できませんでした。
            </p>
          ) : recentPhotos.length ? (
            <ul className="home-hscroll">
              {recentPhotos.map((photo) => {
                const src = photoUrlByPath.get(listImagePath(photo));
                if (!src) return null;
                const title =
                  photo.caption?.trim() ||
                  `${petNameById.get(photo.pet_id) ?? "うちの子"}の思い出`;
                return (
                  <li key={photo.id} className="home-mem-card">
                    <Link
                      href={`/pets/${photo.pet_id}/photos/${photo.id}`}
                      className="ds-focus relative block size-full overflow-hidden rounded-[12px]"
                    >
                      <Image src={src} alt={title} fill className="object-cover" sizes="88px" unoptimized />
                      <span className="home-mem-grad" aria-hidden="true" />
                      <span className="home-mem-caption">
                        <span className="home-mem-caption-text">
                          <span className="home-mem-date">
                            {formatShortDate(photo.taken_at ?? photo.created_at)}
                          </span>
                          <span className="home-mem-title">{title}</span>
                        </span>
                        <MoreIcon />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="まだ思い出がありません"
              action={
                <Link className="app-button-primary" href={addPhotoHref}>
                  写真を追加
                </Link>
              }
            />
          )}
        </section>
      ) : null}

      {pets.length > 0 && !photosFailed && seasonCards.length > 0 ? (
        <section aria-labelledby="season-heading" className="home-section">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="season-heading" className="home-section-title">
              この頃の思い出
            </h2>
            <Link href={memoriesHref} className="home-section-link">
              すべて見る →
            </Link>
          </div>
          <ul className="home-hscroll">
            {seasonCards.map(({ season, photo }) => {
              if (!photo) return null;
              const src = photoUrlByPath.get(listImagePath(photo));
              if (!src) return null;
              return (
                <li key={season.key} className="home-mem-card">
                  <Link
                    href={`/pets/${photo.pet_id}/photos/${photo.id}`}
                    className="ds-focus relative block size-full overflow-hidden rounded-[12px]"
                  >
                    <Image
                      src={src}
                      alt={`${season.label}の思い出`}
                      fill
                      className="object-cover"
                      sizes="88px"
                      unoptimized
                    />
                    <span className="home-mem-grad" aria-hidden="true" />
                    <span className="home-mem-caption">
                      <span className="home-mem-caption-text">
                        <span className="home-mem-date">{season.label}</span>
                        <span className="home-mem-title">{season.range}</span>
                      </span>
                      <MoreIcon />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {pets.length > 0 ? (
        <section aria-labelledby="month-heading" className="home-section">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="month-heading" className="home-section-title">
              今月の記録
            </h2>
            <p className="text-[11px] text-muted" aria-label={monthLabel}>
              <span aria-hidden="true">&lt; </span>
              {monthLabel}
              <span aria-hidden="true"> &gt;</span>
            </p>
          </div>
          <div className="home-stats">
            <div className="home-stat">
              <span className="home-stat-icon" aria-hidden="true">
                <Images size={16} strokeWidth={1.7} />
              </span>
              <span className="home-stat-label">写真の追加</span>
              <span className="home-stat-value">
                <span className="home-stat-num">{monthPhotoCount}</span>
                <span className="home-stat-unit">枚</span>
              </span>
            </div>
            <div className="home-stat">
              <span className="home-stat-icon" aria-hidden="true">
                <CalendarDays size={16} strokeWidth={1.7} />
              </span>
              <span className="home-stat-label">撮影日数</span>
              <span className="home-stat-value">
                <span className="home-stat-num">{monthDayCount}</span>
                <span className="home-stat-unit">日</span>
              </span>
            </div>
            <div className="home-stat">
              <span className="home-stat-icon" aria-hidden="true">
                <PawPrint size={16} strokeWidth={1.7} fill="currentColor" />
              </span>
              <span className="home-stat-label">一緒に過ごした日</span>
              <span className="home-stat-value">
                <span className="home-stat-num">{daysTogetherCount}</span>
                <span className="home-stat-unit">日</span>
              </span>
            </div>
            <div className="home-stat">
              <span className="home-stat-icon" aria-hidden="true">
                <Heart size={16} strokeWidth={1.7} fill="currentColor" />
              </span>
              <span className="home-stat-label">お気に入り</span>
              <span className="home-stat-value">
                <span className="home-stat-num">{monthFavoriteCount}</span>
                <span className="home-stat-unit">枚</span>
              </span>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
