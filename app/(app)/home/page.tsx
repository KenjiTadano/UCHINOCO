import Image from "next/image";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, ChevronDown, ImagePlus, PawPrint } from "lucide-react";
import { logout } from "../../(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { EmptyState } from "@/app/_components/ui";
import { ALBUM_CANDIDATES_CONFIG } from "@/lib/album-candidates/config";
import {
  selectUchinocoNowHero,
  tokyoDateParts,
  tokyoRange,
  type UchinocoNowPhoto,
} from "@/lib/uchinoco-now";
import { loadPhotosInRange, selectStoredTodayBestShot } from "@/lib/uchinoco-now-data";
import { preparePassiveCandidate } from "@/lib/passive-album-candidate-server";
import { currentTokyoMonth, periodMatchesMonth, previousTokyoMonth } from "@/lib/album-monthly-lifecycle";
import { annualCandidateYear } from "@/lib/annual-album";
import { preparePassiveAnnualCandidate } from "@/lib/passive-annual-candidate-server";
import { loadAnniversaryMemory } from "@/lib/anniversary-memories";

type HomePageProps = {
  searchParams: Promise<{ error?: string; message?: string; pet?: string }>;
};

type Pet = {
  id: string;
  owner_user_id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birthday: string;
  adoption_date: string | null;
  avatar_url: string | null;
  created_at: string;
};

type AlbumRow = {
  id: string;
  pet_id: string;
  title: string;
  status: string;
  updated_at: string;
  period_from: string | null;
  period_to: string | null;
};

const RECENT_LIMIT = 6;

