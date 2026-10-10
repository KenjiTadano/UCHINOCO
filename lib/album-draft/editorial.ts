import { TEXT_LENGTH_LIMIT } from "../album-persistence/config.ts";
import { buildSpreadDraft } from "./draft.ts";
import type { AlbumSpreadDraft } from "./types.ts";
import type { StorySpread } from "../album-story/types.ts";
import type { BestShotCandidate } from "../best-shot/types.ts";
import type { LayoutPhotoInput } from "../smart-layout/types.ts";
import { EDITORIAL_TEMPLATES, editorialTemplate } from "../smart-layout/editorial-library.ts";
import { rankTemplateCandidates } from "../smart-layout/template-system.ts";
import type { LayoutEvaluationWork } from "../smart-layout/assign.ts";
import { ALBUM_PAGE_COUNTS, requiredEligiblePhotos } from "../album-capacity.ts";
import type { AlbumPageCount } from "../album-capacity.ts";
import { ALBUM_DRAFT_CONFIG } from "./config.ts";

export const EDITORIAL_VERSION = "album-editorial-v1";
export { ALBUM_PAGE_COUNTS };
export type { AlbumPageCount };
export type EditorialPhoto = { photoId: string; petId: string; groupId: string; timeline: string; scene?: string; activity?: string; candidate: BestShotCandidate; confidence: number };
export type RhythmIssue = { code: string; index: number; blocking: boolean };
export type RhythmAudit = { score: number; issues: RhythmIssue[]; layoutCount: number; densityCount: number; heroCount: number; repairedSpreadCount: number };
export class EditorialGenerationError extends Error {
  readonly unrecoveredSpreadIndices: number[];
  readonly recoveryStats?: Record<string, number>;

  constructor(message: string, unrecoveredSpreadIndices: number[] = [], recoveryStats?: Record<string, number>) {
    super(message);
    this.unrecoveredSpreadIndices = unrecoveredSpreadIndices;
    this.recoveryStats = recoveryStats;
  }
}

/** The date is factual; user copy stays plain and within the existing SQL limit. */
export function editorialPageText(timeline: string, caption: string | null): string {
  const date = new Date(timeline).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
  return Array.from([date, caption?.replace(/[<>]/g, "").replace(/\s+/g, " ").trim()].filter(Boolean).join("\n"))
    .slice(0, TEXT_LENGTH_LIMIT.caption)
    .join("");
}

/** Page budget first, then global Best Shot ranking with a bounded pet-balance penalty. */
export function planEditorialAlbum(input: EditorialPhoto[], pageCount: AlbumPageCount): { selected: EditorialPhoto[]; spreads: StorySpread[] } {
  if (!ALBUM_PAGE_COUNTS.includes(pageCount)) throw new EditorialGenerationError("ページ数を選択してください。");
  const eligible = [...new Map(input.filter((p) => p.candidate.role !== "alternate" && p.candidate.scores.technical >= 25).map((p) => [p.photoId, p])).values()];
  const spreadCount = requiredEligiblePhotos(pageCount);
  if (eligible.length < spreadCount) throw new EditorialGenerationError(`${pageCount}Pには少なくとも${spreadCount}枚の異なる写真が必要です。写真を追加するか、ページ数・期間を変更してください。`);
  const target = Math.min(eligible.length, Math.round(pageCount * 1.35));
  const chosen: EditorialPhoto[] = [];
  const remaining = new Map(eligible.map((p) => [p.photoId, p]));
  const counts = new Map<string, number>();
  while (chosen.length < target) {
    const score = (p: EditorialPhoto) => p.candidate.scores.overall - ((counts.get(p.petId) ?? 0) / Math.max(1, chosen.length)) * 12;
    const next = [...remaining.values()].sort((a, b) => score(b) - score(a) || a.photoId.localeCompare(b.photoId))[0];
    chosen.push(next);
    remaining.delete(next.photoId);
    counts.set(next.petId, (counts.get(next.petId) ?? 0) + 1);
  }
  // Chronology is preserved between spreads; the strongest photo leads within each spread.
  chosen.sort((a, b) => a.timeline.localeCompare(b.timeline) || a.groupId.localeCompare(b.groupId) || a.photoId.localeCompare(b.photoId));
  const sizes = Array(spreadCount).fill(1) as number[];
  const rhythm = [1, 3, 4, 1, 2, 5, 2, 3, 6, 1, 4, 2];
  let extra = chosen.length - spreadCount;
  // First prevent long single-photo runs when the library can support variation.
  for (let i = 2; i < spreadCount && extra > 0; i += 3) {
    sizes[i]++;
    extra--;
  }
  // Allocate variable densities without allowing any spread to consume another's minimum.
  while (extra > 0) {
    let changed = false;
    for (let i = 0; i < spreadCount && extra > 0; i++) {
      const limit = rhythm[i % rhythm.length];
      if (sizes[i] < limit) {
        sizes[i]++;
        extra--;
        changed = true;
      }
    }
    if (!changed)
      for (let i = 0; i < spreadCount && extra > 0; i++)
        if (sizes[i] < 6) {
          sizes[i]++;
          extra--;
          changed = true;
        }
    if (!changed) break;
  }
  let offset = 0;
  const spreads = sizes.map((count, index): StorySpread => {
    const group = chosen.slice(offset, offset + count);
    offset += count;
    const lead = [...group].sort((a, b) => b.candidate.scores.overall - a.candidate.scores.overall || a.photoId.localeCompare(b.photoId))[0];
    return {
      id: `editorial-${index + 1}`,
      sceneIds: [...new Set(group.map((p) => p.groupId))],
      photoIds: [lead.photoId, ...group.filter((p) => p !== lead).map((p) => p.photoId)],
      primaryPhotoIds: [lead.photoId],
      secondaryPhotoIds: group.filter((p) => p !== lead).map((p) => p.photoId),
      startedAt: group[0].timeline,
      endedAt: group.at(-1)!.timeline,
      storyType: count === 1 ? "single" : "sequence",
      theme: { scene: lead.scene, activity: lead.activity },
      coherenceScore: group.every((p) => p.groupId === lead.groupId) ? 100 : 75,
      importance: lead.candidate.scores.overall,
      recommendedDensity: count >= 4 ? "dense" : count === 1 ? "hero" : "medium",
      warnings: [],
      analysisVersion: EDITORIAL_VERSION,
    };
  });
  return { selected: chosen, spreads };
}

