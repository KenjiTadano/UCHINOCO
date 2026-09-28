"use server";

import { selectPetAlbumCandidates } from "../album-candidates/actions";
import { buildPetAlbumDraft } from "../album-draft/actions";
import { selectPetBestShots } from "../best-shot/actions";
import { groupPetPhotos } from "../photo-grouping/actions";
import { buildPetAlbumStory } from "../album-story/actions";
import type { AlbumPeriodInput } from "@/lib/album-candidates/types";
import { instantInPeriod, resolveAlbumPeriod, AlbumPeriodError } from "@/lib/album-candidates/period";
import { assessAlbumGeneration } from "@/lib/album-generation/gate";
import { generationSignature } from "@/lib/album-generation/signature";
import type { AlbumGenerationResult } from "@/lib/album-generation/types";
import { PHOTO_INTELLIGENCE_SEMANTIC } from "@/lib/photo-analysis/constants";
import { geometryMemoryKey, intelligenceMemoryKey } from "@/lib/photo-analysis/keys";
import {
  aggregateCacheSource,
  analysisTraces,
  clearAnalysisTraces,
  resetVisionCalls,
  visionCallCount,
  type AnalysisTrace,
} from "@/lib/photo-analysis/trace";
import { albumCandidateCacheKey, getAlbumCandidateCache } from "@/lib/album-candidates/cache";
import { albumCandidateFingerprint } from "@/lib/album-candidates/config";
import { albumDraftCacheKey, getAlbumDraftCache } from "@/lib/album-draft/cache";
import { albumDraftFingerprint } from "@/lib/album-draft/fingerprint";
import { albumStoryCacheKey, getAlbumStoryCache } from "@/lib/album-story/cache";
import { albumStoryFingerprint } from "@/lib/album-story/config";
import { bestShotCacheKey, getBestShotCache } from "@/lib/best-shot/cache";
import { bestShotConfigFingerprint } from "@/lib/best-shot/config";
import { getPhotoIntelligenceCache } from "@/lib/photo-intelligence/cache";
import { descriptorCacheKey, getDescriptorCache } from "@/lib/photo-grouping/descriptor-cache";
import { PHOTO_GROUPING_VERSION } from "@/lib/photo-grouping/config";
import { getSmartCropCache } from "@/lib/smart-crop/cache";
import { createClient } from "@/lib/supabase/server";
import type { StageSummary } from "@/lib/album-generation/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlbumE2ERun = {
  ok: boolean;
  message: string | null;
  result: AlbumGenerationResult | null;
  signature: string;
  visionCalls: number;
  analysis: AnalysisTrace[];
};

function emptyRun(message: string): AlbumE2ERun {
  return { ok: false, message, result: null, signature: "", visionCalls: 0, analysis: [] };
}

function cacheLabel(hits: number, total: number): StageSummary["cache"] {
  if (total === 0) return "unknown";
  if (hits === total) return "hit";
  if (hits === 0) return "miss";
  return "mixed";
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = Date.now();
  const value = await run();
  return { value, durationMs: Date.now() - started };
}

/** Call once before preparing photos so the audit counts that run, not a later memory hit. */
export async function beginAlbumAnalysisAudit() {
  clearAnalysisTraces();
  resetVisionCalls();
}

