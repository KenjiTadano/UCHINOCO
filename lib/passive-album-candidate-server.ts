import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPetAlbumDraft, type AlbumDraftRun } from "@/app/(app)/dev/album-draft/actions";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "./photo-analysis/constants.ts";
import { sourceFingerprint } from "./photo-analysis/fingerprint.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";
import { currentTokyoMonth as currentLifecycleMonth, parseTokyoMonthKey } from "./album-monthly-lifecycle.ts";
import {
  PASSIVE_ALBUM_MIN_PHOTOS,
  isPassiveCandidateReady,
  passiveCandidateAlbumId,
  passiveCandidateFingerprint,
  passiveCandidateTitle,
  type PassiveCandidateSummary,
} from "./passive-album-candidate.ts";
import { buildAlbumCompositionPlan, type AlbumCompositionPlan } from "./album-draft/composition.ts";
import { formatAlbumPeriodLabels } from "./album-cover-title.ts";

type PhotoRow = {
  id: string;
  pet_id: string;
  storage_path: string;
  updated_at: string;
  content_hash: string | null;
  timeline_at: string;
};

export type PreparedPassiveCandidate = PassiveCandidateSummary & {
  petName: string;
  albumId: string;
  draft: AlbumDraftRun;
  photoCandidates: string[];
  bestShotPhotoIds: string[];
  storyGroups: Array<{ id: string; type: string; photoIds: string[] }>;
  layoutRecommendations: Array<{ storySpreadId: string; layoutId: string }>;
  cropRecommendations: Array<{ photoId: string; x: number; y: number; scale: number }>;
  composition: AlbumCompositionPlan;
};

const cache = new Map<string, { expiresAt: number; value: PreparedPassiveCandidate }>();
const CACHE_MS = 15 * 60_000;

export function currentTokyoMonth(now = new Date()) {
  return currentLifecycleMonth(now).period;
}

function candidatePeriod(monthKey: string | null | undefined, now = new Date()) {
  return parseTokyoMonthKey(monthKey)?.period ?? currentTokyoMonth(now);
}

async function currentMonthPhotos(supabase: SupabaseClient, userId: string, petId: string, period: { start: string; end: string }) {
  const photos: PhotoRow[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await supabase
      .from("photos")
      .select("id, pet_id, storage_path, updated_at, content_hash, timeline_at")
      .eq("pet_id", petId)
      .gte("timeline_at", period.start)
      .lt("timeline_at", period.end)
      .order("timeline_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 199);
    if (page.error) return { photos: [], error: page.error };
    photos.push(...((page.data ?? []) as PhotoRow[]));
    if ((page.data?.length ?? 0) < 200) break;
  }
  return { photos, error: null };
}

async function currentAnalysisCount(supabase: SupabaseClient, photos: PhotoRow[]) {
  if (!photos.length) return 0;
  const data = [] as Array<{ photo_id: string; analysis_type: string; analysis_version: string; source_fingerprint: string; result_status: string }>;
  for (let offset = 0; offset < photos.length; offset += 100) {
    const page = await supabase
      .from("photo_analysis_results")
      .select("photo_id, analysis_type, analysis_version, source_fingerprint, result_status")
      .in("photo_id", photos.slice(offset, offset + 100).map((photo) => photo.id))
      .in("analysis_type", [PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY])
      .in("result_status", ["success", "fallback"]);
    if (page.error) return 0;
    data.push(...((page.data ?? []) as typeof data));
  }
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  const valid = new Set<string>();
  for (const row of data) {
    const photo = photoById.get(row.photo_id);
    if (!photo || row.source_fingerprint !== sourceFingerprint(photo)) continue;
    if (row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION) valid.add(`${row.photo_id}:semantic`);
    if (row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION) valid.add(`${row.photo_id}:geometry`);
  }
  return valid.size;
}

async function hasProtectedAlbum(supabase: SupabaseClient, userId: string, petId: string, period: { start: string; end: string }, candidateAlbumId: string) {
  const { data: albums } = await supabase
    .from("albums")
    .select("id, status")
    .eq("owner_user_id", userId)
    .eq("pet_id", petId)
    .lt("period_from", period.end)
    .gt("period_to", period.start);
  const rows = (albums ?? []).filter((album) => album.id !== candidateAlbumId);
  if (!rows.length) return false;
  if (rows.some((album) => album.status === "ordered" || album.status === "ready")) return true;
  const ids = rows.map((album) => album.id);
  const [{ data: drafts }, { data: acceptedOrEdited }, { data: snapshots }] = await Promise.all([
    supabase.from("album_draft_versions").select("album_id, status").in("album_id", ids).eq("is_active", true),
    supabase.from("album_analytics_events").select("album_id").in("album_id", ids).in("event_type", ["album_accepted", "album_edit_started", "album_layout_changed", "album_crop_changed", "album_photo_swapped", "album_text_changed", "album_decoration_changed", "album_background_changed"]).limit(1),
    supabase.from("album_print_snapshots").select("album_id, finalized_at").in("album_id", ids).not("finalized_at", "is", null).limit(1),
  ]);
  return Boolean((drafts ?? []).some((draft) => draft.status === "editing") || acceptedOrEdited?.length || snapshots?.length);
}

async function hasMaterializedCandidate(supabase: SupabaseClient, userId: string, petId: string, albumId: string, fingerprint: string) {
  const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).eq("owner_user_id", userId).eq("pet_id", petId).maybeSingle();
  if (!album) return false;
  const { data: draft } = await supabase.from("album_draft_versions").select("generation_metadata").eq("album_id", albumId).eq("is_active", true).maybeSingle();
  const metadata = draft?.generation_metadata as Record<string, unknown> | null;
  return metadata?.passive_candidate_fingerprint === fingerprint;
}

