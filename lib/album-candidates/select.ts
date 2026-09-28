import { ALBUM_CANDIDATES_CONFIG, ALBUM_CANDIDATES_VERSION } from "./config.ts";
import { assertAlbumPeriod, instantInPeriod } from "./period.ts";
import type {
  AlbumBudget,
  AlbumCandidatePeriod,
  AlbumCandidateRequest,
  AlbumCandidateResult,
  AlbumCandidateScene,
  AlbumDominantShare,
  AlbumSceneInput,
} from "./types.ts";
import { capturedMs, tokyoDay } from "../photo-grouping/time.ts";

type ScoredScene = AlbumSceneInput & {
  sceneScore: number;
  mustKeep: boolean;
};

type Pick = {
  scene: ScoredScene;
  effectiveScore: number;
  reasons: string[];
  diversity: AlbumCandidateScene["diversity"];
};

const AMBIGUOUS = new Set(["AMBIGUOUS_GROUP", "GROUP_AMBIGUOUS"]);

export function resolveAlbumBudget(
  sceneCount: number,
  photoCount: number,
  override?: Partial<AlbumBudget>,
): AlbumBudget {
  const base = ALBUM_CANDIDATES_CONFIG.budget;
  const photos = Math.max(0, photoCount);
  const scenes = Math.max(0, sceneCount);
  const largeEnough = photos >= base.minPhotos && scenes >= base.minScenes;
  const scaledTarget = scenes <= 4 ? scenes : Math.max(3, scenes - 1);
  const budget: AlbumBudget = largeEnough
    ? {
        ...base,
        targetPhotos: Math.min(base.targetPhotos, photos),
        maxPhotos: Math.min(base.maxPhotos, photos),
      }
    : {
        minPhotos: Math.min(photos, Math.max(scenes > 0 ? 1 : 0, scaledTarget)),
        targetPhotos: photos,
        maxPhotos: photos,
        minScenes: Math.min(scaledTarget, scenes),
        targetScenes: scaledTarget,
        maxScenes: scenes,
      };
  if (!override) return budget;
  return {
    minPhotos: override.minPhotos ?? budget.minPhotos,
    targetPhotos: override.targetPhotos ?? budget.targetPhotos,
    maxPhotos: override.maxPhotos ?? budget.maxPhotos,
    minScenes: override.minScenes ?? budget.minScenes,
    targetScenes: override.targetScenes ?? budget.targetScenes,
    maxScenes: override.maxScenes ?? budget.maxScenes,
  };
}

export function scoreAlbumScene(scene: AlbumSceneInput): { sceneScore: number; mustKeep: boolean } {
  const weights = ALBUM_CANDIDATES_CONFIG.sceneWeights;
  const primary = scene.primary;
  const confidence = clamp(scene.groupConfidence, 0, 1) * 100;
  let score =
    weights.bestShot * primary.bestShot +
    weights.memoryValue * primary.memoryValue +
    weights.expression * primary.expression +
    weights.petVisibility * primary.petVisibility +
    weights.sceneConfidence * confidence +
    weights.relativeUniqueness * primary.relativeUniqueness +
    weights.sceneRepresentativeness * primary.sceneRepresentativeness;
  if (scene.warnings.some((warning) => AMBIGUOUS.has(warning))) {
    score -= ALBUM_CANDIDATES_CONFIG.ambiguousPenalty;
  }
  if (
    scene.memberCount > 1 &&
    scene.selectionConfidence < ALBUM_CANDIDATES_CONFIG.lowSelectionConfidence
  ) {
    score -=
      (ALBUM_CANDIDATES_CONFIG.lowSelectionConfidence - scene.selectionConfidence) *
      ALBUM_CANDIDATES_CONFIG.lowSelectionConfidenceScale;
  }
  const sceneScore = clamp(Math.round(score), 0, 100);
  const mustKeep =
    sceneScore >= ALBUM_CANDIDATES_CONFIG.mustKeepSceneScore ||
    primary.memoryValue >= ALBUM_CANDIDATES_CONFIG.mustKeepMemory;
  return { sceneScore, mustKeep };
}

