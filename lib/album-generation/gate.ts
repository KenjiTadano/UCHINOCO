import type { AlbumCandidatePeriod } from "../album-candidates/types.ts";
import type { AlbumSpreadDraft } from "../album-draft/types.ts";
import { instantInPeriod } from "../album-candidates/period.ts";
import { ALBUM_GENERATION_CONFIG, ALBUM_GENERATION_VERSION } from "./config.ts";
import type {
  AlbumGenerationQuality,
  AlbumGenerationResult,
  GenerationCounts,
  PhotoTrace,
  PrimaryChain,
  QualityGrade,
  StageSummary,
} from "./types.ts";

export type AuditGroup = {
  groupId: string;
  photoIds: string[];
  warnings: string[];
  startedAt?: string;
};

export type AuditBestShot = {
  groupId: string;
  primaryPhotoId: string;
  secondaryPhotoId?: string;
  confidence: number;
  warnings: string[];
};

export type AuditCandidate = {
  groupId: string;
  primaryPhotoId: string;
  secondaryPhotoId?: string;
  startedAt: string;
  sceneScore: number;
  selectionConfidence: number;
  activity?: string;
  warnings: string[];
};

export type AuditStorySpread = {
  id: string;
  photoIds: string[];
  primaryPhotoIds: string[];
  secondaryPhotoIds: string[];
  storyType: string;
  recommendedDensity: string;
  coherenceScore: number;
  importance: number;
  startedAt: string;
  activity?: string;
};

export type AuditStages = AlbumGenerationResult["stages"];

export type AlbumGenerationAuditInput = {
  petId: string;
  period: AlbumCandidatePeriod;
  libraryPhotoIds: string[];
  periodPhotoIds: string[];
  groups: AuditGroup[];
  bestShots: AuditBestShot[];
  candidates: AuditCandidate[];
  chronology: number;
  storySpreads: AuditStorySpread[];
  drafts: AlbumSpreadDraft[];
  stages?: { [K in keyof AuditStages]?: Partial<StageSummary> };
  intelligence?: {
    failed: boolean;
    usedFallback: boolean;
    lowQualityPhotoIds?: string[];
  };
  /** Photos whose preview cannot be shown. */
  brokenPhotoIds?: string[];
};

