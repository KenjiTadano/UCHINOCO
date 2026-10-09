import { EDITORIAL_TEMPLATES } from "../smart-layout/editorial-library.ts";
import type { StorySpread, StoryType } from "../album-story/types.ts";
import { ALBUM_LAYOUTS } from "../smart-layout/layouts.ts";
import { evaluateLayout } from "../smart-layout/assign.ts";
import { filterTemplateCandidates, templateMetadata } from "../smart-layout/template-system.ts";
import { withSmartLayoutV2Score } from "../smart-layout/v2.ts";
import type { AlbumLayoutDefinition, LayoutMatchResult, LayoutPhotoInput, LayoutPurpose } from "../smart-layout/types.ts";
import { ALBUM_DRAFT_CONFIG, ALBUM_DRAFT_VERSION } from "./config.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "./layouts.ts";
import { bookPrintMetrics, pageArea, placeFrames } from "./pages.ts";
import type { AlbumDraftRequest, AlbumDraftResult, AlbumSpreadDraft, DraftMatchTier, DraftStatus, LayoutAlternative, SpreadFrameAssignment, SpreadQuality } from "./types.ts";
import { rhythmAdjustment, rhythmEntry, type LayoutRhythmContext, type LayoutRhythmDebug, type RhythmCandidateContext } from "./rhythm.ts";

type Ranked = {
  result: LayoutMatchResult;
  score: number;
  rhythm: LayoutRhythmDebug;
};