export function selectAlbumCandidates(request: AlbumCandidateRequest): AlbumCandidateResult {
  const period = assertAlbumPeriod(request.period);
  const inPeriod = request.scenes.filter((scene) => instantInPeriod(scene.startedAt, period));
  const periodPhotoCount =
    request.periodPhotoCount ?? inPeriod.reduce((sum, scene) => sum + scene.memberCount, 0);
  const availablePhotoCount = request.availablePhotoCount ?? request.sourcePhotoCount ?? periodPhotoCount;
  const budget = resolveAlbumBudget(inPeriod.length, periodPhotoCount, request.budget);
  const pool = inPeriod.map((scene) => ({ ...scene, ...scoreAlbumScene(scene) }));
  const remaining = [...pool];
  const picks: Pick[] = [];

  while (picks.length < budget.targetScenes && picks.length < budget.maxScenes) {
    if (picks.length >= budget.maxPhotos) break;
    const ranked = remaining
      .map((scene) => judge(scene, picks.map((pick) => pick.scene), period))
      .sort(
        (a, b) =>
          b.effectiveScore - a.effectiveScore ||
          b.scene.sceneScore - a.scene.sceneScore ||
          a.scene.groupId.localeCompare(b.scene.groupId),
      );
    const best = ranked[0];
    if (!best) break;
    if (!best.scene.mustKeep && best.scene.sceneScore < ALBUM_CANDIDATES_CONFIG.minSceneScore) break;
    picks.push(best);
    const chosen = best.scene.groupId;
    const index = remaining.findIndex((scene) => scene.groupId === chosen);
    if (index >= 0) remaining.splice(index, 1);
  }

  // A slightly higher singleton can enter first and then crowd out the real scene.
  // When the scores are close, keep the larger scene of that same day and activity.
  for (const candidate of [...remaining]) {
    const incumbentIndex = picks.findIndex(
      (pick) => !pick.scene.mustKeep && richerSameMoment(candidate, pick.scene),
    );
    if (incumbentIndex < 0) continue;
    const displaced = picks[incumbentIndex].scene;
    const others = picks.filter((_, index) => index !== incumbentIndex).map((pick) => pick.scene);
    picks[incumbentIndex] = judge(candidate, others, period);
    const index = remaining.findIndex((scene) => scene.groupId === candidate.groupId);
    if (index >= 0) remaining.splice(index, 1);
    remaining.push(displaced);
  }

  const selectedInputs = picks.map((pick) => pick.scene);
  const maxSecondary = Math.floor(picks.length / 3);
  let secondaryCount = 0;
  let photoCount = picks.length;
  const secondaryIds = new Map<string, string>();
  const secondaryOrder = [...picks].sort(
    (a, b) => (b.scene.secondary?.bestShot ?? 0) - (a.scene.secondary?.bestShot ?? 0),
  );
  for (const pick of secondaryOrder) {
    if (secondaryCount >= maxSecondary) break;
    if (photoCount >= budget.maxPhotos) break;
    if (!secondaryFits(pick.scene)) continue;
    secondaryIds.set(pick.scene.groupId, pick.scene.secondary!.photoId);
    secondaryCount += 1;
    photoCount += 1;
  }

  const selectedScenes = picks
    .map((pick) => toCandidate(pick, true, secondaryIds.get(pick.scene.groupId)))
    .sort(byTime);
  const rejectedScenes = remaining
    .map((scene) => {
      const judged = judge(scene, selectedInputs, period);
      return toCandidate(
        { ...judged, reasons: rejectionReasons(scene, selectedInputs) },
        false,
      );
    })
    .sort((a, b) => b.sceneScore - a.sceneScore || a.groupId.localeCompare(b.groupId));

  const selectedPhotoIds = selectedScenes.flatMap((scene) =>
    scene.secondaryPhotoId ? [scene.primaryPhotoId, scene.secondaryPhotoId] : [scene.primaryPhotoId],
  );
  const balance = scoreBalance(pool, selectedScenes, period);

  return {
    period,
    selectedScenes,
    rejectedScenes,
    selectedPhotoIds,
    stats: {
      availablePhotoCount,
      periodPhotoCount,
      sourcePhotoCount: periodPhotoCount,
      sceneCount: pool.length,
      selectedSceneCount: selectedScenes.length,
      selectedPhotoCount: selectedPhotoIds.length,
      primaryCount: selectedScenes.length,
      secondaryCount: selectedScenes.filter((scene) => scene.secondaryPhotoId).length,
    },
    balance,
    analysisVersion: ALBUM_CANDIDATES_VERSION,
  };
}

