"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { ALBUM_INTENT_TTL_MS } from "@/lib/album-readiness";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSceneGroups } from "@/lib/photo-grouping/group";
import { selectBestShot } from "@/lib/best-shot/select";
import { visualPairKey } from "@/lib/best-shot/score";
import { loadStoredGenerationInputs } from "@/lib/album-generation/stored-inputs";
import { generationPerformance } from "@/lib/album-generation/performance";
import { createPhotoPreviewUrls } from "@/lib/photo-image-delivery";
import { parseAlbumSetup } from "@/lib/album-setup";
import { planEditorialAlbum, buildEditorialDraft, editorialPageText, EDITORIAL_VERSION, EditorialGenerationError, sourceSubjectClipped, type EditorialPhoto, type LayoutRecoveryStats, type ReplacementMethod, type SpreadLayoutRecoveryDiagnostic } from "@/lib/album-draft/editorial";
import { ALBUM_DRAFT_CONFIG } from "@/lib/album-draft/config";
import type { LayoutPhotoInput } from "@/lib/smart-layout/types";
import { createClient } from "@/lib/supabase/server";
import { buildDraftSavePayload, toPersistableSpread } from "@/lib/album-persistence/payload";
import { scopeAlbumPhotos, generateFallbackTitle, type AlbumCandidate } from "@/lib/album-selection";
import type { Json } from "@/lib/supabase/database.types";
import { loadCoverEditor } from "@/app/(app)/album-draft-service";
import { buildAlbumCompositionPlan } from "@/lib/album-draft/composition";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { albumCapacityState, requiredEligiblePhotos } from "@/lib/album-capacity";
import { isTerminalAnalysisFailure } from "@/lib/photo-analysis-policy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logAlbumAutoResume(input: { intentPresent: boolean; readinessStatus: string | null; eligibleReady: number | null; requiredEligible: number | null; autoResumeTriggered: boolean; generationStarted: boolean; generationCompleted: boolean; duplicateSuppressed: boolean }) {
  console.info("albumAutoResume", input);
}

function logAlbumLayoutRecovery(timing: ReturnType<typeof generationPerformance>, spreadCount: number, recovery: LayoutRecoveryStats) {
  const record = { spreadCount, ...recovery };
  console.info("albumLayoutRecovery", record);
  timing.layoutRecovery(record);
}

export type CreateAlbumState = {
  error: string | null;
  status?: "preparing" | "retryable" | "action_required" | "in_progress" | "failed" | "complete";
  recoveryReason?: "layout";
  previewHref?: string;
  recoveryHref?: string;
};

export async function createAlbumDraft(petId: string, _prev: CreateAlbumState, formData: FormData): Promise<CreateAlbumState> {
  const timing = generationPerformance();
  try {
    const result = await generateAlbumDraft(petId, formData, timing);
    timing.finish("failed");
    return result;
  } catch (error) {
    timing.finish("failed");
    unstable_rethrow(error);
    return { error: "アルバムを作成できませんでした。もう一度お試しください。", status: "retryable" };
  }
}