function descriptor(spread: AlbumSpreadDraft) {
  const t = editorialTemplate(spread.layoutId);
  const largest = [...spread.assignments].sort((a, b) => b.placement.rect.w * b.placement.rect.h - a.placement.rect.w * a.placement.rect.h)[0];
  return { group: t?.similarGroup ?? spread.layoutId, density: t?.density, side: largest?.placement.side, count: spread.assignments.length, hero: spread.assignments.some((a) => a.role === "hero") };
}
export function auditAlbumRhythm(spreads: AlbumSpreadDraft[], textByStory: Record<string, string> = {}): RhythmAudit {
  const issues: RhythmIssue[] = [];
  const add = (code: string, index: number, blocking = false) => issues.push({ code, index, blocking });
  const descriptors = spreads.map(descriptor);
  spreads.forEach((s, i) => {
    if (!s.assignments.length || s.status === "unusable") add("UNUSABLE_SPREAD", i, true);
    for (const side of ["left", "right"] as const) if (!s.assignments.some((a) => a.placement.side === side) && !textByStory[s.storySpreadId]?.trim()) add("BLANK_PAGE", i, true);
    if (s.assignments.some((a) => a.matchTier === "UNUSABLE" || a.placement.crossesGutter || a.safety.faceSafety < 50 || a.safety.headSafety < 45 || a.safety.earSafety < 35)) add("CROP_UNSAFE", i, true);
    if (i > 0) {
      if (s.layoutId === spreads[i - 1].layoutId) add("REPEATED_TEMPLATE", i, true);
      else if (descriptors[i].group === descriptors[i - 1].group) add("SIMILAR_TEMPLATE", i, true);
      if (s.story.startedAt < spreads[i - 1].story.startedAt) add("STORY_FLOW", i, true);
    }
    if (i >= 2 && descriptors.slice(i - 2, i + 1).every((d) => d.count === descriptors[i].count)) add("PHOTO_COUNT_STREAK", i);
    if (i >= 2 && descriptors.slice(i - 2, i + 1).every((d) => d.density === descriptors[i].density)) add("DENSITY_STREAK", i);
    if (i >= 3 && descriptors.slice(i - 3, i + 1).every((d) => d.side === descriptors[i].side)) add("SIDE_STREAK", i);
    if (i >= 3 && descriptors.slice(i - 3, i + 1).every((d) => d.hero)) add("HERO_STREAK", i);
  });
  const layoutCount = new Set(spreads.map((s) => s.layoutId)).size;
  const densityCount = new Set(descriptors.map((d) => d.density)).size;
  const heroCount = descriptors.filter((d) => d.hero).length;
  if (spreads.length >= 6 && layoutCount < Math.min(5, spreads.length)) add("LOW_LAYOUT_DIVERSITY", 0);
  if (spreads.length >= 6 && densityCount < 2) add("LOW_DENSITY_DIVERSITY", 0);
  if (spreads.length >= 6 && heroCount === 0) add("MISSING_HERO", 0);
  return { score: Math.max(0, 100 - issues.reduce((sum, i) => sum + (i.blocking ? 40 : 4), 0)), issues, layoutCount, densityCount, heroCount, repairedSpreadCount: 0 };
}