function judge(scene: ScoredScene, selected: ScoredScene[], period: { start: string; end: string }): Pick {
  const config = ALBUM_CANDIDATES_CONFIG;
  const day = tokyoDay(scene.startedAt);
  const dayCount = selected.filter((item) => tokyoDay(item.startedAt) === day).length;
  const free = isEvent(scene) ? config.eventDayFree : config.sameDayFree;
  const sameDayPenalty = dayCount < free ? 0 : penaltyAt(config.sameDayPenalty, dayCount);

  const activity = scene.activity ?? "unknown";
  const activityCount = selected.filter((item) => (item.activity ?? "unknown") === activity).length;
  const activityPenalty = activityCount === 0 ? 0 : penaltyAt(config.activityRepeatPenalty, activityCount);
  const activityBonus = activityCount === 0 && selected.length > 0 ? config.newActivityBonus : 0;

  const sceneTag = scene.scene ?? "unknown";
  const sceneCount = selected.filter((item) => (item.scene ?? "unknown") === sceneTag).length;
  const scenePenalty = sceneCount === 0 ? 0 : penaltyAt(config.sceneRepeatPenalty, sceneCount);
  const sceneBonus = sceneCount === 0 && selected.length > 0 ? config.newSceneBonus : 0;

  const framingCount = selected.filter((item) => item.primary.framing === scene.primary.framing).length;
  const visualPenalty = penaltyAt(config.visualRepeatPenalty, framingCount);
  const framingBonus = framingCount === 0 && selected.length > 0 ? config.newFramingBonus : 0;

  const placementCount = selected.filter((item) => item.primary.placement === scene.primary.placement).length;
  const placementBonus = placementCount === 0 && selected.length > 0 ? 1 : 0;
  const compositionPenalty = placementCount >= 3 ? 2 : 0;

  const bucket = coverageKey(scene.startedAt, period);
  const bucketEmpty = !selected.some((item) => coverageKey(item.startedAt, period) === bucket);
  const timeBonus =
    bucketEmpty && selected.length > 0 && scene.sceneScore >= config.timeBonusMinSceneScore
      ? config.emptyPeriodBonus
      : 0;

  let everydayBonus = 0;
  if (!isEvent(scene) && selected.length >= 2 && scene.sceneScore >= config.timeBonusMinSceneScore) {
    const eventCount = selected.filter((item) => isEvent(item)).length;
    if (eventCount / selected.length >= 0.6) everydayBonus = 2;
  }

  const diversityBonus = Math.min(
    5,
    activityBonus + sceneBonus + framingBonus + placementBonus + timeBonus + everydayBonus,
  );
  const eventBonus = isEvent(scene) ? config.eventBonus : 0;
  const rawPenalty = sameDayPenalty + activityPenalty + scenePenalty + visualPenalty + compositionPenalty;
  const penalty = scene.mustKeep ? 0 : Math.min(config.maxDiversityPenalty, rawPenalty);
  const effectiveScore = clamp(scene.sceneScore + eventBonus + diversityBonus - penalty, 0, 130);

  const reasons: string[] = [];
  if (scene.mustKeep) reasons.push("MUST_KEEP");
  if (scene.primary.memoryValue >= 80) reasons.push("HIGH_MEMORY_VALUE");
  if (scene.primary.bestShot >= 80) reasons.push("BEST_SHOT_STRONG");
  if (timeBonus > 0) reasons.push("IMPROVES_TIME_COVERAGE");
  if (activityBonus > 0) reasons.push("ADDS_ACTIVITY_DIVERSITY");
  if (framingBonus > 0) reasons.push("ADDS_VISUAL_DIVERSITY");

  return {
    scene,
    effectiveScore,
    reasons,
    diversity: {
      time: timeBonus > 0 ? 100 : bucketEmpty ? 40 : 25,
      scene: sceneBonus > 0 ? 100 : sceneCount === 0 ? 60 : 25,
      activity: activityBonus > 0 ? 100 : activityCount === 0 ? 60 : 25,
      visual: framingBonus > 0 ? 100 : framingCount >= 2 ? 20 : 45,
      composition: placementBonus > 0 ? 100 : placementCount >= 3 ? 20 : 50,
    },
  };
}

