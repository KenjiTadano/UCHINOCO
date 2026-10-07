import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  Heart,
  Image as ImageIcon,
  Images,
  Plus,
} from "lucide-react";
import { PetSwitcher } from "@/app/(app)/_components/pet-switcher";
import { loadOwnerPetsForSwitcher } from "@/lib/owner-pets";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import type { SearchFacets } from "@/lib/search-state";
import { createClient } from "@/lib/supabase/server";
import { traceAlbumLoad } from "@/lib/album-load-trace";
import { AlbumListFilters } from "./_components/album-list-filters";
import { preparePassiveCandidate } from "@/lib/passive-album-candidate-server";
import { currentTokyoMonth, deriveMonthlyAlbumLifecycle, monthlyStateLabel, previousTokyoMonth } from "@/lib/album-monthly-lifecycle";
import { ANNUAL_ALBUM_VERSION, annualCandidateYear } from "@/lib/annual-album";
import { preparePassiveAnnualCandidate } from "@/lib/passive-annual-candidate-server";

const ICON = { size: 16, strokeWidth: 1.7, "aria-hidden": true as const };

type Props = {
  params: Promise<{ petId: string }>;
};

type AlbumRow = {
  id: string;
  title: string;
  status: string;
  period_from: string | null;
  period_to: string | null;
  cover_photo_id: string | null;
  created_at: string;
};

type PhotoRow = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  timeline_at?: string;
};

const MONTH_ABBR = [
  "JAN.",
  "FEB.",
  "MAR.",
  "APR.",
  "MAY.",
  "JUN.",
  "JUL.",
  "AUG.",
  "SEP.",
  "OCT.",
  "NOV.",
  "DEC.",
] as const;

const FILTERS = [
  "すべて",
  "お気に入り",
  "おでかけ",
  "日常",
  "成長記録",
  "家族",
  "季節",
] as const;

function tokyoParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function monthKeyFromIso(iso: string | null | undefined, fallback: string): string {
  const d = new Date(iso ?? fallback);
  return d.toLocaleDateString("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
}

export default async function PetAlbumPage({ params }: Props) {
  const { petId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id, avatar_url")
    .eq("id", petId)
    .maybeSingle();

  if (petError || !pet) notFound();
  const isOwner = pet.owner_user_id === user.id;

  const { year: nowY, month: nowM } = tokyoParts();
  const currentMonth = currentTokyoMonth();
  const previousMonth = previousTokyoMonth();
  const monthStart = `${nowY}-${String(nowM).padStart(2, "0")}-01T00:00:00+09:00`;
  const nextM = nowM === 12 ? 1 : nowM + 1;
  const nextY = nowM === 12 ? nowY + 1 : nowY;
  const monthEnd = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`;
  const createHref = isOwner ? `/pets/${pet.id}/album/new` : `/pets/${pet.id}`;

  const [
    ownerPetsResult,
    photoCountResult,
    favoriteCountResult,
    monthCountResult,
    monthPhotosResult,
    albumsResult,
    recentPhotosResult,
    favoritePhotosResult,
    facetResult,
  ] = await traceAlbumLoad("list.initial-queries", () => Promise.all([
    loadOwnerPetsForSwitcher(supabase, user.id),
    supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", pet.id),
    supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", pet.id)
      .eq("favorite", true),
    supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", pet.id)
      .gte("timeline_at", monthStart)
      .lt("timeline_at", monthEnd),
    supabase
      .from("photos")
      .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
      .eq("pet_id", pet.id)
      .gte("timeline_at", monthStart)
      .lt("timeline_at", monthEnd)
      .order("timeline_at", { ascending: false })
      .limit(3),
    supabase
      .from("albums")
      .select("id, title, status, period_from, period_to, cover_photo_id, created_at")
      .eq("pet_id", pet.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("photos")
      .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
      .eq("pet_id", pet.id)
      .order("timeline_at", { ascending: false })
      .limit(8),
    supabase
      .from("photos")
      .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
      .eq("pet_id", pet.id)
      .eq("favorite", true)
      .order("timeline_at", { ascending: false })
      .limit(1),
    supabase.rpc("get_search_facets", { p_pet_id: pet.id }),
  ]));

  const shelfMonthResults = await traceAlbumLoad("list.shelf-months", () =>
    Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const month = index + 1;
        const nextMonth = month + 1;
        const start = `${nowY}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`;
        const end = `${nowY}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`;
        return supabase
          .from("photos")
          .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at")
          .eq("pet_id", pet.id)
          .gte("timeline_at", start)
          .lt("timeline_at", end)
          .order("timeline_at", { ascending: false })
          .limit(1);
      }),
    ),
  );

  const albumList = (albumsResult.data ?? []) as AlbumRow[];
  const albumIds = albumList.map((a) => a.id);
  const activeDraftResult = albumIds.length
    ? await supabase
        .from("album_draft_versions")
        .select("album_id, status, generation_metadata")
        .in("album_id", albumIds)
        .eq("is_active", true)
        .in("status", ["ready", "editing"])
    : { data: [], error: null };
  const activeDraftAlbumIds = new Set((activeDraftResult.data ?? []).map((draft) => draft.album_id));
  const annualAlbumIds = new Set((activeDraftResult.data ?? []).filter((draft) => {
    const metadata = draft.generation_metadata as Record<string, unknown> | null;
    return metadata?.annual_candidate_version === ANNUAL_ALBUM_VERSION;
  }).map((draft) => draft.album_id));
  const candidateAlbum = albumList.find((album) => activeDraftAlbumIds.has(album.id) && monthKeyFromIso(album.period_from, album.created_at) === currentMonth.key);
  const passiveCandidate = isOwner && !candidateAlbum
    ? await preparePassiveCandidate({ supabase, userId: user.id, petId: pet.id, petName: pet.name, monthKey: currentMonth.key })
    : null;
  const previousMonthHasAlbum = albumList.some((album) => monthKeyFromIso(album.period_from, album.created_at) === previousMonth.key);
  const previousPassiveCandidate = isOwner && !previousMonthHasAlbum
    ? await preparePassiveCandidate({ supabase, userId: user.id, petId: pet.id, petName: pet.name, monthKey: previousMonth.key })
    : null;
  const visibleAnnualYear = annualCandidateYear();
  const existingAnnualForVisibleYear = visibleAnnualYear
    ? albumList.some((album) => annualAlbumIds.has(album.id) && monthKeyFromIso(album.period_from, album.created_at).startsWith(String(visibleAnnualYear)))
    : false;
  const annualCandidate = isOwner && visibleAnnualYear && !existingAnnualForVisibleYear
    ? await preparePassiveAnnualCandidate({ supabase, userId: user.id, petId: pet.id, petName: pet.name, year: visibleAnnualYear })
    : null;
  const [acceptedResult, finalizedResult, orderResult] = albumIds.length
    ? await Promise.all([
        supabase.from("album_analytics_events").select("album_id").in("album_id", albumIds).eq("event_type", "album_accepted"),
        supabase.from("album_print_snapshots").select("album_id").in("album_id", albumIds).not("finalized_at", "is", null),
        supabase.from("orders").select("album_id, status").in("album_id", albumIds).in("status", ["pending", "paid"]),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const acceptedAlbumIds = new Set((acceptedResult.data ?? []).map((row) => row.album_id));
  const finalizedAlbumIds = new Set((finalizedResult.data ?? []).map((row) => row.album_id));
  const orderedAlbumIds = new Set((orderResult.data ?? []).map((row) => row.album_id));
  const albumPhotoRows = albumIds.length
    ? (
        await supabase
          .from("album_photos")
          .select("album_id, photo_id, position")
          .in("album_id", albumIds)
          .order("position", { ascending: true })
      ).data ?? []
    : [];

  const photoCountByAlbum = new Map<string, number>();
  const firstPhotoByAlbum = new Map<string, string>();
  for (const row of albumPhotoRows) {
    photoCountByAlbum.set(
      row.album_id,
      (photoCountByAlbum.get(row.album_id) ?? 0) + 1,
    );
    if (!firstPhotoByAlbum.has(row.album_id)) {
      firstPhotoByAlbum.set(row.album_id, row.photo_id);
    }
  }

  const coverPhotoIds = Array.from(
    new Set(
      albumList
        .map((a) => a.cover_photo_id ?? firstPhotoByAlbum.get(a.id) ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const coverPhotosResult = coverPhotoIds.length
    ? await supabase
        .from("photos")
        .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at")
        .in("id", coverPhotoIds)
    : { data: [] as PhotoRow[] };

  const monthPhotos = (monthPhotosResult.data ?? []) as PhotoRow[];
  const recentPhotos = (recentPhotosResult.data ?? []) as PhotoRow[];
  const yearPhotos = shelfMonthResults.flatMap((result) => (result.data ?? []) as PhotoRow[]);
  const favoritePhotos = (favoritePhotosResult.data ?? []) as PhotoRow[];
  const coverPhotos = (coverPhotosResult.data ?? []) as PhotoRow[];

  const images = await traceAlbumLoad("list.image-urls", () => createListImageUrls(supabase, [
    ...monthPhotos,
    ...recentPhotos,
    ...yearPhotos,
    ...favoritePhotos,
    ...coverPhotos,
  ]));

  const urlOf = (photo: PhotoRow | null | undefined) =>
    photo ? images.signedUrlByPath.get(listImagePath(photo)) ?? null : null;

  const coverUrlByPhotoId = new Map<string, string>();
  for (const photo of coverPhotos) {
    const url = urlOf(photo);
    if (url) coverUrlByPhotoId.set(photo.id, url);
  }

  const candidateCoverId = candidateAlbum
    ? candidateAlbum.cover_photo_id ?? firstPhotoByAlbum.get(candidateAlbum.id) ?? null
    : null;
  const heroCoverUrl = (candidateCoverId ? coverUrlByPhotoId.get(candidateCoverId) : null) ?? urlOf(monthPhotos[0] ?? recentPhotos[0] ?? null);
  const photoByMonth = new Map<string, PhotoRow>();
  for (const photo of yearPhotos) {
    const key = monthKeyFromIso(photo.timeline_at, photo.created_at);
    if (!photoByMonth.has(key)) photoByMonth.set(key, photo);
  }

  // Design: JAN–AUG books + current-month add slot
  const shelfMonths = Array.from({ length: 8 }, (_, i) => {
    const month = i + 1;
    const key = `${nowY}-${String(month).padStart(2, "0")}`;
    const photo = photoByMonth.get(key);
    const album = albumList.find(
      (item) => monthKeyFromIso(item.period_from, item.created_at) === key,
    );
    return {
      key,
      abbr: MONTH_ABBR[month - 1],
      monthLabel: `${month}月`,
      yearLabel: String(nowY),
      src: urlOf(photo),
      href: album ? `/pets/${pet.id}/album/${album.id}` : createHref,
      isCurrent: false,
    };
  });

  const photoCount = photoCountResult.count ?? 0;
  const favoriteCount = favoriteCountResult.count ?? 0;
  const monthCount = monthCountResult.count ?? 0;
  const candidatePhotoCount = candidateAlbum ? photoCountByAlbum.get(candidateAlbum.id) ?? 0 : 0;
  const heroPhotoCount = candidateAlbum ? candidatePhotoCount : monthCount;
  const ownerPets = ownerPetsResult.pets;

  const facets =
    facetResult.error || !facetResult.data
      ? null
      : (facetResult.data as unknown as SearchFacets);

  type ListCard = {
    key: string;
    label: string;
    count: number;
    href: string;
    src: string | null;
    statusLabel?: string;
    filterKeys: string[];
    monthKey?: string;
  };

  const listCards: ListCard[] = [];
  if (annualCandidate) {
    listCards.push({
      key: `annual:${annualCandidate.fingerprint}`,
      label: `${annualCandidate.year} · YEAR IN REVIEW`,
      count: annualCandidate.selectedPhotoIds.length,
      href: `/pets/${pet.id}/album/year/${annualCandidate.year}`,
      src: null,
      statusLabel: "AIがまとめました · 未確認",
      filterKeys: ["すべて"],
      monthKey: `${annualCandidate.year}-99`,
    });
  }
  if (passiveCandidate) {
    listCards.push({
      key: `passive:${passiveCandidate.fingerprint}`,
      label: passiveCandidate.title,
      count: passiveCandidate.photoCount,
      href: `/pets/${pet.id}/album/candidate?month=${currentMonth.key}`,
      src: urlOf(monthPhotos[0] ?? null),
      statusLabel: "AIがまとめました · 未確認",
      filterKeys: ["すべて"],
      monthKey: currentMonth.key,
    });
  }
  if (previousPassiveCandidate) {
    listCards.push({
      key: `passive:${previousPassiveCandidate.fingerprint}`,
      label: previousPassiveCandidate.title,
      count: previousPassiveCandidate.photoCount,
      href: `/pets/${pet.id}/album/candidate?month=${previousMonth.key}`,
      src: null,
      statusLabel: "AIがまとめました · 未確認",
      filterKeys: ["すべて"],
      monthKey: previousMonth.key,
    });
  }
  if (!candidateAlbum && !passiveCandidate && monthCount > 0) {
    const lifecycle = deriveMonthlyAlbumLifecycle({ photoCount: monthCount });
    listCards.push({
      key: `collecting:${currentMonth.key}`,
      label: `${nowY}年${nowM}月`,
      count: monthCount,
      href: `/pets/${pet.id}/photos/new`,
      src: urlOf(monthPhotos[0] ?? null),
      statusLabel:
        lifecycle.remaining > 0
          ? `あと${lifecycle.remaining}枚`
          : "写真を整理しています",
      filterKeys: ["すべて"],
      monthKey: currentMonth.key,
    });
  }
  if (favoriteCount > 0) {
    listCards.push({
      key: "favorites",
      label: "お気に入り",
      count: favoriteCount,
      href: `/pets/${pet.id}/favorites`,
      src: urlOf(favoritePhotos[0] ?? null),
      filterKeys: ["すべて", "お気に入り"],
    });
  }
  for (const album of albumList) {
    const coverId =
      album.cover_photo_id ?? firstPhotoByAlbum.get(album.id) ?? null;
    const lifecycle = deriveMonthlyAlbumLifecycle({
      photoCount: photoCountByAlbum.get(album.id) ?? 0,
      hasDraft: activeDraftAlbumIds.has(album.id),
      accepted: acceptedAlbumIds.has(album.id) || album.status === "ready",
      ordered: orderedAlbumIds.has(album.id) || album.status === "ordered",
      finalized: finalizedAlbumIds.has(album.id),
    });
    listCards.push({
      key: `album:${album.id}`,
      label: annualAlbumIds.has(album.id) ? `${monthKeyFromIso(album.period_from, album.created_at).slice(0, 4)} · YEAR IN REVIEW` : album.title || "アルバム",
      count: photoCountByAlbum.get(album.id) ?? 0,
      href: activeDraftAlbumIds.has(album.id)
        ? `/pets/${pet.id}/album/${album.id}?view=complete`
        : `/pets/${pet.id}/album/${album.id}`,
      src: coverId ? coverUrlByPhotoId.get(coverId) ?? null : null,
      statusLabel: annualAlbumIds.has(album.id) ? `年間アルバム · ${monthlyStateLabel(lifecycle.state)}` : monthlyStateLabel(lifecycle.state),
      filterKeys: ["すべて"],
      monthKey: annualAlbumIds.has(album.id) ? `${monthKeyFromIso(album.period_from, album.created_at).slice(0, 4)}-98` : monthKeyFromIso(album.period_from, album.created_at),
    });
  }
  listCards.sort((left, right) => (right.monthKey ?? "0000-00").localeCompare(left.monthKey ?? "0000-00"));
  const facetCards = (facets?.words ?? [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .filter((w) =>
      /おでかけ|日常|成長|家族|季節|散歩|寝る|遊ぶ/.test(w.value),
    )
    .slice(0, 4);
  for (const word of facetCards) {
    if (listCards.length >= 5) break;
    const label =
      /おでかけ|outing/.test(word.value)
        ? "おでかけ"
        : /成長/.test(word.value)
          ? "成長記録"
          : /季節|桜|春|夏|秋|冬/.test(word.value)
            ? "季節の思い出"
            : /家族/.test(word.value)
              ? "家族"
              : /日常|室内|寝る/.test(word.value)
                ? "日常"
                : word.value;
    if (listCards.some((c) => c.label === label)) continue;
    listCards.push({
      key: `facet:${word.kind}:${word.value}`,
      label,
      count: word.count,
      href: `/pets/${pet.id}/search?kind=${encodeURIComponent(word.kind)}&word=${encodeURIComponent(word.value)}`,
      src: urlOf(recentPhotos[listCards.length % Math.max(recentPhotos.length, 1)] ?? null),
      filterKeys: ["すべて", label.replace("の思い出", "")],
    });
  }
  while (listCards.length < 5 && recentPhotos[listCards.length]) {
    const photo = recentPhotos[listCards.length];
    listCards.push({
      key: `photo:${photo.id}`,
      label: "日常",
      count: 1,
      href: `/pets/${pet.id}/photos/${photo.id}`,
      src: urlOf(photo),
      filterKeys: ["すべて", "日常"],
    });
  }

  return (
    <main className="album-page">
      <header className="album-header">
        <div className="min-w-0">
          <h1 className="album-title">アルバム</h1>
          <p className="album-subtitle">大切な思い出を、ずっと一緒に。</p>
        </div>
        {ownerPetsResult.error ? (
          <p role="alert" className="app-error text-[10px]">
            ペット情報を取得できませんでした。
          </p>
        ) : ownerPets.length > 0 ? (
          <PetSwitcher
            layout="header"
            pets={ownerPets}
            activePetId={pet.id}
            hrefForPet={(id) => `/pets/${id}/album`}
          />
        ) : null}
      </header>

      {photoCount === 0 ? (
        <section className="album-empty" aria-labelledby="album-empty-heading">
          <h2 id="album-empty-heading" className="album-empty-title">
            まだ思い出がありません
          </h2>
          <p className="album-empty-body">
            写真を追加すると、アルバムを作れるようになります。
          </p>
          <Link href={`/pets/${pet.id}/photos/new`} className="album-hero-cta ds-focus">
            写真を追加
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="album-hero-heading" className="album-hero">
            <Image
              src="/album/hero_front_facing_blank_cover.jpg"
              alt=""
              fill
              priority
              sizes="(max-width: 390px) calc(100vw - 24px), 366px"
              className="album-hero-plate"
            />
            {heroCoverUrl ? (
              <div className="album-hero-cover-slot">
                <Image
                  src={heroCoverUrl}
                  alt={`${pet.name}のフォトブック表紙`}
                  fill
                  sizes="120px"
                  unoptimized
                  className="object-cover"
                  priority
                />
              </div>
            ) : null}
            <div className="album-hero-copy">
              <p className="album-hero-brand">UCHINOCO</p>
              <h2 id="album-hero-heading" className="album-hero-title">
                {candidateAlbum ? `${pet.name}のアルバムができました` : passiveCandidate ? "今月のアルバム、できています" : "思い出をAIが一冊にまとめます"}
              </h2>
              <p className="album-hero-text">
                {candidateAlbum
                  ? `AIが${candidatePhotoCount.toLocaleString()}枚を選びました。確認して、そのまま楽しめます。`
                  : passiveCandidate
                    ? `AIが${passiveCandidate.photoCount.toLocaleString()}枚を整理しました。開くまでは正式Draftを作りません。`
                  : `今月は <em>${monthCount.toLocaleString()}枚</em> の写真が集まりました。`}
              </p>
              <ul className="album-hero-stats">
                <li>
                  <ImageIcon {...ICON} />
                  <span>{heroPhotoCount.toLocaleString()}枚{candidateAlbum ? "の写真" : "の今月の写真"}</span>
                </li>
                <li>
                  <Heart {...ICON} />
                  <span>お気に入り {favoriteCount.toLocaleString()}枚</span>
                </li>
              </ul>
              <Link href={candidateAlbum ? `/pets/${pet.id}/album/${candidateAlbum.id}?view=complete` : passiveCandidate ? `/pets/${pet.id}/album/candidate?month=${currentMonth.key}` : createHref} className="album-hero-cta ds-focus">
                <BookOpen {...ICON} />
                {candidateAlbum ? "AIアルバムを確認する" : passiveCandidate ? "アルバムを見る" : "AIにおまかせで作る"}
                <ArrowRight {...ICON} />
              </Link>
            </div>
            <span className="album-hero-badge">
              {candidateAlbum ? "AIの" : passiveCandidate ? "AIが" : "今月の"}
              <br />
              {candidateAlbum ? "初稿" : passiveCandidate ? "まとめました" : "おすすめ"}
            </span>
          </section>

          <section aria-labelledby="album-shelf-heading" className="album-section">
            <div className="album-section-head">
              <h2 id="album-shelf-heading" className="album-section-title">
                <span className="album-section-icon">
                  <BookOpen {...ICON} />
                </span>
                フォトブックコレクション
              </h2>
              <a href="#album-list-heading" className="album-section-more ds-focus">
                すべて見る →
              </a>
            </div>
            <div className="album-shelf-scene">
              <img
                src="/album/collection_shelf_band.jpg"
                alt=""
                className="album-shelf-plate"
              />
              <ul className="album-shelf-books">
                {shelfMonths.map((item) => (
                  <li key={item.key} className="album-shelf-col">
                    <Link
                      href={item.href}
                      className={`album-month-book ds-focus${item.src ? " has-photo" : ""}`}
                      aria-label={`${item.monthLabel}のフォトブック`}
                    >
                      {item.src ? (
                        <span className="album-month-photo">
                          <Image
                            src={item.src}
                            alt=""
                            fill
                            sizes="50px"
                            unoptimized
                            className="object-cover"
                          />
                        </span>
                      ) : null}
                      <img
                        src="/album/monthly_book_blank_cover.png"
                        alt=""
                        className="album-month-shell"
                      />
                      <span className="album-month-abbr">{item.abbr}</span>
                    </Link>
                    <p className="album-month-label">
                      <span>{item.monthLabel}</span>
                      <span>{item.yearLabel}</span>
                    </p>
                  </li>
                ))}
                <li className="album-shelf-col">
                  <Link
                    href={createHref}
                    className="album-month-slot ds-focus"
                    aria-label="今月の一冊を作る"
                  >
                    <span className="album-month-plus" aria-hidden="true">
                      <Plus size={14} strokeWidth={2.2} />
                    </span>
                    <span className="album-month-slot-text">今月の一冊</span>
                  </Link>
                  <p className="album-month-label is-current">
                    <span>{nowM}月</span>
                    <span>{nowY}</span>
                  </p>
                </li>
              </ul>
            </div>
          </section>

          <section aria-labelledby="album-list-heading" className="album-section">
            <div className="album-section-head">
              <h2 id="album-list-heading" className="album-section-title">
                <span className="album-section-icon">
                  <Images {...ICON} />
                </span>
                アルバム一覧
              </h2>
              <p className="album-sort-hint">
                <ArrowUpDown size={12} strokeWidth={1.7} aria-hidden="true" />
                撮影日が新しい順
              </p>
            </div>

            <AlbumListFilters filters={[...FILTERS]} cards={listCards} />
          </section>
        </>
      )}
    </main>
  );
}