function clamp(n: number) {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function stage(partial: Partial<StageSummary> & Pick<StageSummary, "inputCount" | "outputCount">): StageSummary {
  const warnings = partial.warnings ?? [];
  const status = partial.status ?? (warnings.length > 0 ? "warning" : "ok");
  return {
    status,
    inputCount: partial.inputCount,
    outputCount: partial.outputCount,
    warnings,
    durationMs: partial.durationMs,
    cache: partial.cache,
    cacheSource: partial.cacheSource,
  };
}

function areaOf(draft: AlbumSpreadDraft, photoId: string) {
  const assignment = draft.assignments.find((item) => item.photoId === photoId);
  if (!assignment) return 0;
  return assignment.placement.rect.w * assignment.placement.rect.h;
}

function emptyOpposite(draft: AlbumSpreadDraft) {
  if (draft.assignments.length === 0) return false;
  const sides = new Set(draft.assignments.map((assignment) => assignment.placement.side));
  return sides.size === 1;
}

export function assessAlbumGeneration(input: AlbumGenerationAuditInput): AlbumGenerationResult {
  const blocking: string[] = [];
  const nonBlocking: string[] = [];
  const intelligence = input.intelligence ?? { failed: false, usedFallback: false, lowQualityPhotoIds: [] };
  const broken = new Set(input.brokenPhotoIds ?? []);

  const periodIds = new Set(input.periodPhotoIds);
  const selectedPhotos = input.candidates.flatMap((scene) =>
    [scene.primaryPhotoId, scene.secondaryPhotoId].filter((id): id is string => Boolean(id)),
  );
  const draftPhotos = input.drafts.flatMap((draft) => draft.assignments.map((assignment) => assignment.photoId));

  if (input.libraryPhotoIds.length === 0 || input.periodPhotoIds.length === 0) blocking.push("NO_PHOTOS");
  if (input.groups.length === 0 && input.periodPhotoIds.length > 0) blocking.push("NO_VALID_SCENES");
  if (input.storySpreads.length > 0 && input.drafts.length === 0) blocking.push("NO_LAYOUT_AVAILABLE");
  if (input.drafts.some((draft) => draft.status === "unusable" || !draft.layoutId)) blocking.push("UNUSABLE_FRAME");

  const seen = new Map<string, string>();
  for (const draft of input.drafts) {
    const local = new Set<string>();
    for (const assignment of draft.assignments) {
      if (local.has(assignment.photoId) || seen.has(assignment.photoId)) blocking.push("DUPLICATE_PHOTO_ASSIGNMENT");
      local.add(assignment.photoId);
      seen.set(assignment.photoId, draft.spreadId);
      if (!periodIds.has(assignment.photoId)) blocking.push("PERIOD_MISMATCH");
      if (broken.has(assignment.photoId) || !assignment.previewUrl) blocking.push("BROKEN_IMAGE");
      if (assignment.matchTier === "UNUSABLE") blocking.push("UNUSABLE_FRAME");
      if (assignment.safety.faceSafety < ALBUM_GENERATION_CONFIG.crop.face) blocking.push("FACE_CROP_UNSAFE");
      if (assignment.safety.headSafety < ALBUM_GENERATION_CONFIG.crop.head) blocking.push("HEAD_CROP_UNSAFE");
      if (assignment.matchTier === "FALLBACK") nonBlocking.push("FALLBACK_CROP");
    }
    if (emptyOpposite(draft)) {
      nonBlocking.push("EMPTY_OPPOSITE_PAGE");
      if (
        draft.assignments.length === 1 &&
        draft.story.importance >= ALBUM_GENERATION_CONFIG.largerSingleImportance
      ) {
        nonBlocking.push("SUGGEST_LARGER_SINGLE");
      }
    }
  }

  for (const scene of input.candidates) {
    if (!periodIds.has(scene.primaryPhotoId) || !instantInPeriod(scene.startedAt, input.period)) {
      blocking.push("PERIOD_MISMATCH");
    }
    if (!draftPhotos.includes(scene.primaryPhotoId)) blocking.push("MISSING_PRIMARY");
    if (scene.secondaryPhotoId && !periodIds.has(scene.secondaryPhotoId)) blocking.push("PERIOD_MISMATCH");
    if (scene.selectionConfidence < ALBUM_GENERATION_CONFIG.selection.lowConfidence) {
      nonBlocking.push("LOW_SELECTION_CONFIDENCE");
    }
  }

  for (const shot of input.bestShots) {
    const scene = input.candidates.find((candidate) => candidate.groupId === shot.groupId);
    if (!scene) continue;
    if (scene.primaryPhotoId !== shot.primaryPhotoId) nonBlocking.push("PRIMARY_ROLE_CHANGED");
    if (shot.secondaryPhotoId && scene.secondaryPhotoId && shot.secondaryPhotoId !== scene.secondaryPhotoId) {
      nonBlocking.push("SECONDARY_ROLE_CHANGED");
    }
  }

  for (const scene of input.candidates) {
    if (!scene.secondaryPhotoId) continue;
    const primarySpread = input.drafts.find((draft) =>
      draft.assignments.some((assignment) => assignment.photoId === scene.primaryPhotoId),
    );
    const secondarySpread = input.drafts.find((draft) =>
      draft.assignments.some((assignment) => assignment.photoId === scene.secondaryPhotoId),
    );
    if (!secondarySpread) nonBlocking.push("SECONDARY_DROPPED");
    else if (!primarySpread || secondarySpread.spreadId !== primarySpread.spreadId) nonBlocking.push("SECONDARY_SPLIT");
    else if (areaOf(secondarySpread, scene.secondaryPhotoId) > areaOf(primarySpread, scene.primaryPhotoId) * 1.05) {
      nonBlocking.push("SECONDARY_DOMINATES");
    }
  }

  if (input.groups.some((group) => group.warnings.includes("AMBIGUOUS_GROUP") || group.warnings.includes("GROUP_AMBIGUOUS"))) {
    nonBlocking.push("GROUP_AMBIGUOUS");
  }
  if (input.storySpreads.some((spread) => spread.coherenceScore < ALBUM_GENERATION_CONFIG.story.lowCoherence)) {
    nonBlocking.push("LOW_STORY_COHERENCE");
  }
  if (intelligence.lowQualityPhotoIds && intelligence.lowQualityPhotoIds.length > 0) nonBlocking.push("LOW_QUALITY_PHOTO");
  if (intelligence.failed && intelligence.usedFallback) nonBlocking.push("VISION_FALLBACK");
  if (intelligence.failed && !intelligence.usedFallback) blocking.push("VISION_FAILED");

  const layoutIds = input.drafts.map((draft) => draft.layoutId).filter(Boolean);
  const layoutCounts = new Map<string, number>();
  for (const id of layoutIds) layoutCounts.set(id, (layoutCounts.get(id) ?? 0) + 1);
  if ([...layoutCounts.values()].some((count) => count >= ALBUM_GENERATION_CONFIG.repetitiveLayoutCount)) {
    nonBlocking.push("REPETITIVE_LAYOUT");
  }
  const activities = input.storySpreads.map((spread) => spread.activity).filter((activity): activity is string => Boolean(activity));
  if (activities.length >= 4 && activities.every((activity) => activity === activities[0])) nonBlocking.push("REPETITIVE_ACTIVITY");

  const sides = input.drafts.flatMap((draft) => draft.assignments.map((assignment) => assignment.placement.side));
  if (sides.length >= 3 && sides.every((side) => side === "left")) nonBlocking.push("LEFT_PAGE_BIAS");
  if (sides.length >= 3 && sides.every((side) => side === "right")) nonBlocking.push("RIGHT_PAGE_BIAS");

  for (const storySpread of input.storySpreads) {
    const draft = input.drafts.find((item) => item.storySpreadId === storySpread.id);
    if (!draft) continue;
    if (draft.story.storyType !== storySpread.storyType || draft.story.recommendedDensity !== storySpread.recommendedDensity) {
      nonBlocking.push("STORY_DRIFT");
    }
    const density = storySpread.recommendedDensity;
    const count = storySpread.photoIds.length;
    const aligned =
      (density === "hero" && count === 1) ||
      (density === "light" && count <= 2) ||
      (density === "medium" && count >= 2 && count <= 4) ||
      (density === "dense" && count >= 4);
    if (!aligned) nonBlocking.push("DENSITY_DRIFT");
  }

  if (new Set(selectedPhotos).size !== draftPhotos.length || selectedPhotos.length !== draftPhotos.length) {
    nonBlocking.push("PHOTO_COUNT_DRIFT");
  }

  const counts: GenerationCounts = {
    library: input.libraryPhotoIds.length,
    period: input.periodPhotoIds.length,
    sceneGroups: input.groups.filter((group) => !group.startedAt || instantInPeriod(group.startedAt, input.period)).length,
    selectedScenes: input.candidates.length,
    selectedPhotos: selectedPhotos.length,
    storySpreads: input.storySpreads.length,
    draftSpreads: input.drafts.length,
    draftPhotos: draftPhotos.length,
  };

  const traces = buildTraces(input, draftPhotos);
  const primaryChains = buildChains(input);

  const selectionQuality = input.candidates.length
    ? clamp(input.candidates.reduce((sum, scene) => sum + scene.sceneScore, 0) / input.candidates.length)
    : 0;
  const storyQuality = input.storySpreads.length
    ? clamp(
        (input.chronology +
          input.storySpreads.reduce((sum, spread) => sum + spread.coherenceScore, 0) / input.storySpreads.length) /
          2,
      )
    : 0;
  const layoutQuality = input.drafts.length
    ? clamp(
        input.drafts.reduce((sum, draft) => sum + (draft.status === "unusable" ? 0 : draft.quality.overall), 0) /
          input.drafts.length,
      )
    : 0;
  const safeties = input.drafts.flatMap((draft) =>
    draft.assignments.map((assignment) =>
      Math.min(
        assignment.safety.faceSafety,
        assignment.safety.headSafety,
        assignment.safety.earSafety,
        assignment.safety.maskSafety,
      ),
    ),
  );
  const cropSafety = safeties.length ? clamp(Math.min(...safeties)) : input.drafts.length ? 0 : 100;
  const uniqueBlocking = [...new Set(blocking)];
  const uniqueNonBlocking = [...new Set(nonBlocking)];
  const consistency = clamp(100 - uniqueBlocking.length * 15 - uniqueNonBlocking.length * 5);
  const weights = ALBUM_GENERATION_CONFIG.weights;
  const overall = clamp(
    selectionQuality * weights.selection +
      storyQuality * weights.story +
      layoutQuality * weights.layout +
      cropSafety * weights.crop +
      consistency * weights.consistency,
  );
  const quality: AlbumGenerationQuality = {
    selectionQuality,
    storyQuality,
    layoutQuality,
    cropSafety,
    consistency,
    overall,
    grade: gradeOf(overall, uniqueBlocking.length > 0),
    blockingIssues: uniqueBlocking,
    nonBlockingIssues: uniqueNonBlocking,
  };

  const groupingWarnings = input.groups.flatMap((group) => group.warnings);
  const stages: AuditStages = {
    photoIntelligence: stage({
      inputCount: counts.library,
      outputCount: intelligence.failed && !intelligence.usedFallback ? 0 : counts.period,
      warnings: intelligence.usedFallback ? ["VISION_FALLBACK"] : intelligence.failed ? ["VISION_FAILED"] : [],
      status: intelligence.failed && !intelligence.usedFallback ? "failed" : intelligence.usedFallback ? "warning" : "ok",
      ...input.stages?.photoIntelligence,
    }),
    grouping: stage({
      inputCount: counts.period,
      outputCount: counts.sceneGroups,
      warnings: groupingWarnings.includes("AMBIGUOUS_GROUP") || groupingWarnings.includes("GROUP_AMBIGUOUS") ? ["GROUP_AMBIGUOUS"] : [],
      ...input.stages?.grouping,
    }),
    bestShot: stage({
      inputCount: counts.sceneGroups,
      outputCount: input.bestShots.length,
      warnings: input.bestShots.flatMap((shot) => shot.warnings),
      ...input.stages?.bestShot,
    }),
    candidates: stage({
      inputCount: input.bestShots.length,
      outputCount: counts.selectedScenes,
      warnings: input.candidates.flatMap((scene) => scene.warnings),
      ...input.stages?.candidates,
    }),
    story: stage({
      inputCount: counts.selectedScenes,
      outputCount: counts.storySpreads,
      warnings: uniqueNonBlocking.filter((issue) => issue.startsWith("LOW_STORY") || issue === "STORY_DRIFT"),
      ...input.stages?.story,
    }),
    draft: stage({
      inputCount: counts.storySpreads,
      outputCount: input.drafts.filter((draft) => draft.status !== "unusable").length,
      status: uniqueBlocking.some((issue) =>
        ["UNUSABLE_FRAME", "NO_LAYOUT_AVAILABLE", "FACE_CROP_UNSAFE", "HEAD_CROP_UNSAFE", "BROKEN_IMAGE"].includes(issue),
      )
        ? "failed"
        : uniqueNonBlocking.some((issue) => issue.startsWith("FALLBACK") || issue === "EMPTY_OPPOSITE_PAGE")
          ? "warning"
          : "ok",
      warnings: uniqueNonBlocking.filter((issue) =>
        ["FALLBACK_CROP", "EMPTY_OPPOSITE_PAGE", "SUGGEST_LARGER_SINGLE", "REPETITIVE_LAYOUT"].includes(issue),
      ),
      ...input.stages?.draft,
    }),
  };

  return {
    petId: input.petId,
    period: input.period,
    stages,
    counts,
    album: { spreads: input.drafts },
    traces,
    primaryChains,
    quality,
    warnings: [...uniqueBlocking, ...uniqueNonBlocking],
    analysisVersion: ALBUM_GENERATION_VERSION,
  };
}

function gradeOf(overall: number, blocked: boolean): QualityGrade {
  if (blocked) return "BLOCKED";
  if (overall >= ALBUM_GENERATION_CONFIG.grade.good) return "GOOD";
  if (overall >= ALBUM_GENERATION_CONFIG.grade.review) return "REVIEW";
  return "NEEDS_ATTENTION";
}

function buildTraces(input: AlbumGenerationAuditInput, draftPhotos: string[]): PhotoTrace[] {
  const ids = [...new Set([...input.periodPhotoIds, ...draftPhotos])];
  return ids.map((photoId) => {
    const shot = input.bestShots.find((item) => item.primaryPhotoId === photoId || item.secondaryPhotoId === photoId);
    const candidate = input.candidates.find((item) => item.primaryPhotoId === photoId || item.secondaryPhotoId === photoId);
    const story = input.storySpreads.find((item) => item.photoIds.includes(photoId));
    const draft = input.drafts.find((item) => item.assignments.some((assignment) => assignment.photoId === photoId));
    const assignment = draft?.assignments.find((item) => item.photoId === photoId);
    const warnings: string[] = [];
    if (candidate && shot && candidate.primaryPhotoId === photoId && shot.primaryPhotoId !== photoId) {
      warnings.push("PRIMARY_ROLE_CHANGED");
    }
    return {
      photoId,
      bestShotRole: shot ? (shot.primaryPhotoId === photoId ? "primary" : "secondary") : "none",
      candidateRole: candidate ? (candidate.primaryPhotoId === photoId ? "primary" : "secondary") : "none",
      storySpreadId: story?.id ?? "",
      storyRole: story ? (story.secondaryPhotoIds.includes(photoId) ? "secondary" : "primary") : "none",
      draftSpreadId: draft?.spreadId ?? "",
      draftRole: assignment?.role ?? "none",
      frameId: assignment?.frameId ?? "",
      warnings,
    };
  });
}

function buildChains(input: AlbumGenerationAuditInput): PrimaryChain[] {
  return input.candidates.map((scene) => {
    const shot = input.bestShots.find((item) => item.groupId === scene.groupId);
    const story = input.storySpreads.find((item) => item.primaryPhotoIds.includes(scene.primaryPhotoId));
    const draft = input.drafts.find((item) => item.assignments.some((assignment) => assignment.photoId === scene.primaryPhotoId));
    const assignment = draft?.assignments.find((item) => item.photoId === scene.primaryPhotoId);
    const warnings: string[] = [];
    if (shot && shot.primaryPhotoId !== scene.primaryPhotoId) warnings.push("PRIMARY_ROLE_CHANGED");
    if (!draft) warnings.push("MISSING_PRIMARY");
    return {
      groupId: scene.groupId,
      bestShotPhotoId: shot?.primaryPhotoId ?? "",
      candidatePhotoId: scene.primaryPhotoId,
      storyPhotoId: story?.primaryPhotoIds.includes(scene.primaryPhotoId) ? scene.primaryPhotoId : "",
      draftPhotoId: assignment?.photoId ?? "",
      draftRole: assignment?.role ?? "",
      warnings,
    };
  });
}