function rejectionReasons(scene: ScoredScene, selected: ScoredScene[]): string[] {
  const reasons: string[] = [];
  if (scene.sceneScore < ALBUM_CANDIDATES_CONFIG.minSceneScore) reasons.push("LOW_SCENE_SCORE");
  const dayCount = selected.filter((item) => tokyoDay(item.startedAt) === tokyoDay(scene.startedAt)).length;
  const free = isEvent(scene) ? ALBUM_CANDIDATES_CONFIG.eventDayFree : ALBUM_CANDIDATES_CONFIG.sameDayFree;
  if (dayCount >= free) reasons.push("SAME_DAY_OVERREPRESENTED");
  const activityCount = selected.filter((item) => (item.activity ?? "unknown") === (scene.activity ?? "unknown")).length;
  if (activityCount >= 2) reasons.push("ACTIVITY_REPETITION");
  const framingCount = selected.filter((item) => item.primary.framing === scene.primary.framing).length;
  if (framingCount >= 2) reasons.push("VISUAL_REPETITION");
  const lowConfidence =
    scene.warnings.some((warning) => AMBIGUOUS.has(warning)) ||
    (scene.memberCount > 1 && scene.selectionConfidence < ALBUM_CANDIDATES_CONFIG.lowSelectionConfidence);
  if (lowConfidence) reasons.push("LOW_CONFIDENCE");
  if (reasons.length === 0) reasons.push("PHOTO_BUDGET_REACHED");
  return reasons;
}

function richerSameMoment(candidate: ScoredScene, incumbent: ScoredScene): boolean {
  if (tokyoDay(candidate.startedAt) !== tokyoDay(incumbent.startedAt)) return false;
  if ((candidate.activity ?? "unknown") !== (incumbent.activity ?? "unknown")) return false;
  if (candidate.sceneScore < incumbent.sceneScore - 4) return false;
  if (candidate.memberCount <= incumbent.memberCount) return false;
  if (candidate.primary.bestShot + 5 < incumbent.primary.bestShot) return false;
  return true;
}

function secondaryFits(scene: AlbumSceneInput): boolean {
  const secondary = scene.secondary;
  if (!secondary) return false;
  if (secondary.visualSimilarityToPrimary > 80) return false;
  if (secondary.bestShot < 75) return false;
  if (secondary.memoryValue < 60) return false;
  return true;
}

function toCandidate(pick: Pick, selected: boolean, secondaryPhotoId?: string): AlbumCandidateScene {
  return {
    groupId: pick.scene.groupId,
    primaryPhotoId: pick.scene.primary.photoId,
    secondaryPhotoId,
    sceneScore: pick.scene.sceneScore,
    effectiveScore: pick.effectiveScore,
    importance: pick.scene.sceneScore,
    mustKeep: pick.scene.mustKeep,
    diversity: pick.diversity,
    selected,
    selectionReason: pick.reasons,
    warnings: pick.scene.warnings,
    tags: pick.scene.tags,
    startedAt: pick.scene.startedAt,
    activity: pick.scene.activity,
    scene: pick.scene.scene,
  };
}

function scoreBalance(
  source: ScoredScene[],
  selected: AlbumCandidateScene[],
  period: AlbumCandidatePeriod,
) {
  if (selected.length === 0) {
    return {
      timeCoverage: 0,
      sceneDiversity: 0,
      activityDiversity: 0,
      visualDiversity: 0,
      overall: 0,
      dominant: { activity: null, scene: null, visual: null, day: null },
    };
  }
  const time = distributionBalance(
    source.map((scene) => timeBucket(scene.startedAt, period)),
    selected.map((scene) => timeBucket(scene.startedAt, period)),
  );
  const scene = distributionBalance(
    source.map((item) => item.scene ?? "unknown"),
    selected.map((item) => item.scene ?? "unknown"),
  );
  const activity = distributionBalance(
    source.map((item) => item.activity ?? "unknown"),
    selected.map((item) => item.activity ?? "unknown"),
  );
  const visual = distributionBalance(
    source.map((item) => item.primary.framing),
    selected.map((item) => framingOf(item, source)),
  );
  const day = distributionBalance(
    source.map((item) => tokyoDay(item.startedAt)),
    selected.map((item) => tokyoDay(item.startedAt)),
  );
  const quality = selected.length
    ? selected.reduce((sum, item) => sum + item.sceneScore, 0) / selected.length
    : 0;
  const mix = (time.score + scene.score + activity.score + visual.score) / 4;
  return {
    timeCoverage: time.score,
    sceneDiversity: scene.score,
    activityDiversity: activity.score,
    visualDiversity: visual.score,
    overall: Math.round(quality * 0.7 + mix * 0.3),
    dominant: {
      activity: activity.dominant,
      scene: scene.dominant,
      visual: visual.dominant,
      day: day.dominant,
    },
  };
}

