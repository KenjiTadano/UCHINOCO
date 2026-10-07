import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPetAlbumDraft, type AlbumDraftRun } from "@/app/(app)/dev/album-draft/actions";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "./photo-analysis/constants.ts";
import { sourceFingerprint } from "./photo-analysis/fingerprint.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";
import { buildAlbumCompositionPlan, type AlbumCompositionPlan } from "./album-draft/composition.ts";
import { formatAlbumPeriodLabels } from "./album-cover-title.ts";
import {
  ANNUAL_ALBUM_CONFIG,
  ANNUAL_ALBUM_VERSION,
  annualCandidateAlbumId,
  annualCandidateFingerprint,
  annualCandidateTitle,
  annualEligibility,
  annualPeriod,
  groupAnnualSelectionBySeason,
  representedAnnualMonths,
  type AnnualSeasonKey,
} from "./annual-album.ts";

type PhotoRow = { id: string; pet_id: string; storage_path: string; updated_at: string; content_hash: string | null; timeline_at: string };

export type PreparedAnnualCandidate = {
  version: typeof ANNUAL_ALBUM_VERSION;
  year: number;
  period: { start: string; end: string };
  petId: string;
  petName: string;
  title: string;
  albumId: string;
  fingerprint: string;
  sourcePhotoIds: string[];
  analyzedPhotoIds: string[];
  selectedPhotoIds: string[];
  photoCount: number;
  coverPhotoId: string;
  draft: AlbumDraftRun;
  composition: AlbumCompositionPlan;
  seasons: Array<{ key: AnnualSeasonKey; label: string; photoIds: string[]; storySpreadIds: string[] }>;
  monthlySourceAlbumIds: string[];
  print: { photoCount: number; spreadCount: number; estimatedPageCount: number; printSafe: boolean };
};

const cache = new Map<string, { expiresAt: number; value: PreparedAnnualCandidate }>();
const CACHE_MS = 15 * 60_000;

async function loadAnnualPhotos(supabase: SupabaseClient, userId: string, petId: string, period: { start: string; end: string }) {
  const photos: PhotoRow[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await supabase.from("photos")
      .select("id, pet_id, storage_path, updated_at, content_hash, timeline_at")
      .eq("pet_id", petId)
      .gte("timeline_at", period.start).lt("timeline_at", period.end)
      .order("timeline_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 199);
    if (page.error) return { photos: [], error: page.error };
    photos.push(...((page.data ?? []) as PhotoRow[]));
    if ((page.data?.length ?? 0) < 200) break;
  }
  return { photos, error: null };
}

async function analyzedPhotoIds(supabase: SupabaseClient, photos: PhotoRow[]) {
  const valid = new Set<string>();
  for (let offset = 0; offset < photos.length; offset += 100) {
    const pagePhotos = photos.slice(offset, offset + 100);
    const { data, error } = await supabase.from("photo_analysis_results")
      .select("photo_id, analysis_type, analysis_version, source_fingerprint, result_status")
      .in("photo_id", pagePhotos.map((photo) => photo.id))
      .in("analysis_type", [PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY])
      .in("result_status", ["success", "fallback"]);
    if (error) return [];
    const photoById = new Map(pagePhotos.map((photo) => [photo.id, photo]));
    const types = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const photo = photoById.get(row.photo_id);
      if (!photo || row.source_fingerprint !== sourceFingerprint(photo)) continue;
      if (row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION) {
        (types.get(row.photo_id) ?? types.set(row.photo_id, new Set()).get(row.photo_id))?.add("semantic");
      }
      if (row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION) {
        (types.get(row.photo_id) ?? types.set(row.photo_id, new Set()).get(row.photo_id))?.add("geometry");
      }
    }
    for (const [photoId, found] of types) if (found.size === 2) valid.add(photoId);
  }
  return [...valid];
}

async function annualAlbumsForPeriod(supabase: SupabaseClient, userId: string, petId: string, period: { start: string; end: string }) {
  const { data: albums } = await supabase.from("albums").select("id, status")
    .eq("owner_user_id", userId).eq("pet_id", petId)
    .eq("period_from", period.start).eq("period_to", period.end);
  if (!albums?.length) return { protected: false, ids: [] as string[] };
  const ids = albums.map((album) => album.id);
  const { data: drafts } = await supabase.from("album_draft_versions")
    .select("album_id, status, generation_metadata").in("album_id", ids).eq("is_active", true);
  const annualIds = new Set((drafts ?? []).filter((draft) => {
    const metadata = draft.generation_metadata as Record<string, unknown> | null;
    return metadata?.annual_candidate_version === ANNUAL_ALBUM_VERSION;
  }).map((draft) => draft.album_id));
  return {
    ids: [...annualIds],
    protected: annualIds.size > 0,
  };
}

async function acceptedMonthlySources(supabase: SupabaseClient, userId: string, petId: string, period: { start: string; end: string }) {
  const { data } = await supabase.from("albums").select("id, status, period_from, period_to")
    .eq("owner_user_id", userId).eq("pet_id", petId)
    .gte("period_from", period.start).lte("period_to", period.end)
    .in("status", ["ready", "ordered"]);
  return (data ?? []).filter((album) => album.period_from && album.period_to).map((album) => album.id);
}