/** Run Task051–056 once and audit the hand-off. Analysis rows are written by the vision cache. */
export async function generatePetAlbum(petId: string, periodInput: AlbumPeriodInput): Promise<AlbumE2ERun> {
  if (!UUID_PATTERN.test(petId)) return emptyRun("不正なIDです。");
  let period;
  try {
    period = resolveAlbumPeriod(periodInput);
  } catch (error) {
    if (error instanceof AlbumPeriodError) return emptyRun(error.message);
    throw error;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyRun("ログインが必要です。");
  const { data: rows } = await supabase
    .from("photos")
    .select("id, storage_path, taken_at, created_at, updated_at, content_hash")
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .limit(80);
  const photos = rows ?? [];
  const sourceById = new Map(photos.map((photo) => [photo.id, photo]));
  const intelligenceHits = photos.filter((photo) => getPhotoIntelligenceCache(intelligenceMemoryKey(photo))).length;

  const grouped = await timed(() => groupPetPhotos(petId));
  if (!grouped.value.ok) return emptyRun(grouped.value.message ?? "グループ化に失敗しました。");

  const periodGroups = grouped.value.groups.filter((group) => instantInPeriod(group.startedAt, period));
  const descriptorHits = periodGroups
    .flatMap((group) => group.members)
    .filter((member) => {
      const source = sourceById.get(member.photoId);
      return source
        ? getDescriptorCache(descriptorCacheKey(member.photoId, source.storage_path, PHOTO_GROUPING_VERSION)) !== undefined
        : false;
    }).length;
  const bestShotHits = periodGroups.filter((group) =>
    getBestShotCache(bestShotCacheKey(group.id, group.photoIds, bestShotConfigFingerprint())),
  ).length;
  const shots = await timed(() => selectPetBestShots(petId));
  if (!shots.value.ok) return emptyRun(shots.value.message ?? "ベストショットの選定に失敗しました。");

  const candidateKey = albumCandidateCacheKey(
    petId,
    period,
    grouped.value.groups.map((group) => group.id),
    albumCandidateFingerprint(),
  );
  const candidateCache = getAlbumCandidateCache(candidateKey) ? "hit" : "miss";
  const candidates = await timed(() => selectPetAlbumCandidates(petId, periodInput));
  if (!candidates.value.ok || !candidates.value.result) {
    return emptyRun(candidates.value.message ?? "候補の選定に失敗しました。");
  }

  const storyKey = albumStoryCacheKey(
    petId,
    candidates.value.result.period,
    candidates.value.selected.map((scene) => scene.groupId),
    albumStoryFingerprint(),
  );
  const storyCache = getAlbumStoryCache(storyKey) ? "hit" : "miss";
  const story = await timed(() => buildPetAlbumStory(petId, periodInput));
  if (!story.value.ok || !story.value.story) return emptyRun(story.value.message ?? "ストーリーの作成に失敗しました。");

  const draftPhotoIds = [...new Set(story.value.story.spreads.flatMap((spread) => spread.photoIds))];
  const cropHits = draftPhotoIds.filter((photoId) => {
    const source = sourceById.get(photoId);
    return source ? Boolean(getSmartCropCache(geometryMemoryKey(source))) : false;
  }).length;
  const draftKey = albumDraftCacheKey(story.value.story.spreads.map((spread) => spread.id), draftPhotoIds, albumDraftFingerprint());
  const draftCache = getAlbumDraftCache(draftKey) ? "hit" : "miss";
  const draft = await timed(() => buildPetAlbumDraft(petId, periodInput));
  if (!draft.value.ok || !draft.value.draft) return emptyRun(draft.value.message ?? "レイアウトの作成に失敗しました。");

  const periodPhotoIds = grouped.value.groups
    .flatMap((group) => group.members)
    .filter((member) => instantInPeriod(member.capturedAt, period))
    .map((member) => member.photoId);
  const lowQuality = photos
    .filter((photo) => {
      const hit = getPhotoIntelligenceCache(intelligenceMemoryKey(photo));
      return hit?.intelligence.status === "low_quality" && periodPhotoIds.includes(photo.id);
    })
    .map((photo) => photo.id);

  const periodSemantic = analysisTraces().filter(
    (item) => item.analysisType === PHOTO_INTELLIGENCE_SEMANTIC && periodPhotoIds.includes(item.photoId),
  );
  const intelligenceSource = aggregateCacheSource(periodSemantic.map((item) => item.cacheSource));
  const shotByGroup = new Map(shots.value.groups.map((group) => [group.group.id, group.selection]));
  const result = assessAlbumGeneration({
    petId,
    period,
    libraryPhotoIds: photos.map((photo) => photo.id),
    periodPhotoIds,
    groups: grouped.value.groups.map((group) => ({
      groupId: group.id,
      photoIds: group.photoIds,
      warnings: group.warnings,
      startedAt: group.startedAt,
    })),
    bestShots: shots.value.groups
      .filter((group) => instantInPeriod(group.group.startedAt, period))
      .map((group) => ({
      groupId: group.group.id,
      primaryPhotoId: group.selection.primaryPhotoId,
      secondaryPhotoId: group.selection.secondaryPhotoId,
      confidence: group.selection.confidence,
      warnings: group.group.warnings,
    })),
    candidates: candidates.value.selected.map((scene) => ({
      groupId: scene.groupId,
      primaryPhotoId: scene.primaryPhotoId,
      secondaryPhotoId: scene.secondaryPhotoId,
      startedAt: scene.startedAt,
      sceneScore: scene.sceneScore,
      selectionConfidence: shotByGroup.get(scene.groupId)?.confidence ?? 1,
      activity: scene.activity,
      warnings: scene.warnings,
    })),
    chronology: story.value.story.storyBalance.chronology,
    storySpreads: story.value.story.spreads.map((spread) => ({
      id: spread.id,
      photoIds: spread.photoIds,
      primaryPhotoIds: spread.primaryPhotoIds,
      secondaryPhotoIds: spread.secondaryPhotoIds,
      storyType: spread.storyType,
      recommendedDensity: spread.recommendedDensity,
      coherenceScore: spread.coherenceScore,
      importance: spread.importance,
      startedAt: spread.startedAt,
      activity: spread.theme.activity,
    })),
    drafts: draft.value.spreads,
    intelligence: {
      failed: false,
      usedFallback: periodSemantic.some((item) => item.status !== "success"),
      lowQualityPhotoIds: lowQuality,
    },
    brokenPhotoIds: draft.value.spreads.flatMap((spread) =>
      spread.assignments.filter((assignment) => !assignment.previewUrl).map((assignment) => assignment.photoId),
    ),
    stages: {
      photoIntelligence: {
        durationMs: 0,
        cache:
          intelligenceSource === "ai"
            ? "miss"
            : intelligenceSource === "mixed"
              ? "mixed"
              : intelligenceSource
                ? "hit"
                : cacheLabel(intelligenceHits, photos.length),
        cacheSource: intelligenceSource,
      },
      grouping: { durationMs: grouped.durationMs, cache: cacheLabel(descriptorHits, periodPhotoIds.length) },
      bestShot: { durationMs: shots.durationMs, cache: cacheLabel(bestShotHits, periodGroups.length) },
      candidates: { durationMs: candidates.durationMs, cache: candidateCache },
      story: { durationMs: story.durationMs, cache: storyCache },
      draft: {
        durationMs: draft.durationMs,
        cache: draftCache === "hit" && cropHits === draftPhotoIds.length ? "hit" : draftCache,
      },
    },
  });

  const signature = generationSignature({
    period,
    groupIds: periodGroups.map((group) => group.id),
    selectedSceneIds: candidates.value.selected.map((scene) => scene.groupId),
    selectedPhotoIds: candidates.value.result.selectedPhotoIds,
    roles: shots.value.groups
      .filter((group) => instantInPeriod(group.group.startedAt, period))
      .map((group) => ({
        groupId: group.group.id,
        primaryPhotoId: group.selection.primaryPhotoId,
        secondaryPhotoId: group.selection.secondaryPhotoId ?? null,
      })),
    storySpreadIds: story.value.story.spreads.map((spread) => spread.id),
    layoutIds: result.album.spreads.map((spread) => spread.layoutId),
    frames: result.album.spreads.flatMap((spread) =>
      spread.assignments.map((item) => ({
        storySpreadId: spread.storySpreadId,
        layoutId: spread.layoutId,
        frameId: item.frameId,
        photoId: item.photoId,
        role: item.role,
        crop: item.crop,
      })),
    ),
  });
  return { ok: true, message: null, result, signature, visionCalls: visionCallCount(), analysis: analysisTraces() };
}