function scopedPhotos(story: StorySpread, photos: LayoutPhotoInput[]) {
  const photoIds = new Set(story.photoIds);
  return photos.filter((photo) => photoIds.has(photo.photoId));
}

export function candidateDrafts(story: StorySpread, photos: LayoutPhotoInput[], work: LayoutEvaluationWork, recovery: boolean, evaluate: typeof buildSpreadDraft = buildSpreadDraft) {
  const scoped = scopedPhotos(story, photos);
  const layouts = EDITORIAL_TEMPLATES.filter((layout) => layout.photoCount === story.photoIds.length);
  const regular = layouts.filter((layout) => !layout.id.startsWith("E_SAFE_FALLBACK_"));
  const ranked = rankTemplateCandidates(regular, scoped, {
    captionAvailable: scoped.some((photo) => photo.captionAvailable),
    storyType: story.storyType,
    preserveLegacy: false,
  }).map((candidate) => candidate.layout);
  const initialCount = ALBUM_DRAFT_CONFIG.recovery.initialLayoutCandidates;
  const recoveryCount = ALBUM_DRAFT_CONFIG.recovery.recoveryLayoutCandidates;
  const selected = recovery
    ? [...ranked.slice(initialCount, initialCount + recoveryCount), ...rankTemplateCandidates(layouts.filter((layout) => layout.id.startsWith("E_SAFE_FALLBACK_")), scoped, { storyType: story.storyType }).slice(0, 3).map((candidate) => candidate.layout)]
    : ranked.slice(0, initialCount);
  work.layoutCandidateCount = (work.layoutCandidateCount ?? 0) + selected.length;
  return selected.map((layout) => evaluate(story, photos, undefined, [layout.id], work))
    .filter((draft) => draft.status !== "unusable");
}

function reassignedStory(story: StorySpread, nextPrimary: string): StorySpread {
  const previousPrimary = story.primaryPhotoIds[0];
  const secondary = story.photoIds.filter((photoId) => photoId !== nextPrimary && photoId !== previousPrimary);
  return {
    ...story,
    photoIds: [nextPrimary, previousPrimary, ...secondary],
    primaryPhotoIds: [nextPrimary],
    secondaryPhotoIds: [previousPrimary, ...secondary],
  };
}

export function reflowAdjacentSpread(stories: StorySpread[], failingIndex: number, adjacentIndex: number): StorySpread[] | null {
  const donor = stories[failingIndex];
  const recipient = stories[adjacentIndex];
  if (!donor || !recipient || donor.photoIds.length <= 1 || recipient.photoIds.length >= 6) return null;
  const movable = donor.secondaryPhotoIds.at(-1) ?? donor.photoIds.at(-1);
  if (!movable || donor.primaryPhotoIds.includes(movable) && donor.photoIds.length === 1) return null;
  const donorPhotoIds = donor.photoIds.filter((photoId) => photoId !== movable);
  const donorSecondary = donor.secondaryPhotoIds.filter((photoId) => photoId !== movable);
  const next = stories.slice();
  next[failingIndex] = { ...donor, photoIds: donorPhotoIds, secondaryPhotoIds: donorSecondary, sceneIds: [...new Set(donor.sceneIds)] };
  next[adjacentIndex] = {
    ...recipient,
    photoIds: [...recipient.photoIds, movable],
    secondaryPhotoIds: [...recipient.secondaryPhotoIds, movable],
    sceneIds: [...new Set(recipient.sceneIds)],
  };
  const allIds = next.flatMap((story) => story.photoIds);
  if (new Set(allIds).size !== allIds.length) return null;
  return next;
}