function toSignedUrlMap(
  items: Array<{ path?: string | null; signedUrl?: string | null; error?: string | null }>,
) {
  return new Map(
    items
      .filter((item) => item.path && item.signedUrl && !item.error)
      .map((item) => [item.path as string, item.signedUrl as string]),
  );
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

function speciesLabel(species: string) {
  return species === "dog" ? "犬" : species === "cat" ? "猫" : species;
}

function genderLabel(gender: string | null) {
  if (gender === "male") return "男の子";
  if (gender === "female") return "女の子";
  if (gender === "unknown") return "不明";
  return null;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const petsResult = await supabase
    .from("pets")
    .select("id, owner_user_id, name, species, breed, gender, birthday, adoption_date, avatar_url, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const pets = (petsResult.data ?? []) as Pet[];

  const requestedPet = params.pet;
  const selectedPet =
    requestedPet === "all"
      ? null
      : pets.find((pet) => pet.id === requestedPet) ?? pets[0] ?? null;
  const selectedPetIds = selectedPet ? [selectedPet.id] : pets.map((pet) => pet.id);
  const primaryPet = selectedPet ?? pets[0] ?? null;
  const selectedPetIsOwner = Boolean(selectedPet && selectedPet.owner_user_id === user.id);
  const addPhotoHref = primaryPet ? `/pets/${primaryPet.id}/photos/new` : "/photos/new";
  const memoriesHref = selectedPet ? `/pets/${selectedPet.id}` : "/memories";
  const albumHref = selectedPet ? `/pets/${selectedPet.id}/album` : "/album";

  const emptyPhotoResult = { data: [] as UchinocoNowPhoto[], error: null };
  const recentResult = pets.length
    ? selectedPet
      ? await (supabase as unknown as SupabaseClient).rpc("get_pet_photos_page", {
          p_pet_id: selectedPet.id,
          p_limit: RECENT_LIMIT,
          p_cursor_at: null,
          p_cursor_id: null,
          p_favorite_only: false,
        })
      : await (supabase as unknown as SupabaseClient).rpc("get_dashboard_photos", {
          p_favorite_only: false,
          p_limit: RECENT_LIMIT,
        })
    : emptyPhotoResult;
  const recentPhotos = (recentResult.data ?? []) as UchinocoNowPhoto[];

  const now = new Date();
  const currentMonth = currentTokyoMonth(now);
  const previousMonth = previousTokyoMonth(now);
  const nowParts = tokyoDateParts(now);
  const todayRange = tokyoRange(nowParts.year, nowParts.month, nowParts.day);
  const monthRange = tokyoRange(nowParts.year, nowParts.month, 1, true);
  const todayResult = await loadPhotosInRange(supabase, selectedPetIds, todayRange, 12);
  const bestShotResult = await selectStoredTodayBestShot(supabase, todayResult.photos);
  const anniversaryMemory = await loadAnniversaryMemory({ supabase, pets, selectedPetIds, now });

  const [takenCount, createdCount] = selectedPetIds.length
    ? await Promise.all([
        supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .in("pet_id", selectedPetIds)
          .gte("taken_at", monthRange.start)
          .lt("taken_at", monthRange.end),
        supabase
          .from("photos")
          .select("id", { count: "exact", head: true })
          .in("pet_id", selectedPetIds)
          .is("taken_at", null)
          .gte("created_at", monthRange.start)
          .lt("created_at", monthRange.end),
      ])
    : [{ count: 0, error: null }, { count: 0, error: null }];
  const monthPhotoCount = (takenCount.count ?? 0) + (createdCount.count ?? 0);

  const albumsResult = selectedPetIds.length
    ? await supabase
        .from("albums")
        .select("id, pet_id, title, status, updated_at, period_from, period_to")
        .in("pet_id", selectedPetIds)
        .in("status", ["draft", "ready"])
        .order("updated_at", { ascending: false })
        .limit(12)
    : { data: [] as AlbumRow[], error: null };
  const albums = (albumsResult.data ?? []) as AlbumRow[];
  const albumIds = albums.map((album) => album.id);
  const activeDraftsResult = albumIds.length
    ? await supabase
        .from("album_draft_versions")
        .select("album_id, status")
        .in("album_id", albumIds)
        .eq("is_active", true)
        .in("status", ["ready", "editing"])
    : { data: [], error: null };
  const actionableAlbumIds = new Set(
    (activeDraftsResult.data ?? []).map((draft) => draft.album_id),
  );
  const readyAlbum = albums.find(
    (album) => periodMatchesMonth(album.period_from, album.period_to, currentMonth) && (album.status === "ready" || actionableAlbumIds.has(album.id)),
  );
  const readyAlbumHasDraft = readyAlbum ? actionableAlbumIds.has(readyAlbum.id) : false;
  const passiveCandidate = !readyAlbum && selectedPet && selectedPetIsOwner
    ? await preparePassiveCandidate({ supabase, userId: user.id, petId: selectedPet.id, petName: selectedPet.name, monthKey: currentMonth.key })
    : null;
  const previousPassiveCandidate = selectedPet && selectedPetIsOwner
    ? await preparePassiveCandidate({ supabase, userId: user.id, petId: selectedPet.id, petName: selectedPet.name, monthKey: previousMonth.key })
    : null;
  const annualYear = annualCandidateYear(now);
  const annualCandidate = selectedPet && selectedPetIsOwner && annualYear
    ? await preparePassiveAnnualCandidate({ supabase, userId: user.id, petId: selectedPet.id, petName: selectedPet.name, year: annualYear })
    : null;

  const anniversaryEvent = anniversaryMemory.events[0];
  const anniversaryPetCount = new Set(anniversaryMemory.events.map((event) => event.petId)).size;
  const anniversary = anniversaryEvent
    ? {
        petId: anniversaryEvent.petId,
        petName: anniversaryEvent.petName,
        kind: anniversaryEvent.kind,
        years: anniversaryEvent.years,
        count: anniversaryPetCount,
      }
    : null;

  const minimumAlbumPhotos = ALBUM_CANDIDATES_CONFIG.budget.minPhotos;
  const remainingForAlbum = minimumAlbumPhotos - monthPhotoCount;
  const albumProgress =
    !readyAlbum && !passiveCandidate && remainingForAlbum <= 3
      ? { photoCount: monthPhotoCount, target: minimumAlbumPhotos, href: albumHref, candidateReady: false }
      : null;

  const exactPast = anniversaryMemory.pastByYear[0];
  const onThisDay = exactPast?.photos[0]
    ? { photo: exactPast.photos[0], yearsAgo: exactPast.yearsAgo }
    : null;
  const familyActivityResult = selectedPetIds.length
    ? await (supabase as unknown as SupabaseClient).rpc("get_family_new_photo_activity", {
        p_pet_ids: selectedPetIds,
      })
    : { data: [], error: null };
  const familyActivityRows = (familyActivityResult.data ?? []) as Array<{
    pet_id: string;
    photo_count: number;
  }>;
  const familyActivityCount = familyActivityRows.reduce(
    (total, item) => total + Number(item.photo_count),
    0,
  );
  const familyActivityPetId = familyActivityRows[0]?.pet_id;
  const hero = selectUchinocoNowHero({
    selectedPet: selectedPet ? { id: selectedPet.id, name: selectedPet.name } : null,
    pets: pets.map((pet) => ({ id: pet.id, name: pet.name })),
    anniversary,
    readyAlbum: readyAlbum
      ? {
          id: readyAlbum.id,
          petId: readyAlbum.pet_id,
          title: readyAlbum.title,
          status: readyAlbumHasDraft ? "editing" : "ready",
        }
      : null,
    passiveCandidate: passiveCandidate
      ? { petId: selectedPet!.id, title: passiveCandidate.title, photoCount: passiveCandidate.photoCount, href: `/pets/${selectedPet!.id}/album/candidate?month=${currentMonth.key}` }
      : null,
    previousPassiveCandidate: previousPassiveCandidate
      ? { title: `${previousMonth.month}月のアルバム`, href: `/pets/${selectedPet!.id}/album/candidate?month=${previousMonth.key}` }
      : null,
    annualCandidate: annualCandidate
      ? { petId: selectedPet!.id, year: annualCandidate.year, photoCount: annualCandidate.photoCount, href: `/pets/${selectedPet!.id}/album/year/${annualCandidate.year}` }
      : null,
    growthComparison: anniversaryMemory.growthComparison
      ? { petId: anniversaryMemory.growthComparison.petId, yearsAgo: anniversaryMemory.growthComparison.yearsAgo, href: `/pets/${anniversaryMemory.growthComparison.petId}/anniversary#growth` }
      : null,
    albumProgress,
    familyActivity: familyActivityCount > 0 && familyActivityPetId
      ? { count: familyActivityCount, href: `/pets/${familyActivityPetId}/family` }
      : null,
    todayBestShot: bestShotResult.usedStoredIntelligence ? bestShotResult.photo : null,
    todayLatestPhoto: todayResult.photos[0] ?? null,
    fallbackPhoto: recentPhotos[0] ?? null,
    onThisDay,
    capturePromptAvailable: true,
    addPhotoHref,
    memoriesHref,
  });

  const avatarPaths = Array.from(new Set(pets.flatMap((pet) => (pet.avatar_url ? [pet.avatar_url] : []))));
  const displayPhotos = [
    ...recentPhotos,
    ...(hero?.photo && !recentPhotos.some((photo) => photo.id === hero.photo?.id) ? [hero.photo] : []),
  ];
  const [avatarUrlsResult, photoUrlsResult] = await Promise.all([
    avatarPaths.length
      ? supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
    createListImageUrls(supabase, displayPhotos),
  ]);
  const avatarUrlByPath = toSignedUrlMap(avatarUrlsResult.data ?? []);
  const photoUrlByPath = photoUrlsResult.signedUrlByPath;
  const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
  const primaryAvatar =
    primaryPet?.avatar_url && avatarUrlByPath.has(primaryPet.avatar_url)
      ? avatarUrlByPath.get(primaryPet.avatar_url)
      : null;
  const heroSrc = hero?.photo ? photoUrlByPath.get(listImagePath(hero.photo)) : null;
  const dataFailed = Boolean(
    recentResult.error ||
      todayResult.error ||
      albumsResult.error ||
      activeDraftsResult.error ||
      takenCount.error ||
      createdCount.error ||
      photoUrlsResult.error ||
      familyActivityResult.error,
  );

  return (
    <main className="home-page">
      <header className="flex items-center justify-between gap-3 px-0.5">
        <div>
          <p className="home-brand">UCHINOCO</p>
          <p className="home-brand-sub">今日も、うちの子と。</p>
        </div>
        <details className="relative">
          <summary className="ds-focus flex cursor-pointer list-none items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 [&::-webkit-details-marker]:hidden">
            {primaryAvatar ? (
              <Image
                src={primaryAvatar}
                alt=""
                width={34}
                height={34}
                className="size-[34px] rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="flex size-[34px] items-center justify-center rounded-full bg-surface-warm text-sm text-muted">
                {primaryPet?.name.slice(0, 1) ?? "＋"}
              </span>
            )}
            <span className="max-w-[5rem] truncate text-[13px] font-medium">
              {selectedPet?.name ?? (pets.length ? "すべて" : "登録")}
            </span>
            <ChevronDown aria-hidden="true" size={14} className="text-muted" />
          </summary>
          <div className="absolute right-0 z-30 mt-2 min-w-[11rem] rounded-xl border border-border bg-surface p-2 shadow-sm">
            {pets.length > 1 ? (
              <Link href="/home?pet=all" className="ds-focus block rounded-lg px-3 py-2 text-sm hover:bg-surface-warm">
                すべてのうちの子
              </Link>
            ) : null}
            {pets.map((pet) => (
              <Link key={pet.id} href={`/home?pet=${pet.id}`} className="ds-focus block rounded-lg px-3 py-2 text-sm hover:bg-surface-warm">
                {pet.name}
              </Link>
            ))}
            <Link href="/pets/new" className="ds-focus block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-warm">
              うちの子を追加
            </Link>
            <Link href="/settings/billing" className="ds-focus block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-warm">
              プラン・お支払い
            </Link>
            <form action={logout}>
              <button type="submit" className="ds-focus w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-warm">
                ログアウト
              </button>
            </form>
          </div>
        </details>
      </header>

      {params.error ? <p role="alert" className="app-error">{params.error}</p> : null}
      {params.message ? <p role="status" className="app-status">{params.message}</p> : null}
      {petsResult.error || dataFailed ? (
        <p role="alert" className="app-error">一部の情報を取得できませんでした。</p>
      ) : null}

      {!pets.length ? (
        <EmptyState
          title="まだペットが登録されていません"
          action={<Link className="app-button-primary" href="/pets/new">うちの子を登録する</Link>}
        />
      ) : hero ? (
        <section aria-labelledby="now-heading" className={`home-now-hero ${heroSrc ? "has-photo" : "is-prompt"}`}>
          {heroSrc && hero.photo ? (
            <Image
              src={heroSrc}
              alt={`${petNameById.get(hero.photo.pet_id) ?? "うちの子"}の思い出`}
              fill
              className="object-cover"
              sizes="(max-width: 430px) 100vw, 390px"
              priority
              unoptimized
            />
          ) : (
            <PawPrint aria-hidden="true" className="home-now-paw" size={72} strokeWidth={1.1} />
          )}
          {heroSrc ? <span className="home-hero-scrim" aria-hidden="true" /> : null}
          <div className="home-now-content">
            <div>
              <p className="home-now-eyebrow">{hero.eyebrow}</p>
              <h1 id="now-heading" className="home-now-title">{hero.title}</h1>
              <p className="home-now-message">{hero.message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={hero.cta.href} className="home-hero-cta ds-focus">
                {hero.cta.label}<ArrowRight aria-hidden="true" size={14} />
              </Link>
              {hero.secondary ? (
                <Link href={hero.secondary.href} className="ds-focus text-xs font-semibold underline decoration-white/40 underline-offset-4">
                  {hero.secondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {pets.length ? (
        <nav aria-label="クイックアクション" className="home-now-quick">
          <Link href={addPhotoHref} className="home-now-quick-item ds-focus">
            <ImagePlus aria-hidden="true" size={19} />
            <span>写真を追加</span>
          </Link>
          <Link href={albumHref} className="home-now-quick-item ds-focus">
            <BookOpen aria-hidden="true" size={19} />
            <span>アルバム</span>
          </Link>
          <a href="#pet-summary" className="home-now-quick-item ds-focus">
            <PawPrint aria-hidden="true" size={19} />
            <span>うちの子</span>
          </a>
        </nav>
      ) : null}

      {pets.length ? (
        <section aria-labelledby="recent-heading" className="home-section">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="recent-heading" className="home-section-title">最近の思い出</h2>
            <Link href={memoriesHref} className="home-section-link">すべて見る →</Link>
          </div>
          {recentPhotos.length ? (
            <ul className="home-hscroll">
              {recentPhotos.map((photo) => {
                const src = photoUrlByPath.get(listImagePath(photo));
                if (!src) return null;
                return (
                  <li key={photo.id} className="home-now-memory">
                    <Link
                      href={`/pets/${photo.pet_id}/photos/${photo.id}`}
                      className="ds-focus block"
                      aria-label={`${petNameById.get(photo.pet_id) ?? "うちの子"}の${formatShortDate(photo.taken_at ?? photo.created_at)}の思い出を見る`}
                    >
                      <span className="relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-surface-warm">
                        <Image src={src} alt="" fill className="object-cover" sizes="124px" unoptimized />
                      </span>
                      <span className="home-now-memory-caption">{formatShortDate(photo.taken_at ?? photo.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="まだ思い出がありません" action={<Link className="app-button-primary" href={addPhotoHref}>写真を追加</Link>} />
          )}
        </section>
      ) : null}

      {pets.length ? (
        <section aria-labelledby="album-heading" className="home-section home-now-album">
          <div>
            <p className="home-now-eyebrow text-primary">{readyAlbum ? (readyAlbumHasDraft ? "AI ALBUM" : "ALBUM READY") : "THIS MONTH"}</p>
            <h2 id="album-heading" className="home-section-title">
              {readyAlbum ? (readyAlbumHasDraft ? "AIアルバム候補" : "完成したアルバム") : "今月のアルバム"}
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            {readyAlbum
              ? readyAlbumHasDraft ? "AIがまとめた内容を確認し、そのまま楽しめます。必要なところだけ編集できます。" : "アルバムのプレビューと詳細を確認できます。"
              : `${monthPhotoCount}枚の思い出が集まっています。`}
          </p>
          <Link href={readyAlbum ? `/pets/${readyAlbum.pet_id}/album/${readyAlbum.id}?view=complete` : albumHref} className="home-section-link ds-focus inline-flex items-center gap-1">
            {readyAlbum ? "アルバムを確認する" : "アルバムへ"}<ArrowRight aria-hidden="true" size={13} />
          </Link>
        </section>
      ) : null}

      {pets.length ? (
        <section id="pet-summary" aria-labelledby="pet-heading" className="home-section scroll-mt-24">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="pet-heading" className="home-section-title">うちの子</h2>
            <Link href="/pets/new" className="home-section-link">＋ 追加</Link>
          </div>
          <ul className="grid gap-2">
            {(selectedPet ? [selectedPet] : pets).map((pet) => {
              const avatar = pet.avatar_url ? avatarUrlByPath.get(pet.avatar_url) : null;
              const meta = [speciesLabel(pet.species), pet.breed, genderLabel(pet.gender)].filter(Boolean).join(" ・ ");
              return (
                <li key={pet.id} className="flex items-center gap-3 rounded-[14px] bg-surface-warm px-3 py-2.5">
                  {avatar ? (
                    <Image src={avatar} alt="" width={48} height={48} className="size-12 rounded-full object-cover" unoptimized />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-full bg-surface text-primary"><PawPrint aria-hidden="true" size={21} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{pet.name}</p>
                    <p className="truncate text-xs text-muted">{meta}</p>
                  </div>
                  <Link href={`/pets/${pet.id}`} className="ds-focus rounded-full px-3 py-2 text-xs font-semibold text-primary">思い出</Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