export async function preparePassiveAnnualCandidate(input: { supabase: SupabaseClient; userId: string; petId: string; petName: string; year: number; expectedFingerprint?: string | null }) {
  const period = annualPeriod(input.year);
  const [{ photos, error }, existing, petDatesResult] = await Promise.all([
    loadAnnualPhotos(input.supabase, input.userId, input.petId, period),
    annualAlbumsForPeriod(input.supabase, input.userId, input.petId, period),
    input.supabase.from("pets").select("birthday, adoption_date").eq("id", input.petId).eq("owner_user_id", input.userId).maybeSingle(),
  ]);
  if (error || existing.protected || photos.length < ANNUAL_ALBUM_CONFIG.minPhotos) return null;
  const analyzedIds = await analyzedPhotoIds(input.supabase, photos);
  const analyzedSet = new Set(analyzedIds);
  const analyzedPhotos = photos.filter((photo) => analyzedSet.has(photo.id));
  const populatedMonths = representedAnnualMonths(photos.map((photo) => ({ timelineAt: photo.timeline_at })));
  const analyzedMonths = representedAnnualMonths(analyzedPhotos.map((photo) => ({ timelineAt: photo.timeline_at })));
  const eligibility = annualEligibility({
    totalPhotoCount: photos.length,
    analyzedPhotoCount: analyzedPhotos.length,
    populatedMonthCount: populatedMonths.size,
    representedMonthCount: analyzedMonths.size,
    completedAnnualExists: existing.protected,
  });
  if (!eligibility.eligible) return null;

  const draft = await buildPetAlbumDraft(input.petId, { type: "custom", start: period.start, end: period.end }, { dateRange: period, storedOnly: true, allowedPhotoIds: analyzedIds });
  if (!draft.ok || !draft.draft || !draft.spreads.length) return null;
  const selectedPhotoIds = [...new Set(draft.spreads.flatMap((spread) => spread.assignments.map((assignment) => assignment.photoId)))];
  if (!selectedPhotoIds.length || selectedPhotoIds.length > ANNUAL_ALBUM_CONFIG.maxSelectedPhotos) return null;
  const selectedTimeline = analyzedPhotos.filter((photo) => selectedPhotoIds.includes(photo.id)).map((photo) => ({ id: photo.id, timelineAt: photo.timeline_at }));
  const selectedMonths = representedAnnualMonths(selectedTimeline);
  if (!annualEligibility({
    totalPhotoCount: photos.length,
    analyzedPhotoCount: analyzedPhotos.length,
    populatedMonthCount: populatedMonths.size,
    representedMonthCount: selectedMonths.size,
    selectedPhotoCount: selectedPhotoIds.length,
    completedAnnualExists: existing.protected,
  }).eligible) return null;
  const fingerprint = annualCandidateFingerprint({ year: input.year, petIds: [input.petId], analyzedPhotoIds: analyzedIds, selectedPhotoIds });
  if (input.expectedFingerprint && input.expectedFingerprint !== fingerprint) return null;
  const cached = cache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const title = annualCandidateTitle(input.year, input.petName);
  const birthday = petDatesResult.data?.birthday;
  const adoptionDate = petDatesResult.data?.adoption_date;
  const adoptionOccurrence = adoptionDate ? `${input.year}-${adoptionDate.slice(5)}` : null;
  const composition = buildAlbumCompositionPlan(draft.spreads, {
    title, petName: input.petName,
    period: formatAlbumPeriodLabels(period.start, period.end).coverDateLabel,
    periodStart: period.start, periodEnd: period.end,
    events: [
      ...(birthday ? [{ kind: "birthday" as const, date: birthday }] : []),
      ...(adoptionOccurrence ? [{ kind: "adoption" as const, date: adoptionOccurrence }] : []),
    ],
  });
  const seasons = groupAnnualSelectionBySeason(selectedTimeline).map((season) => ({
    ...season,
    storySpreadIds: draft.spreads.filter((spread) => spread.assignments.some((item) => season.photoIds.includes(item.photoId))).map((spread) => spread.storySpreadId),
  }));
  const monthlySourceAlbumIds = await acceptedMonthlySources(input.supabase, input.userId, input.petId, period);
  const coverPhotoId = draft.spreads.flatMap((spread) => spread.assignments).find((item) => item.role === "hero")?.photoId ?? selectedPhotoIds[0];
  const value: PreparedAnnualCandidate = {
    version: ANNUAL_ALBUM_VERSION, year: input.year, period, petId: input.petId, petName: input.petName,
    title, albumId: annualCandidateAlbumId(fingerprint), fingerprint,
    sourcePhotoIds: photos.map((photo) => photo.id), analyzedPhotoIds: analyzedIds, selectedPhotoIds, photoCount: photos.length, coverPhotoId,
    draft, composition, seasons, monthlySourceAlbumIds,
    print: { photoCount: selectedPhotoIds.length, spreadCount: draft.spreads.length, estimatedPageCount: draft.spreads.length * 2 + 2, printSafe: draft.spreads.every((spread) => spread.status !== "unusable") },
  };
  cache.set(fingerprint, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}