async function generateAlbumDraft(petId: string, formData: FormData, timing: ReturnType<typeof generationPerformance>): Promise<CreateAlbumState> {
  timing.start("01_request_validation", 1);
  if (!UUID_PATTERN.test(petId)) return { error: "無効なリクエストです。" };
  timing.end("01_request_validation", 1);
  timing.start("02_pet_ownership_validation");
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "ログインしてから作成を続けられます。", status: "action_required", recoveryHref: `/login?next=${encodeURIComponent(`/pets/${petId}/album/new`)}` };

  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name, birthday, adoption_date").eq("owner_user_id", user.id).order("created_at", { ascending: true });
  if (petsError || !pets) return { error: "ペット情報を取得できませんでした。" };
  if (!pets.some((item) => item.id === petId)) return { error: "ペット情報を取得できませんでした。" };

  let setup;
  const intentId = String(formData.get("intentId") ?? "");
  const autoResumeTriggered = formData.get("autoResumeTriggered") === "true";
  const requestedAt = formData.get("requestedAt") ? new Date(String(formData.get("requestedAt"))) : new Date();
  if ((intentId && !UUID_PATTERN.test(intentId)) || !Number.isFinite(requestedAt.getTime()) || Date.now() - requestedAt.getTime() >= ALBUM_INTENT_TTL_MS || requestedAt.getTime() - Date.now() > 60_000) {
    return { error: "作成条件をもう一度確認してください。", status: "action_required" };
  }
  try {
    setup = parseAlbumSetup(
      formData,
      pets.map((pet) => pet.id),
      requestedAt,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "作成条件を確認してください。" };
  }
  const selectedPets = pets.filter((pet) => setup.petIds.includes(pet.id));
  const anchorPet = selectedPets.find((pet) => pet.id === petId) ?? selectedPets[0];
  const { from: periodFrom, to: periodTo } = setup;
  const intentKey = JSON.stringify({ petIds: [...setup.petIds].sort(), pages: setup.pageCount, start: periodFrom.toISOString(), end: periodTo.toISOString() });
  if (intentId) {
    const { data: previous, error: previousError } = await supabase.from("albums").select("id,created_at,pet_id").eq("id", intentId).eq("owner_user_id", user.id).maybeSingle();
    if (previousError) return { error: "作成状況を確認しています。", status: "retryable" };
    if (previous) {
      const { data: draft, error: draftError } = await supabase.from("album_draft_versions").select("id,generation_metadata").eq("album_id", previous.id).eq("is_active", true).maybeSingle();
      if (draftError) return { error: "作成状況を確認しています。", status: "retryable" };
      if (draft) {
        const metadata = draft.generation_metadata as Record<string, unknown> | null;
        const { data: cover } = await supabase.from("album_draft_covers").select("id").eq("draft_version_id", draft.id).maybeSingle();
        if (metadata?.generation_intent_key === intentKey && cover) {
          logAlbumAutoResume({ intentPresent: true, readinessStatus: "ready", eligibleReady: null, requiredEligible: requiredEligiblePhotos(setup.pageCount), autoResumeTriggered, generationStarted: false, generationCompleted: true, duplicateSuppressed: false });
          return { error: null, status: "complete", previewHref: `/pets/${previous.pet_id}/album/${previous.id}?view=preview` };
        }
        if (metadata?.generation_intent_key !== intentKey) return { error: "作成条件が変更されています。条件を確認してください。", status: "action_required" };
      }
      const status = Date.now() - Date.parse(previous.created_at) < 150_000 ? "in_progress" : "failed";
      logAlbumAutoResume({ intentPresent: true, readinessStatus: null, eligibleReady: null, requiredEligible: requiredEligiblePhotos(setup.pageCount), autoResumeTriggered, generationStarted: false, generationCompleted: false, duplicateSuppressed: status === "in_progress" });
      return { error: "アルバムの作成状況を確認しています。", status };
    }
  }
  timing.end("02_pet_ownership_validation", selectedPets.length);
  timing.context({ selectedPetIds: setup.petIds, petCount: selectedPets.length, periodPreset: ["3months", "6months", "1year", "all", "custom"].includes(String(formData.get("period"))) ? String(formData.get("period")) : "3months", periodStart: periodFrom.toISOString(), periodEnd: periodTo.toISOString(), requestedBodyPages: setup.pageCount });

  timing.start("03_source_photo_query", selectedPets.length);
  let sourceQueryCount = 0;
  const photoResults = await Promise.all(
    selectedPets.map(async (selectedPet) => {
      const pageSize = 200;
      const petPhotos = [];
      for (let offset = 0; ; offset += pageSize) {
        sourceQueryCount++;
        const result = await supabase
          .from("photos")
          .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at, favorite, caption, updated_at, content_hash")
          .eq("pet_id", selectedPet.id)
          .eq("uploader_user_id", user.id)
          .gte("timeline_at", periodFrom.toISOString())
          .lte("timeline_at", periodTo.toISOString())
          .order("timeline_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (result.error) return { error: result.error, data: null };
        petPhotos.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < pageSize) {
          return { error: null, data: petPhotos };
        }
      }
    }),
  );
  if (photoResults.some((result) => result.error)) {
    return { error: "写真の取得中にエラーが発生しました。" };
  }
  const rawPhotos = photoResults.flatMap((result) => result.data ?? []);
  timing.end("03_source_photo_query", rawPhotos.length);

  if (rawPhotos.length === 0) {
    return { error: "この期間に写真がありません。別の期間を選んでください。" };
  }

  timing.start("04_intelligence_metadata_query", rawPhotos.length);
  let inputs;
  try {
    inputs = await loadStoredGenerationInputs(supabase as unknown as SupabaseClient, rawPhotos);
  } catch {
    timing.finish("failed");
    return { error: "写真の解析情報を取得できませんでした。" };
  }
  const queueRows: Array<{ photo_id: string; status: string; attempts: number; error_code: string | null }> = [];
  let queueQueryCount = 0;
  let queueStatusAvailable = true;
  for (let offset = 0; offset < rawPhotos.length; offset += 200) {
    const result = await supabase
      .from("photo_ai_analyses")
      .select("photo_id,status,attempts,error_code")
      .in(
        "photo_id",
        rawPhotos.slice(offset, offset + 200).map((photo) => photo.id),
      );
    queueQueryCount++;
    if (result.error) {
      queueStatusAvailable = false;
      break;
    }
    queueRows.push(...(result.data ?? []));
  }
  const queueByPhoto = new Map(queueRows.map((row) => [row.photo_id, row]));
  timing.end("04_intelligence_metadata_query", rawPhotos.length);
  timing.start("07_missing_analysis_intelligence", rawPhotos.length);
  timing.end("07_missing_analysis_intelligence", inputs.missingIntelligenceCount + inputs.missingGeometryCount);

  const candidates: AlbumCandidate[] = rawPhotos.map((photo) => {
    return {
      ...photo,
      timeline_at: photo.timeline_at ?? photo.created_at,
      activity: null,
      scene: null,
      emotion: null,
      tags: null,
    };
  });

  const scopedCandidates = scopeAlbumPhotos(
    candidates,
    selectedPets.map((item) => item.id),
    periodFrom,
    periodTo,
  );
  const candidateById = new Map(scopedCandidates.map((photo) => [photo.id, photo]));
  const rankedPhotos: EditorialPhoto[] = [];
  timing.start("05_grouping_preparation", scopedCandidates.length);
  const groupsByPet = selectedPets.map((pet) => ({ pet, groups: buildSceneGroups(inputs.grouping.filter((photo) => candidateById.get(photo.photoId)?.pet_id === pet.id)) }));
  timing.end(
    "05_grouping_preparation",
    groupsByPet.reduce((sum, item) => sum + item.groups.length, 0),
  );
  timing.start("06_best_shot_preparation", scopedCandidates.length);
  for (const { pet, groups } of groupsByPet) {
    for (const group of groups) {
      const selection = selectBestShot(
        {
          id: group.id,
          scene: group.scene,
          activity: group.activity,
          tags: group.tags,
          groupConfidence: group.groupConfidence,
          warnings: group.warnings,
          visualSimilarity: Object.fromEntries(group.pairs.map((pair) => [visualPairKey(pair.photoA, pair.photoB), pair.visualScore])),
          geometrySimilarity: Object.fromEntries(group.pairs.map((pair) => [visualPairKey(pair.photoA, pair.photoB), pair.geometryScore])),
        },
        group.members.map((member) => ({ photoId: member.photoId, relativeUniqueness: member.relativeUniqueness, intelligence: inputs.grouping.find((photo) => photo.photoId === member.photoId)?.intelligence ?? null, sharpness: inputs.sharpness.get(member.photoId) ?? 62 })),
      );
      for (const candidate of selection.ranking) {
        const photo = candidateById.get(candidate.photoId);
        if (photo) rankedPhotos.push({ photoId: photo.id, petId: pet.id, groupId: group.id, timeline: photo.timeline_at, scene: group.scene, activity: group.activity, candidate, confidence: selection.confidence });
      }
    }
  }
  timing.end("06_best_shot_preparation", rankedPhotos.length);
  const readySourceIds = new Set(inputs.grouping.map((photo) => photo.photoId));
  const excludedFailedIds = new Set(
    [...inputs.preparationByPhoto]
      .filter(([photoId, preparation]) => {
        if (readySourceIds.has(photoId) || !queueStatusAvailable) return false;
        const queue = queueByPhoto.get(photoId);
        return isTerminalAnalysisFailure(queue ?? { status: "", attempts: 0 }) || (queue?.status === "completed" && preparation.failed);
      })
      .map(([photoId]) => photoId),
  );
  const excludedFailedCount = excludedFailedIds.size;
  const pendingSourceCount = queueStatusAvailable ? Math.max(0, rawPhotos.length - readySourceIds.size - excludedFailedCount) : Math.max(0, rawPhotos.length - readySourceIds.size);
  const eligibleReady = new Set(rankedPhotos.filter((photo) => photo.candidate.role !== "alternate" && photo.candidate.scores.technical >= 25).map((photo) => photo.photoId)).size;
  const requiredEligible = requiredEligiblePhotos(setup.pageCount);
  const proceededWithFailedExcluded = excludedFailedCount > 0 && eligibleReady >= requiredEligible;
  timing.counts({
    eligiblePhotoCount: rawPhotos.length,
    selectedSourcePhotoCount: 0,
    existingIntelligenceCount: inputs.existingIntelligenceCount,
    missingIntelligenceCount: inputs.missingIntelligenceCount,
    cropAnalysisRequiredCount: inputs.missingGeometryCount,
    layoutPlanningSpreadCount: requiredEligible,
    metadataQueryCount: inputs.metadataQueryCount,
    legacyTechnicalFallbackCount: inputs.legacyTechnicalFallbackCount,
    failedAnalysisCount: excludedFailedCount,
    eligibleReady,
    requiredEligible,
    excludedFailedCount,
    proceededWithFailedExcluded,
    queueQueryCount,
    queueStatusAvailable,
  });
  const capacityState = albumCapacityState(eligibleReady, requiredEligible, pendingSourceCount);
  logAlbumAutoResume({ intentPresent: Boolean(intentId), readinessStatus: capacityState, eligibleReady, requiredEligible, autoResumeTriggered, generationStarted: capacityState === "ready", generationCompleted: false, duplicateSuppressed: false });
  if (capacityState !== "ready") {
    if (capacityState === "preparing") {
      timing.finish("analysis_pending");
      return { error: null, status: "preparing" };
    }
    timing.finish("failed");
    return { error: `${setup.pageCount}ページには、あと${requiredEligible - eligibleReady}枚の写真が必要です。写真を追加するか、ページ数を変更できます。`, status: "action_required" };
  }
  timing.start("08_photo_ranking_selection", rankedPhotos.length);
  let plan;
  try {
    plan = planEditorialAlbum(rankedPhotos, setup.pageCount);
  } catch {
    return { error: "この条件では写真が足りません。写真を追加するか、ページ数を変更してください。", status: "action_required" };
  }
  timing.end("08_photo_ranking_selection", plan.selected.length);
  timing.counts({
    eligiblePhotoCount: rawPhotos.length,
    selectedSourcePhotoCount: plan.selected.length,
    existingIntelligenceCount: inputs.existingIntelligenceCount,
    missingIntelligenceCount: 0,
    cropAnalysisRequiredCount: 0,
    layoutPlanningSpreadCount: plan.spreads.length,
    metadataQueryCount: inputs.metadataQueryCount,
    legacyTechnicalFallbackCount: inputs.legacyTechnicalFallbackCount,
    failedAnalysisCount: excludedFailedCount,
    eligibleReady,
    requiredEligible,
    excludedFailedCount,
    proceededWithFailedExcluded,
    queueQueryCount,
    queueStatusAvailable,
  });
  const layoutPhotos: LayoutPhotoInput[] = [];
  timing.start("09_layout_planning", plan.spreads.length);
  const previews = await createPhotoPreviewUrls(
    supabase,
    plan.selected.map((photo) => candidateById.get(photo.photoId)!),
    true,
    false,
    user.id,
  );
  for (const photo of plan.selected) {
    const analysis = inputs.geometry.get(photo.photoId);
    const preview = previews.get(photo.photoId);
    if (!analysis || !preview) return { error: "写真の表示を確認しています。", status: "retryable" };
    layoutPhotos.push({ photoId: photo.photoId, petId: photo.petId, analysis, imageUrl: preview, previewUrl: preview, bestShot: { candidate: photo.candidate, confidence: photo.confidence }, captionAvailable: true });
  }
  const textForStories = (stories: typeof plan.spreads) =>
    Object.fromEntries(
      stories.map((story) => {
        const photo = candidateById.get(story.photoIds[0]);
        return [story.id, photo ? editorialPageText(photo.timeline_at, photo.caption) : ""];
      }),
    );
  let textByStory = textForStories(plan.spreads);
  const minimumUniquePhotoCount = requiredEligible;
    const availablePhotoCountByPet = Object.fromEntries(setup.petIds.map((petId) => [
      petId,
      new Set(rankedPhotos.filter((photo) => photo.petId === petId && photo.candidate.role !== "alternate" && photo.candidate.scores.technical >= 25).map((photo) => photo.photoId)).size,
    ]));
  let editorial;
  try {
    editorial = buildEditorialDraft(
      plan.spreads,
      layoutPhotos,
      textByStory,
      (event, itemCount) => {
        if (event === "started") timing.start("11_whole_album_rhythm_audit", itemCount);
        else timing.end("11_whole_album_rhythm_audit", itemCount);
      },
      {},
      {},
      minimumUniquePhotoCount,
      eligibleReady,
      availablePhotoCountByPet,
    );
  } catch (error) {
    if (!(error instanceof EditorialGenerationError) || !error.unrecoveredSpreadIndices.length) {
      if (error instanceof EditorialGenerationError && error.recoveryStats) logAlbumLayoutRecovery(timing, plan.spreads.length, error.recoveryStats);
      return { error: "この条件ではアルバムを完成できませんでした。別の写真を見直すか、写真を追加できます。", status: "action_required", recoveryReason: "layout" };
    }
    const currentPhotoIds = new Set(error.currentPhotoIds);
    const replacementPhotoIdsBySpread: Record<string, string[]> = {};
    const replacementMethodByPhotoId: Record<string, ReplacementMethod> = {};
    const replacementIds: string[] = [];
    const replacementIdSet = new Set<string>();
    const replacementFunnelBySpread = new Map<number, Partial<SpreadLayoutRecoveryDiagnostic>>();
    const rankedById = new Map(rankedPhotos.map((photo) => [photo.photoId, photo]));
    const albumPetIds = new Set([...currentPhotoIds].flatMap((photoId) => {
      const petId = rankedById.get(photoId)?.petId;
      return petId ? [petId] : [];
    }));
    const usedByPet = new Map<string, number>();
    for (const photoId of currentPhotoIds) {
      const petId = rankedById.get(photoId)?.petId;
      if (petId) usedByPet.set(petId, (usedByPet.get(petId) ?? 0) + 1);
    }
    for (const spreadIndex of error.unrecoveredSpreadIndices) {
      const story = plan.spreads[spreadIndex];
      if (!story) continue;
      const funnel: Partial<SpreadLayoutRecoveryDiagnostic> = {
        unusedPoolCount: rankedPhotos.filter((photo) => !currentPhotoIds.has(photo.photoId)).length,
        duplicateRejectedCount: rankedPhotos.filter((photo) => currentPhotoIds.has(photo.photoId) || replacementIdSet.has(photo.photoId)).length,
        petCompatibilityRejectedCount: 0,
        sceneRejectedCount: 0,
        chronologicalRejectedCount: 0,
        qualityRejectedCount: 0,
        sourceClippingRejectedCount: 0,
        cropSafetyRejectedCount: 0,
        candidateBudgetRejectedCount: 0,
        otherEligibilityRejectedCount: 0,
        finalReplacementCandidateCount: 0,
        compatiblePetGroupingCandidateCount: 0,
      };
      const replacePhotoId = story.secondaryPhotoIds.at(-1) ?? story.primaryPhotoIds[0];
      const replacedPhoto = replacePhotoId ? rankedById.get(replacePhotoId) : undefined;
      const storyPetIds = new Set(story.photoIds.flatMap((photoId) => {
        const petId = rankedById.get(photoId)?.petId;
        return petId ? [petId] : [];
      }));
      const availablePetCounts = availablePhotoCountByPet;
      const options: Array<{ photo: EditorialPhoto; category: number; timeDistance: number }> = [];
      for (const photo of rankedPhotos) {
        if (currentPhotoIds.has(photo.photoId) || replacementIdSet.has(photo.photoId)) continue;
        if (!setup.petIds.includes(photo.petId)) {
          funnel.petCompatibilityRejectedCount = (funnel.petCompatibilityRejectedCount ?? 0) + 1;
          continue;
        }
        if (photo.candidate.scores.technical < 25) {
          funnel.qualityRejectedCount = (funnel.qualityRejectedCount ?? 0) + 1;
          continue;
        }
        const analysis = inputs.geometry.get(photo.photoId);
        if (!analysis) {
          funnel.otherEligibilityRejectedCount = (funnel.otherEligibilityRejectedCount ?? 0) + 1;
          continue;
        }
        if (sourceSubjectClipped({ analysis })) {
          funnel.sourceClippingRejectedCount = (funnel.sourceClippingRejectedCount ?? 0) + 1;
          continue;
        }
        const petUsedCount = usedByPet.get(replacedPhoto?.petId ?? "") ?? 0;
        if (replacedPhoto && photo.petId !== replacedPhoto.petId && petUsedCount <= 1 && (availablePetCounts[replacedPhoto.petId] ?? petUsedCount) > petUsedCount) {
          funnel.petCompatibilityRejectedCount = (funnel.petCompatibilityRejectedCount ?? 0) + 1;
          continue;
        }
        const timeDistance = Math.abs(Date.parse(photo.timeline) - Date.parse(story.startedAt));
        const category = story.sceneIds.includes(photo.groupId) ? 0
          : storyPetIds.has(photo.petId) ? 1
            : albumPetIds.has(photo.petId) ? 2
              : timeDistance <= 30 * 24 * 60 * 60 * 1000 ? 3 : 4;
        options.push({ photo, category, timeDistance });
      }
      options.sort((a, b) => a.category - b.category || b.photo.candidate.scores.overall - a.photo.candidate.scores.overall || b.photo.candidate.scores.sceneRepresentativeness - a.photo.candidate.scores.sceneRepresentativeness || a.timeDistance - b.timeDistance || a.photo.photoId.localeCompare(b.photo.photoId));
      const idsForSpread: string[] = [];
      for (const { photo, category } of options) {
        if (replacementIds.length >= ALBUM_DRAFT_CONFIG.recovery.globalReplacementCandidatesPerAlbum || idsForSpread.length >= ALBUM_DRAFT_CONFIG.recovery.bestShotReplacementCandidates) {
          funnel.candidateBudgetRejectedCount = (funnel.candidateBudgetRejectedCount ?? 0) + 1;
          continue;
        }
        replacementIdSet.add(photo.photoId);
        replacementIds.push(photo.photoId);
        idsForSpread.push(photo.photoId);
        replacementMethodByPhotoId[photo.photoId] = category === 0 ? "same_scene_replacement"
          : category === 1 ? "same_pet_replacement"
            : category === 2 ? "compatible_pet_replacement"
              : category === 3 ? "chronological_replacement" : "global_replacement";
      }
      funnel.finalReplacementCandidateCount = idsForSpread.length;
      replacementFunnelBySpread.set(spreadIndex, funnel);
      replacementPhotoIdsBySpread[story.id] = idsForSpread;
    }
    const replacementSources = replacementIds.map((photoId) => candidateById.get(photoId)!).filter(Boolean);
    const replacementPreviews = replacementSources.length ? await createPhotoPreviewUrls(supabase, replacementSources, true, false, user.id) : new Map();
    const replacementInputs: LayoutPhotoInput[] = replacementIds.flatMap((photoId) => {
      const analysis = inputs.geometry.get(photoId);
      const preview = replacementPreviews.get(photoId);
      const ranked = rankedPhotos.find((photo) => photo.photoId === photoId);
      if (!analysis || !preview || !ranked) return [];
      return [{ photoId, petId: ranked.petId, analysis, imageUrl: preview, previewUrl: preview, bestShot: { candidate: ranked.candidate, confidence: ranked.confidence }, captionAvailable: true }];
    });
    const replacementInputsById = new Set(replacementInputs.map((photo) => photo.photoId));
    for (const [spreadIndex, funnel] of replacementFunnelBySpread) {
      const spread = plan.spreads[spreadIndex];
      const spreadCandidateIds = spread ? replacementPhotoIdsBySpread[spread.id] ?? [] : [];
      const missingAssets = spreadCandidateIds.filter((photoId) => !replacementInputsById.has(photoId)).length;
      funnel.otherEligibilityRejectedCount = (funnel.otherEligibilityRejectedCount ?? 0) + missingAssets;
      funnel.finalReplacementCandidateCount = spreadCandidateIds.length - missingAssets;
    }
    const applyReplacementFunnel = (stats?: LayoutRecoveryStats) => {
      if (!stats) return;
      let eligibleCount = 0;
      let rejectedCount = 0;
      for (const [spreadIndex, funnel] of replacementFunnelBySpread) {
        const diagnostic = stats.spreadDiagnostics[spreadIndex];
        if (!diagnostic) continue;
        for (const key of ["unusedPoolCount", "duplicateRejectedCount", "petCompatibilityRejectedCount", "sceneRejectedCount", "chronologicalRejectedCount", "qualityRejectedCount", "sourceClippingRejectedCount", "cropSafetyRejectedCount", "candidateBudgetRejectedCount", "otherEligibilityRejectedCount", "compatiblePetGroupingCandidateCount"] as const) {
          diagnostic[key] = Math.max(diagnostic[key], funnel[key] ?? 0);
        }
        diagnostic.finalReplacementCandidateCount = Math.max(diagnostic.finalReplacementCandidateCount, funnel.finalReplacementCandidateCount ?? 0);
        eligibleCount += diagnostic.finalReplacementCandidateCount;
        rejectedCount += diagnostic.duplicateRejectedCount + diagnostic.petCompatibilityRejectedCount + diagnostic.sceneRejectedCount + diagnostic.chronologicalRejectedCount + diagnostic.qualityRejectedCount + diagnostic.sourceClippingRejectedCount + diagnostic.cropSafetyRejectedCount + diagnostic.candidateBudgetRejectedCount + diagnostic.otherEligibilityRejectedCount;
      }
      stats.unusedReplacementEligibleCount = eligibleCount;
      stats.unusedReplacementRejectedCount = rejectedCount;
    };
    try {
      editorial = buildEditorialDraft(
        plan.spreads,
        [...layoutPhotos, ...replacementInputs],
        textByStory,
        (event, itemCount) => {
          if (event === "started") timing.start("11_whole_album_rhythm_audit", itemCount);
          else timing.end("11_whole_album_rhythm_audit", itemCount);
        },
        replacementPhotoIdsBySpread,
        replacementMethodByPhotoId,
        minimumUniquePhotoCount,
        eligibleReady,
        availablePhotoCountByPet,
      );
      applyReplacementFunnel(editorial.recovery);
      const selectedEditorial = new Map(rankedPhotos.map((photo) => [photo.photoId, photo]));
      plan.selected = editorial.selectedPhotoIds.map((photoId) => selectedEditorial.get(photoId)).filter((photo): photo is EditorialPhoto => Boolean(photo));
      textByStory = textForStories(editorial.stories);
    } catch (recoveryError) {
      const stats = recoveryError instanceof EditorialGenerationError ? recoveryError.recoveryStats : error.recoveryStats;
      applyReplacementFunnel(stats);
      if (stats) logAlbumLayoutRecovery(timing, plan.spreads.length, stats);
      return { error: "この条件ではアルバムを完成できませんでした。別の写真で組み直すか、写真を追加できます。", status: "action_required" };
    }
  }
  logAlbumLayoutRecovery(timing, plan.spreads.length, editorial.recovery);
  plan.spreads = editorial.stories;
  timing.end("09_layout_planning", editorial.spreads.length);
  timing.measured("10_crop_calculation", editorial.performance.cropStartedAt, editorial.performance.cropDurationMs, editorial.performance.cropItemCount);
  timing.work({ sourceQueryCount, analysisQueryCount: inputs.metadataQueryCount, cropCalculatedCount: editorial.performance.cropItemCount, cropReusedCount: editorial.performance.cropReusedCount, layoutCandidateCount: editorial.performance.layoutCandidateCount, visionCallCount: 0, originalDownloadCount: 0 });
  const persistableSpreads = editorial.spreads.map(toPersistableSpread);
  const selected = plan.selected.map((photo) => candidateById.get(photo.photoId)!);
  const coverPhotoId = [...plan.selected].sort((a, b) => b.candidate.scores.overall - a.candidate.scores.overall)[0].photoId;

  // Generate title
  const label = setup.label;
  const petNames = selectedPets.map((item) => item.name);
  const displayPetName = petNames.join("・");
  const title = generateFallbackTitle(displayPetName, periodFrom, periodTo);

  // Insert album
  if (timing.budgetExceeded()) {
    timing.finish("failed");
    return { error: "アルバムの作成に時間がかかっています。", status: "retryable" };
  }
  timing.start("12_album_row_creation", 1);
  const { data: album, error: albumError } = await supabase
    .from("albums")
    .insert({
      ...(intentId ? { id: intentId } : {}),
      owner_user_id: user.id,
      pet_id: anchorPet.id,
      title,
      status: "draft",
      period_from: periodFrom.toISOString(),
      period_to: periodTo.toISOString(),
    })
    .select("id")
    .single();

  if (albumError || !album) {
    const duplicateSuppressed = albumError?.code === "23505";
    logAlbumAutoResume({ intentPresent: Boolean(intentId), readinessStatus: "ready", eligibleReady, requiredEligible, autoResumeTriggered, generationStarted: false, generationCompleted: false, duplicateSuppressed });
    return { error: "作成状況を確認しています。", status: duplicateSuppressed ? "in_progress" : "retryable" };
  }
  timing.end("12_album_row_creation", 1);
  timing.start("13_spread_page_persistence", persistableSpreads.length);

  const otherPets = selectedPets.filter((item) => item.id !== anchorPet.id);
  if (otherPets.length > 0) {
    const albumPetsClient = supabase as unknown as SupabaseClient;
    const { error: petLinksError } = await albumPetsClient.from("album_pets").insert(otherPets.map((item) => ({ album_id: album.id, pet_id: item.id })));
    if (petLinksError) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムに含めるペットの登録に失敗しました。" };
    }
  }

  // Insert album_photos
  const albumPhotosData = selected.map((photo, index) => ({
    album_id: album.id,
    photo_id: photo.id,
    position: index,
    selected_by: "ai" as const,
  }));

  const { error: photosInsertError } = await supabase.from("album_photos").insert(albumPhotosData);

  if (photosInsertError) {
    // Cleanup orphaned album
    await supabase.from("albums").delete().eq("id", album.id);
    return { error: "写真の登録に失敗しました。もう一度お試しください。" };
  }

  const { error: coverError } = await supabase.from("albums").update({ cover_photo_id: coverPhotoId }).eq("id", album.id).eq("owner_user_id", user.id);
  if (coverError) {
    await supabase.from("albums").delete().eq("id", album.id);
    return { error: "アルバムの表紙を登録できませんでした。もう一度お試しください。" };
  }

  {
    const composition = buildAlbumCompositionPlan(editorial.spreads, {
      title,
      petName: displayPetName,
      period: formatAlbumPeriodLabels(periodFrom.toISOString(), periodTo.toISOString()).coverDateLabel,
      periodStart: periodFrom.toISOString(),
      periodEnd: periodTo.toISOString(),
      events: [],
    });
    composition.items = composition.items.filter((item) => item.kind === "spread");
    const savedDraft = await supabase.rpc("save_album_draft_version", {
      p_album_id: album.id,
      p_payload: buildDraftSavePayload(persistableSpreads, [], composition, {
        editorial_version: EDITORIAL_VERSION,
        generation_intent_key: intentId ? intentKey : null,
        requested_body_pages: setup.pageCount,
        selected_pet_ids: setup.petIds,
        rhythm_audit: editorial.audit,
        rhythm_audit_before: editorial.beforeAudit,
        generation_photo_ids: scopedCandidates.map((photo) => photo.id).sort(),
      }) as unknown as Json,
    });
    if (savedDraft.error) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムの初稿を保存できませんでした。もう一度お試しください。" };
    }
    const { data: savedSpreads, error: savedSpreadsError } = await supabase.from("album_draft_spreads").select("id, story_spread_id").eq("draft_version_id", String(savedDraft.data));
    if (savedSpreadsError || !savedSpreads || savedSpreads.length !== requiredEligible) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムのページを確認できませんでした。" };
    }
    const textRows = savedSpreads.filter((spread) => textByStory[spread.story_spread_id]).map((spread) => ({ draft_spread_id: spread.id, slot_id: "gutter-note", kind: "caption", ai_text: textByStory[spread.story_spread_id], ai_style_id: "editorial", override_mode: "inherit" }));
    if (textRows.length) {
      const { error: textError } = await supabase.from("album_draft_text_elements").insert(textRows);
      if (textError) {
        await supabase.from("albums").delete().eq("id", album.id);
        return { error: "日付・キャプションを保存できませんでした。もう一度お試しください。" };
      }
    }
    timing.end("13_spread_page_persistence", persistableSpreads.length);
    timing.start("14_cover_persistence", 1);
    const savedCover = await loadCoverEditor(album.id, {
      aiPhotoId: coverPhotoId,
      aiTitle: title,
      aiSubtitle: label,
    });
    if (!savedCover.ok) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムの表紙を準備できませんでした。もう一度お試しください。" };
    }
    timing.end("14_cover_persistence", 1);
  }

  timing.start("15_metadata_persistence", 1);
  const { data: activeVersion } = await supabase.from("album_draft_versions").select("id").eq("album_id", album.id).eq("is_active", true).maybeSingle();
  await recordAlbumAnalyticsEvent({
    supabase,
    userId: user.id,
    albumId: album.id,
    draftVersionId: activeVersion?.id ?? null,
    eventType: "album_generated",
    eventKey: activeVersion?.id ?? album.id,
    eventData: { photo_count: selected.length, pet_count: selectedPets.length, spread_count: persistableSpreads.length },
  });
  timing.end("15_metadata_persistence", 1);
  timing.start("16_redirect_preparation", 1);
  timing.end("16_redirect_preparation", 1);
  timing.finish("ready");
  logAlbumAutoResume({ intentPresent: Boolean(intentId), readinessStatus: "ready", eligibleReady, requiredEligible, autoResumeTriggered, generationStarted: true, generationCompleted: true, duplicateSuppressed: false });
  if (intentId) return { error: null, status: "complete", previewHref: `/pets/${anchorPet.id}/album/${album.id}?view=preview` };
  redirect(`/pets/${anchorPet.id}/album/${album.id}?view=preview`);
}