function clamp(n: number) {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function tierRank(tier: LayoutMatchResult["tier"]) {
  if (tier === "strict") return 0;
  if (tier === "fallback") return 1;
  return 2;
}

function toTier(tier: LayoutMatchResult["tier"]): DraftMatchTier {
  if (tier === "strict") return "STRICT";
  if (tier === "fallback") return "FALLBACK";
  return "UNUSABLE";
}

function rankedLayout(item: Ranked): LayoutAlternative {
  const { result, score } = item;
  const matchTier = toTier(result.tier);
  const debugReasons = [...new Set([...result.warnings, ...result.assignments.flatMap((assignment) => [...assignment.frameMatch.warnings, ...assignment.frameMatch.rejectReasons])])];
  return {
    layoutId: result.layoutId,
    score,
    layoutScore: score,
    finalScore: result.v2?.finalScore ?? result.scores.overall,
    tier: matchTier,
    matchTier,
    composition: result.v2?.family ?? templateMetadata(result.layout).composition,
    orientationFit: result.v2?.orientationFit ?? null,
    heroFit: result.v2?.heroFit ?? null,
    captionFit: result.v2?.captionFit ?? null,
    storyFit: result.v2?.storyFit ?? null,
    debugReasons,
  };
}

function layoutsForSpread(spread: StorySpread): AlbumLayoutDefinition[] {
  const count = spread.photoIds.length;
  if (spread.id.startsWith("editorial-")) return EDITORIAL_TEMPLATES.filter(layout => layout.photoCount === count);
  const base = ALBUM_LAYOUTS.filter((layout) => layout.photoCount === count);
  const hasSecondary = spread.secondaryPhotoIds.length > 0;
  const extras = hasSecondary ? DRAFT_HIERARCHY_LAYOUTS.filter((layout) => layout.photoCount === count) : [];
  return [...base, ...extras];
}

function photosForSpread(spread: StorySpread, photos: LayoutPhotoInput[]): LayoutPhotoInput[] {
  const byId = new Map(photos.map((photo) => [photo.photoId, photo]));
  return spread.photoIds.map((photoId) => {
    const photo = byId.get(photoId);
    if (!photo) {
      throw new Error(`missing photo ${photoId}`);
    }
    const storyRole = spread.secondaryPhotoIds.includes(photoId) ? "secondary" : "primary";
    return { ...photo, storyRole };
  });
}

function densityBonus(result: LayoutMatchResult, spread: StorySpread): number {
  const bonus = ALBUM_DRAFT_CONFIG.bonus.density;
  const count = result.layout.photoCount;
  const purpose = result.layout.purpose;
  if (spread.recommendedDensity === "hero") {
    if (count === 1 && purpose === "hero") return bonus;
    if (purpose === "collage") return -2;
  }
  if (spread.recommendedDensity === "light") {
    if (spread.secondaryPhotoIds.length > 0 && purpose === "story") return bonus - 1;
    if (spread.secondaryPhotoIds.length === 0 && count <= 2 && (purpose === "hero" || purpose === "sequence" || purpose === "collage")) {
      return bonus - 1;
    }
    if (count >= 4) return -3;
  }
  if (spread.recommendedDensity === "medium" && count >= 2 && count <= 4) return 2;
  if (spread.recommendedDensity === "dense" && count >= 4 && purpose === "collage") return bonus;
  return 0;
}

function storyBonus(result: LayoutMatchResult, storyType: StoryType): number {
  const bonus = ALBUM_DRAFT_CONFIG.bonus.story;
  const purpose = result.layout.purpose;
  const symmetry = result.layout.balanceProfile?.symmetry ?? 0;
  if (storyType === "single" && purpose === "hero") return bonus;
  if (storyType === "contrast" && symmetry >= 0.9) return bonus;
  if (storyType === "sequence" && purpose === "sequence") return bonus;
  if (storyType === "same_day" && (purpose === "story" || purpose === "sequence")) return bonus - 1;
  if (storyType === "event" && (purpose === "hero" || purpose === "story")) return bonus;
  if (storyType === "everyday" && (purpose === "sequence" || purpose === "collage")) return 2;
  return 0;
}

function heroUnsafe(result: LayoutMatchResult): boolean {
  const limits = ALBUM_DRAFT_CONFIG.heroSafety;
  return result.assignments.some((assignment) => {
    if (assignment.slotRole !== "hero") return false;
    const quality = assignment.quality;
    return assignment.frameMatch.matchTier === "unusable" || quality.faceSafety < limits.face || quality.headSafety < limits.head || quality.earSafety < limits.ear || quality.subjectScale < limits.subjectScale;
  });
}

function supportLeadBonus(result: LayoutMatchResult, spread: StorySpread): number {
  if (spread.secondaryPhotoIds.length === 0 || result.tier !== "strict" || heroUnsafe(result)) return 0;
  const primaryImportance = Math.max(...result.assignments.filter((assignment) => spread.primaryPhotoIds.includes(assignment.photoId)).map((assignment) => assignment.importance), 0);
  const secondaryImportance = Math.max(...result.assignments.filter((assignment) => spread.secondaryPhotoIds.includes(assignment.photoId)).map((assignment) => assignment.importance), 0);
  if (primaryImportance > secondaryImportance + 0.15) return ALBUM_DRAFT_CONFIG.bonus.supportLead;
  return 0;
}

export function integratedScore(result: LayoutMatchResult, spread: StorySpread): number {
  const heroPenalty = heroUnsafe(result) ? ALBUM_DRAFT_CONFIG.bonus.heroUnsafe : 0;
  return clamp(result.scores.overall + (result.v2?.templateAffinity ?? 0) + densityBonus(result, spread) + storyBonus(result, spread.storyType) + supportLeadBonus(result, spread) - heroPenalty);
}

export function rankSpreadLayouts(results: LayoutMatchResult[], spread: StorySpread, context?: LayoutRhythmContext): Ranked[] {
  const baseScores = results.map((result) => ({ result, score: integratedScore(result, spread) }));
  const bestTier = Math.min(...results.map((result) => tierRank(result.tier)));
  const bestBaseScore = Math.max(...baseScores.filter((item) => tierRank(item.result.tier) === bestTier).map((item) => item.score), 0);
  return results
    .map((result) => {
      const baseScore = integratedScore(result, spread);
      const sameTierAlternatives = baseScores.filter((item) => tierRank(item.result.tier) === tierRank(result.tier) && item.result.layoutId !== result.layoutId).map((item) => item.score);
      const alternativeScore = Math.max(...sameTierAlternatives, 0);
      const repeatStreak = [...(context?.recent ?? [])].reverse().findIndex((entry) => entry.layoutId !== result.layoutId);
      const candidate: RhythmCandidateContext = {
        repeatStreak: repeatStreak < 0 ? (context?.recent.length ?? 0) : repeatStreak,
        candidateGap: sameTierAlternatives.length > 0 ? baseScore - alternativeScore : null,
        candidateIsBest: tierRank(result.tier) === bestTier && baseScore === bestBaseScore,
      };
      const rhythm = rhythmAdjustment(result, spread.recommendedDensity, context, candidate);
      return {
        result,
        score: baseScore + rhythm.adjustment,
        rhythm,
      };
    })
    .sort((a, b) => tierRank(a.result.tier) - tierRank(b.result.tier) || b.score - a.score || a.result.layoutId.localeCompare(b.result.layoutId));
}

function areaOf(rect: { w: number; h: number }) {
  return rect.w * rect.h;
}

function storyFit(purpose: LayoutPurpose, storyType: StoryType): number {
  if (storyType === "single" && purpose === "hero") return 92;
  if (storyType === "sequence" && purpose === "sequence") return 90;
  if (storyType === "contrast" && (purpose === "sequence" || purpose === "collage")) return 86;
  if (storyType === "event" && (purpose === "hero" || purpose === "story")) return 88;
  if (storyType === "same_day" && (purpose === "story" || purpose === "sequence")) return 84;
  if (storyType === "everyday") return 80;
  return 70;
}

function buildAssignments(result: LayoutMatchResult, photos: LayoutPhotoInput[]): SpreadFrameAssignment[] {
  const focal = new Map(result.assignments.map((assignment) => [assignment.frameId, assignment.crop.x]));
  const placements = placeFrames(result.layout.frames, focal);
  return result.assignments.map((assignment, index) => {
    const photo = photos.find((item) => item.photoId === assignment.photoId);
    const warnings = [...assignment.frameMatch.warnings, ...assignment.frameMatch.rejectReasons];
    return {
      frameId: assignment.frameId,
      role: assignment.slotRole,
      photoId: assignment.photoId,
      frameMatchScore: assignment.frameMatch.matchScore,
      crop: {
        x: assignment.crop.x,
        y: assignment.crop.y,
        scale: assignment.crop.scale,
      },
      cropQuality: assignment.quality.overall,
      safety: {
        faceSafety: assignment.quality.faceSafety,
        headSafety: assignment.quality.headSafety,
        earSafety: assignment.quality.earSafety,
        bodySafety: assignment.quality.bodySafety,
        subjectScale: assignment.quality.subjectScale,
        maskSafety: assignment.quality.maskSafety,
      },
      matchTier: toTier(assignment.frameMatch.matchTier),
      warnings,
      placement: placements[index],
      cropFrame: assignment.cropFrame,
      previewUrl: photo?.previewUrl ?? "",
    };
  });
}

function hierarchyScore(spread: StorySpread, assignments: SpreadFrameAssignment[]): number {
  if (spread.secondaryPhotoIds.length === 0) {
    if (spread.primaryPhotoIds.length < 2) return 90;
    const areas = assignments.map((assignment) => areaOf(assignment.placement.rect));
    const ratio = Math.min(...areas) / Math.max(...areas, 1);
    return clamp(ratio * 100);
  }
  const primaryArea = Math.max(...assignments.filter((assignment) => spread.primaryPhotoIds.includes(assignment.photoId)).map((assignment) => areaOf(assignment.placement.rect)), 0);
  const secondaryArea = Math.max(...assignments.filter((assignment) => spread.secondaryPhotoIds.includes(assignment.photoId)).map((assignment) => areaOf(assignment.placement.rect)), 0);
  if (secondaryArea > primaryArea * 1.05) return 35;
  if (primaryArea > secondaryArea) return 92;
  return 78;
}

function cropSafety(assignments: SpreadFrameAssignment[], result: LayoutMatchResult): number {
  if (result.assignments.length === 0) return 0;
  const scores = result.assignments.map((assignment) => Math.min(assignment.quality.faceSafety, assignment.quality.headSafety, assignment.quality.earSafety, assignment.quality.maskSafety));
  return clamp(Math.min(...scores));
}

type Gate = { hard: string[]; soft: string[] };

function assess(spread: StorySpread, result: LayoutMatchResult, assignments: SpreadFrameAssignment[]): Gate {
  const hard: string[] = [];
  const soft: string[] = [];
  const limits = ALBUM_DRAFT_CONFIG.gate;
  const ids = assignments.map((assignment) => assignment.photoId);
  if (new Set(ids).size !== ids.length) hard.push("DUPLICATE_PHOTO");
  if (result.tier === "unusable" || assignments.some((assignment) => assignment.matchTier === "UNUSABLE")) {
    hard.push("UNUSABLE_FRAME");
  }
  if (result.tier === "fallback") soft.push("FALLBACK_FRAME");

  for (const assignment of result.assignments) {
    const quality = assignment.quality;
    if (quality.faceSafety < limits.face) hard.push("FACE_UNSAFE");
    if (quality.headSafety < limits.head) hard.push("HEAD_UNSAFE");
    if (quality.earSafety < limits.ear) hard.push("EAR_UNSAFE");
    if (assignment.crop.scale > limits.maxScale) hard.push("EXTREME_CROP");
  }
  if (assignments.some((assignment) => assignment.placement.crossesGutter)) hard.push("GUTTER_CROSS");
  if (assignments.some((assignment) => (assignment.placement.side === "left" && assignment.crop.x > 0.78) || (assignment.placement.side === "right" && assignment.crop.x < 0.22))) {
    soft.push("GUTTER_FACE");
  }
  if (heroUnsafe(result)) soft.push("HERO_UNSAFE");

  if (spread.photoIds.length === 1 && assignments[0]) {
    const ratio = areaOf(assignments[0].placement.rect) / pageArea(assignments[0].placement.side);
    if (ratio < limits.minSinglePageRatio) hard.push("SINGLE_TOO_SMALL");
  }

  if (spread.photoIds.length <= 4 && spread.secondaryPhotoIds.length === 0 && spread.primaryPhotoIds.length >= 2 && assignments.length >= 2) {
    const areas = assignments.map((assignment) => areaOf(assignment.placement.rect));
    const ratio = Math.min(...areas) / Math.max(...areas, 1);
    if (ratio < limits.evenPrimaryRatio) hard.push("UNEVEN_PRIMARIES");
  }

  if (spread.secondaryPhotoIds.length > 0) {
    const primaryArea = Math.max(...assignments.filter((assignment) => spread.primaryPhotoIds.includes(assignment.photoId)).map((assignment) => areaOf(assignment.placement.rect)), 0);
    const secondaryArea = Math.max(...assignments.filter((assignment) => spread.secondaryPhotoIds.includes(assignment.photoId)).map((assignment) => areaOf(assignment.placement.rect)), 0);
    if (secondaryArea > primaryArea * 1.05) hard.push("SECONDARY_DOMINATES");
  }

  return { hard: [...new Set(hard)], soft: [...new Set(soft)] };
}

function qualityOf(spread: StorySpread, result: LayoutMatchResult, assignments: SpreadFrameAssignment[]): SpreadQuality {
  const crop = cropSafety(assignments, result);
  const hierarchy = hierarchyScore(spread, assignments);
  const balance = result.scores.balance;
  const fit = storyFit(result.layout.purpose, spread.storyType);
  return {
    cropSafety: crop,
    hierarchy,
    balance,
    storyFit: fit,
    overall: clamp(crop * 0.4 + hierarchy * 0.25 + balance * 0.2 + fit * 0.15),
  };
}

function statusFor(result: LayoutMatchResult, gate: Gate): DraftStatus {
  if (result.tier === "unusable" || gate.hard.length > 0) return "unusable";
  if (result.tier === "fallback" || gate.soft.length > 0) return "needs_adjustment";
  return "ready";
}

function emptyDraft(spread: StorySpread, warnings: string[]): AlbumSpreadDraft {
  return {
    spreadId: `d-${spread.id}`,
    storySpreadId: spread.id,
    layoutId: "",
    layoutScore: 0,
    engineScore: 0,
    selectedLayout: null,
    assignments: [],
    quality: { cropSafety: 0, hierarchy: 0, balance: 0, storyFit: 0, overall: 0 },
    alternatives: [],
    status: "unusable",
    warnings,
    analysisVersion: ALBUM_DRAFT_VERSION,
    print: bookPrintMetrics(),
    story: {
      storyType: spread.storyType,
      recommendedDensity: spread.recommendedDensity,
      importance: spread.importance,
      coherenceScore: spread.coherenceScore,
      primaryPhotoIds: spread.primaryPhotoIds,
      secondaryPhotoIds: spread.secondaryPhotoIds,
      startedAt: spread.startedAt,
    },
  };
}

export function buildSpreadDraft(spread: StorySpread, photos: LayoutPhotoInput[], context?: LayoutRhythmContext, layoutIds?: string[]): AlbumSpreadDraft {
  let scoped: LayoutPhotoInput[];
  try {
    scoped = photosForSpread(spread, photos);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MISSING_PHOTO";
    return emptyDraft(spread, [message]);
  }

  const layouts = layoutsForSpread(spread).filter(layout => !layoutIds || layoutIds.includes(layout.id));
  if (layouts.length === 0) {
    return emptyDraft(spread, ["NO_LAYOUT_FOR_COUNT"]);
  }

  const captionAvailable = scoped.some((photo) => photo.captionAvailable);
  const shortlist = filterTemplateCandidates(layouts, scoped, { captionAvailable, storyType: spread.storyType, maxCandidates: 6, preserveLegacy: true });
  let evaluated = shortlist.map((layout) => withSmartLayoutV2Score(evaluateLayout(layout, scoped), scoped, { captionAvailable, storyType: spread.storyType }));
  if (!evaluated.some((result) => result.tier === "strict" && !result.invalid)) {
    const selected = new Set(shortlist.map((layout) => layout.id));
    evaluated = evaluated.concat(layouts.filter((layout) => !selected.has(layout.id)).map((layout) => withSmartLayoutV2Score(evaluateLayout(layout, scoped), scoped, { captionAvailable, storyType: spread.storyType })));
  }
  const ranked = rankSpreadLayouts(
    evaluated,
    spread,
    context,
  );
  const considered = ranked.map((item) => ({
    item,
    assignments: item.result.assignments.length ? buildAssignments(item.result, scoped) : [],
    gate: { hard: [] as string[], soft: [] as string[] },
  }));
  for (const entry of considered) {
    entry.gate = assess(spread, entry.item.result, entry.assignments);
  }

  const passing = considered.find((entry) => entry.gate.hard.length === 0 && entry.item.result.tier !== "unusable");
  const chosen = passing ?? considered[0];
  if (!chosen) return emptyDraft(spread, ["NO_LAYOUT"]);

  const alternatives: LayoutAlternative[] = considered
    .filter((entry) =>
      entry.item.result.layoutId !== chosen.item.result.layoutId &&
      entry.item.result.tier !== "unusable" &&
      !entry.item.result.invalid &&
      entry.gate.hard.length === 0,
    )
    .slice(0, 3)
    .map((entry) => rankedLayout(entry.item));

  const warnings = [...chosen.item.result.warnings, ...chosen.gate.hard, ...chosen.gate.soft];

  return {
    spreadId: `d-${spread.id}`,
    storySpreadId: spread.id,
    layoutId: chosen.item.result.layoutId,
    layoutScore: chosen.item.score,
    engineScore: chosen.item.result.scores.overall,
    selectedLayout: rankedLayout(chosen.item),
    assignments: chosen.assignments,
    quality: qualityOf(spread, chosen.item.result, chosen.assignments),
    alternatives,
    status: statusFor(chosen.item.result, chosen.gate),
    warnings: [...new Set(warnings)],
    analysisVersion: ALBUM_DRAFT_VERSION,
    print: bookPrintMetrics(),
    story: {
      storyType: spread.storyType,
      recommendedDensity: spread.recommendedDensity,
      importance: spread.importance,
      coherenceScore: spread.coherenceScore,
      primaryPhotoIds: spread.primaryPhotoIds,
      secondaryPhotoIds: spread.secondaryPhotoIds,
      startedAt: spread.startedAt,
    },
    rhythm: chosen.item.rhythm,
    heroConfidence: chosen.item.result.heroConfidence,
  };
}

export function buildAlbumDraft(request: AlbumDraftRequest): AlbumDraftResult {
  const history = [...(request.rhythmContext?.recent ?? [])];
  const spreads = request.spreads.map((spread) => {
    const draft = buildSpreadDraft(spread, request.photos, { recent: history.slice(-3) });
    if (draft.layoutId) {
      const layout = layoutsForSpread(spread).find((item) => item.id === draft.layoutId);
      if (layout) {
        const scoped = photosForSpread(spread, request.photos);
        const matched = withSmartLayoutV2Score(evaluateLayout(layout, scoped), scoped, { captionAvailable: scoped.some((photo) => photo.captionAvailable), storyType: spread.storyType });
        history.push(rhythmEntry(matched, spread.recommendedDensity));
      }
    }
    return draft;
  });
  return {
    period: request.period,
    spreads,
    warnings: spreads.flatMap((spread) => spread.warnings.map((warning) => `${spread.storySpreadId}:${warning}`)),
    analysisVersion: ALBUM_DRAFT_VERSION,
  };
}