/** Candidates retain their own crops and geometry. Recovery budgets are explicit and bounded. */
export function buildEditorialDraft(stories: StorySpread[], photos: LayoutPhotoInput[], textByStory: Record<string, string>, onRhythm?: (event: "started" | "completed", itemCount: number) => void, replacementPhotoIdsBySpread: Record<string, string[]> = {}) {
  const work: LayoutEvaluationWork = { cells: new Map(), cropDurationMs: 0, cropItemCount: 0, cropReusedCount: 0 };
  const cropStartedAt = new Date().toISOString();
  let workingStories = stories.slice();
  const recoveryStats = { initialUnsafeSpreadCount: 0, templateFallbackCount: 0, photoReassignmentCount: 0, bestShotReplacementCount: 0, densityFallbackCount: 0, adjacentReflowCount: 0, safeFallbackUsedCount: 0, unrecoveredCount: 0 };
  const recoveryLayoutIds = new Map<number, Set<string>>();
  const makeCandidates = (story: StorySpread, recovery = false) => candidateDrafts(story, photos, work, recovery);
  const candidates = workingStories.map((story) => makeCandidates(story));
  const initiallyUnsafe = new Set(candidates.flatMap((items, index) => items.length ? [] : [index]));
  recoveryStats.initialUnsafeSpreadCount = initiallyUnsafe.size;

  for (const index of initiallyUnsafe) {
    let recoveryAttempts = 0;
    const recovered = makeCandidates(workingStories[index], true);
    if (recovered.length) {
      candidates[index] = recovered;
      recoveryLayoutIds.set(index, new Set(recovered.map((draft) => draft.layoutId)));
      continue;
    }

    const story = workingStories[index];
    const roleCandidates = story.secondaryPhotoIds.slice(0, ALBUM_DRAFT_CONFIG.recovery.roleReassignmentAttempts);
    for (const nextLead of roleCandidates) {
      if (recoveryAttempts >= ALBUM_DRAFT_CONFIG.recovery.recoveryStrategyAttempts) break;
      recoveryAttempts++;
      const variant = reassignedStory(story, nextLead);
      const variantCandidates = makeCandidates(variant, true);
      if (variantCandidates.length) {
        workingStories[index] = variant;
        candidates[index] = variantCandidates;
        recoveryLayoutIds.set(index, new Set(variantCandidates.map((draft) => draft.layoutId)));
        recoveryStats.photoReassignmentCount++;
        break;
      }
    }
    if (candidates[index].length) continue;

    let replaced = false;
    const replacementIds = replacementPhotoIdsBySpread[story.id]?.slice(0, ALBUM_DRAFT_CONFIG.recovery.bestShotReplacementCandidates) ?? [];
    const occupied = new Set(workingStories.flatMap((item) => item.photoIds));
    for (const replacementId of replacementIds) {
      if (recoveryAttempts >= ALBUM_DRAFT_CONFIG.recovery.recoveryStrategyAttempts) break;
      recoveryAttempts++;
      if (occupied.has(replacementId) || !photos.some((photo) => photo.photoId === replacementId)) continue;
      const replaceId = story.secondaryPhotoIds.at(-1) ?? story.primaryPhotoIds[0];
      if (!replaceId) continue;
      const variant: StorySpread = {
        ...story,
        photoIds: story.photoIds.map((photoId) => photoId === replaceId ? replacementId : photoId),
        primaryPhotoIds: story.primaryPhotoIds.map((photoId) => photoId === replaceId ? replacementId : photoId),
        secondaryPhotoIds: story.secondaryPhotoIds.map((photoId) => photoId === replaceId ? replacementId : photoId),
      };
      const variantCandidates = makeCandidates(variant, true);
      if (!variantCandidates.length) continue;
      workingStories[index] = variant;
      candidates[index] = variantCandidates;
      recoveryLayoutIds.set(index, new Set(variantCandidates.map((draft) => draft.layoutId)));
      recoveryStats.bestShotReplacementCount++;
      replaced = true;
      break;
    }
    if (replaced) continue;

    let reflowed = false;
    for (const adjacentIndex of [index - 1, index + 1].filter((candidate) => Math.abs(candidate - index) <= ALBUM_DRAFT_CONFIG.recovery.adjacentReflowRange).slice(0, ALBUM_DRAFT_CONFIG.recovery.densityFallbackAttempts)) {
      if (recoveryAttempts >= ALBUM_DRAFT_CONFIG.recovery.recoveryStrategyAttempts) break;
      recoveryAttempts++;
      const rebalanced = reflowAdjacentSpread(workingStories, index, adjacentIndex);
      if (!rebalanced) continue;
      const donorCandidates = makeCandidates(rebalanced[index], true);
      const recipientCandidates = makeCandidates(rebalanced[adjacentIndex], true);
      if (!donorCandidates.length || !recipientCandidates.length) continue;
      workingStories = rebalanced;
      candidates[index] = donorCandidates;
      candidates[adjacentIndex] = recipientCandidates;
      recoveryLayoutIds.set(index, new Set(donorCandidates.map((draft) => draft.layoutId)));
      recoveryLayoutIds.set(adjacentIndex, new Set(recipientCandidates.map((draft) => draft.layoutId)));
      recoveryStats.densityFallbackCount++;
      recoveryStats.adjacentReflowCount++;
      reflowed = true;
      break;
    }
    if (!reflowed) candidates[index] = [];
  }

  recoveryStats.unrecoveredCount = candidates.filter((items) => items.length === 0).length;
  if (recoveryStats.unrecoveredCount) {
    throw new EditorialGenerationError(
      "アルバムを完成できませんでした。別の写真で組み直すか、写真を追加してください。",
      candidates.flatMap((items, index) => items.length ? [] : [index]),
      recoveryStats,
    );
  }
  const selected: AlbumSpreadDraft[] = [];
  for (const options of candidates) {
    const previous = selected.at(-1);
    const previousGroup = previous ? editorialTemplate(previous.layoutId)?.similarGroup : null;
    const fresh = options.filter((o) => o.layoutId !== previous?.layoutId && editorialTemplate(o.layoutId)?.similarGroup !== previousGroup);
    const safe = fresh.length ? fresh : options;
    const usage = (id: string) => selected.filter((s) => s.layoutId === id).length;
    selected.push([...safe].sort((a, b) => b.layoutScore - usage(b.layoutId) * 8 - (a.layoutScore - usage(a.layoutId) * 8) || a.layoutId.localeCompare(b.layoutId))[0]);
  }
  recoveryStats.templateFallbackCount = selected.reduce((count, spread, index) => count + Number(recoveryLayoutIds.get(index)?.has(spread.layoutId) ?? false), 0);
  onRhythm?.("started", selected.length);
  const before = auditAlbumRhythm(selected, textByStory);
  let audit = before;
  let repairs = 0;
  // Bounded second pass optimizes whole-book score, retaining safe photo assignments.
  for (let pass = 0; pass < ALBUM_DRAFT_CONFIG.recovery.wholeAlbumRepairPasses && audit.score < 90; pass++) {
    const affected = new Set(audit.issues.flatMap((issue) => (issue.code.startsWith("LOW_") || issue.code === "MISSING_HERO" ? selected.map((_, index) => index) : [issue.index, Math.max(0, issue.index - 1)])));
    for (const i of affected) {
      let best = selected[i],
        bestScore = audit.score;
      for (const alternative of candidates[i]) {
        const trial = selected.map((s, j) => (j === i ? alternative : s));
        const result = auditAlbumRhythm(trial, textByStory);
        if (result.score > bestScore) {
          best = alternative;
          bestScore = result.score;
        }
      }
      if (best !== selected[i]) {
        selected[i] = best;
        repairs++;
        audit = auditAlbumRhythm(selected, textByStory);
      }
    }
  }
  audit = { ...audit, repairedSpreadCount: repairs };
  recoveryStats.safeFallbackUsedCount = selected.filter((spread) => spread.layoutId.startsWith("E_SAFE_FALLBACK_")).length;
  onRhythm?.("completed", repairs);
  const blockingIssues = audit.issues.filter((issue) => issue.blocking);
  if (blockingIssues.length) {
    const unrecoveredSpreadIndices = [...new Set(blockingIssues.map((issue) => issue.index))];
    recoveryStats.unrecoveredCount = unrecoveredSpreadIndices.length;
    throw new EditorialGenerationError("アルバムを完成できませんでした。別の写真を見直すか、写真を追加してください。", unrecoveredSpreadIndices, recoveryStats);
  }
  for (let i = 0; i < selected.length; i++)
    selected[i] = {
      ...selected[i],
      alternatives: candidates[i]
        .filter((c) => c.layoutId !== selected[i].layoutId)
        .slice(0, 4)
        .flatMap((c) => (c.selectedLayout ? [c.selectedLayout] : [])),
    };
  return {
    spreads: selected,
    stories: workingStories,
    selectedPhotoIds: [...new Set(selected.flatMap((spread) => spread.assignments.map((assignment) => assignment.photoId)))],
    audit,
    beforeAudit: before,
    recovery: recoveryStats,
    performance: { cropStartedAt, cropDurationMs: work.cropDurationMs, cropItemCount: work.cropItemCount, cropReusedCount: work.cropReusedCount, layoutCandidateCount: work.layoutCandidateCount ?? 0 },
  };
}