export async function loadPassiveCandidateSummary(input: {
  supabase: SupabaseClient;
  userId: string;
  petId: string;
  petName: string;
  now?: Date;
  monthKey?: string | null;
}): Promise<PassiveCandidateSummary | null> {
  const period = candidatePeriod(input.monthKey, input.now);
  const { photos, error } = await currentMonthPhotos(input.supabase, input.userId, input.petId, period);
  if (error || photos.length < PASSIVE_ALBUM_MIN_PHOTOS) return null;
  const identity = { petIds: [input.petId], period, photoIds: photos.map((photo) => photo.id) };
  const fingerprint = passiveCandidateFingerprint(identity);
  const albumId = passiveCandidateAlbumId(fingerprint);
  const [analysisCount, protectedAlbum, materialized] = await Promise.all([
    currentAnalysisCount(input.supabase, photos),
    hasProtectedAlbum(input.supabase, input.userId, input.petId, period, albumId),
    hasMaterializedCandidate(input.supabase, input.userId, input.petId, albumId, fingerprint),
  ]);
  if (protectedAlbum || materialized || !isPassiveCandidateReady(photos.length, analysisCount)) return null;
  return {
    ...identity,
    fingerprint,
    title: passiveCandidateTitle(period.start, input.petName),
    photoCount: photos.length,
    coverPhotoId: photos.at(-1)?.id ?? null,
    stale: false,
  };
}

export async function preparePassiveCandidate(input: {
  supabase: SupabaseClient;
  userId: string;
  petId: string;
  petName: string;
  expectedFingerprint?: string | null;
  monthKey?: string | null;
  now?: Date;
}): Promise<PreparedPassiveCandidate | null> {
  const summary = await loadPassiveCandidateSummary(input);
  if (!summary || (input.expectedFingerprint && input.expectedFingerprint !== summary.fingerprint)) return null;
  const cached = cache.get(summary.fingerprint);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const draft = await buildPetAlbumDraft(
    input.petId,
    { type: "custom", start: summary.period.start, end: summary.period.end },
    { dateRange: summary.period, storedOnly: true },
  );
  if (!draft.ok || !draft.draft || !draft.spreads.length) return null;
  const coverPhotoId = draft.spreads.flatMap((spread) => spread.assignments).find((item) => item.role === "hero")?.photoId ?? summary.coverPhotoId;
  const composition = buildAlbumCompositionPlan(draft.spreads, {
    title: summary.title,
    petName: input.petName,
    period: formatAlbumPeriodLabels(summary.period.start, summary.period.end).coverDateLabel,
    periodStart: summary.period.start,
    periodEnd: summary.period.end,
  });
  const value: PreparedPassiveCandidate = {
    ...summary,
    coverPhotoId,
    albumId: passiveCandidateAlbumId(summary.fingerprint),
    petName: input.petName,
    draft,
    photoCandidates: summary.photoIds,
    bestShotPhotoIds: draft.spreads.flatMap((spread) => spread.assignments.filter((item) => item.role === "hero").map((item) => item.photoId)),
    storyGroups: draft.spreads.map((spread) => ({ id: spread.storySpreadId, type: spread.story.storyType, photoIds: spread.assignments.map((item) => item.photoId) })),
    layoutRecommendations: draft.spreads.map((spread) => ({ storySpreadId: spread.storySpreadId, layoutId: spread.layoutId })),
    cropRecommendations: draft.spreads.flatMap((spread) => spread.assignments.map((item) => ({ photoId: item.photoId, ...item.crop }))),
    composition,
  };
  cache.set(summary.fingerprint, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

export function clearPassiveCandidateCache() {
  cache.clear();
}