/**
 * 100 when the selection mirrors the source mix.
 * A library that is entirely home stays high. A mixed library collapsed onto one tag does not.
 * Buckets with no source photos are absent from both sides, so empty weeks are not a penalty.
 */
function distributionBalance(sourceKeys: string[], selectedKeys: string[]): {
  score: number;
  dominant: AlbumDominantShare | null;
} {
  const source = sourceKeys.filter(Boolean);
  const selected = selectedKeys.filter(Boolean);
  if (source.length === 0 || selected.length === 0) {
    return { score: source.length === 0 && selected.length === 0 ? 100 : 0, dominant: null };
  }
  const sourceCounts = countKeys(source);
  const selectedCounts = countKeys(selected);
  const keys = new Set([...sourceCounts.keys(), ...selectedCounts.keys()]);
  let distance = 0;
  for (const key of keys) {
    const sourceShare = (sourceCounts.get(key) ?? 0) / source.length;
    const selectedShare = (selectedCounts.get(key) ?? 0) / selected.length;
    distance += Math.abs(selectedShare - sourceShare);
  }
  return {
    score: Math.round((1 - distance / 2) * 100),
    dominant: dominantShare(selectedCounts, selected.length),
  };
}

function countKeys(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

function dominantShare(counts: Map<string, number>, total: number): AlbumDominantShare | null {
  let key = "";
  let count = 0;
  for (const [name, value] of counts) {
    if (value > count) {
      key = name;
      count = value;
    }
  }
  if (!key || total === 0) return null;
  return { key, count, ratio: Math.round((count / total) * 100) / 100 };
}

function framingOf(scene: AlbumCandidateScene, source: ScoredScene[]) {
  return source.find((item) => item.groupId === scene.groupId)?.primary.framing ?? "medium";
}

function timeBucket(iso: string, period: AlbumCandidatePeriod): string {
  if (period.type === "monthly") return weekOfMonth(iso);
  return coverageKey(iso, period);
}

function coverageKey(iso: string, period: { start: string; end: string }): string {
  const span = capturedMs(period.end) - capturedMs(period.start);
  if (span >= 14 * 24 * 60 * 60 * 1000) return tokyoWeek(iso);
  if (span <= 0) return "only";
  const ratio = (capturedMs(iso) - capturedMs(period.start)) / span;
  if (ratio < 1 / 3) return "early";
  if (ratio < 2 / 3) return "mid";
  return "late";
}

function weekOfMonth(iso: string): string {
  const day = tokyoDay(iso);
  if (!day) return "";
  const date = Number(day.slice(8, 10));
  const week = Math.min(5, Math.floor((date - 1) / 7) + 1);
  return `${day.slice(0, 7)}-W${week}`;
}

function tokyoWeek(iso: string): string {
  const day = tokyoDay(iso);
  if (!day) return "";
  const [year, month, date] = day.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, date);
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  const thursday = utc - weekday * 86400000 + 3 * 86400000;
  const thursdayDate = new Date(thursday);
  const yearStart = Date.UTC(thursdayDate.getUTCFullYear(), 0, 1);
  const week = Math.floor((thursday - yearStart) / 86400000 / 7) + 1;
  return `${thursdayDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isEvent(scene: AlbumSceneInput): boolean {
  const tags = new Set(
    [...scene.tags, scene.scene, scene.activity].filter((tag): tag is string => Boolean(tag)),
  );
  return ALBUM_CANDIDATES_CONFIG.eventTags.some((tag) => tags.has(tag));
}

function penaltyAt(table: readonly number[], count: number): number {
  if (count <= 0) return 0;
  return table[Math.min(count, table.length - 1)] ?? 0;
}

function byTime(a: AlbumCandidateScene, b: AlbumCandidateScene) {
  return a.startedAt.localeCompare(b.startedAt) || a.groupId.localeCompare(b.groupId);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
