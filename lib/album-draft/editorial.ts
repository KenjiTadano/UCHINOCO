import { TEXT_LENGTH_LIMIT } from "../album-persistence/config.ts";
import { buildSpreadDraft } from "./draft.ts";
import type { AlbumSpreadDraft } from "./types.ts";
import type { StorySpread } from "../album-story/types.ts";
import type { BestShotCandidate } from "../best-shot/types.ts";
import type { LayoutPhotoInput } from "../smart-layout/types.ts";
import { EDITORIAL_TEMPLATES, editorialTemplate } from "../smart-layout/editorial-library.ts";
import type { LayoutEvaluationWork } from "../smart-layout/assign.ts";

export const EDITORIAL_VERSION = "album-editorial-v1";
export const ALBUM_PAGE_COUNTS = [24, 48, 72] as const;
export type AlbumPageCount = (typeof ALBUM_PAGE_COUNTS)[number];
export type EditorialPhoto = { photoId: string; petId: string; groupId: string; timeline: string; scene?: string; activity?: string; candidate: BestShotCandidate; confidence: number };
export type RhythmIssue = { code: string; index: number; blocking: boolean };
export type RhythmAudit = { score: number; issues: RhythmIssue[]; layoutCount: number; densityCount: number; heroCount: number; repairedSpreadCount: number };
export class EditorialGenerationError extends Error {}

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
  const spreadCount = pageCount / 2;
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

/** Candidates retain their own crops and geometry. Reconfiguration never swaps IDs alone. */
export function buildEditorialDraft(stories: StorySpread[], photos: LayoutPhotoInput[], textByStory: Record<string, string>, onRhythm?: (event: "started" | "completed", itemCount: number) => void) {
  const work: LayoutEvaluationWork = { cells: new Map(), cropDurationMs: 0, cropItemCount: 0, cropReusedCount: 0 };
  const cropStartedAt = new Date().toISOString();
  const candidates = stories.map((story) =>
    EDITORIAL_TEMPLATES.filter((t) => t.photoCount === story.photoIds.length)
      .map((t) => buildSpreadDraft(story, photos, undefined, [t.id], work))
      .filter((d) => d.status !== "unusable"),
  );
  if (candidates.some((c) => !c.length)) throw new EditorialGenerationError("安全に配置できない写真があります。期間やページ数を変更してください。");
  const selected: AlbumSpreadDraft[] = [];
  for (const options of candidates) {
    const previous = selected.at(-1);
    const previousGroup = previous ? editorialTemplate(previous.layoutId)?.similarGroup : null;
    const fresh = options.filter((o) => o.layoutId !== previous?.layoutId && editorialTemplate(o.layoutId)?.similarGroup !== previousGroup);
    const safe = fresh.length ? fresh : options;
    const usage = (id: string) => selected.filter((s) => s.layoutId === id).length;
    selected.push([...safe].sort((a, b) => b.layoutScore - usage(b.layoutId) * 8 - (a.layoutScore - usage(a.layoutId) * 8) || a.layoutId.localeCompare(b.layoutId))[0]);
  }
  onRhythm?.("started", selected.length);
  const before = auditAlbumRhythm(selected, textByStory);
  let audit = before;
  let repairs = 0;
  // Bounded second pass optimizes whole-book score, retaining safe photo assignments.
  for (let pass = 0; pass < 2 && audit.score < 90; pass++) {
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
  onRhythm?.("completed", repairs);
  if (audit.issues.some((i) => i.blocking)) throw new EditorialGenerationError("白紙や安全でないページを検出しました。期間やページ数を変更してください。");
  for (let i = 0; i < selected.length; i++)
    selected[i] = {
      ...selected[i],
      alternatives: candidates[i]
        .filter((c) => c.layoutId !== selected[i].layoutId)
        .slice(0, 4)
        .flatMap((c) => (c.selectedLayout ? [c.selectedLayout] : [])),
    };
  return { spreads: selected, audit, beforeAudit: before, performance: { cropStartedAt, cropDurationMs: work.cropDurationMs, cropItemCount: work.cropItemCount, cropReusedCount: work.cropReusedCount, layoutCandidateCount: candidates.reduce((sum, options) => sum + options.length, 0) } };
}
