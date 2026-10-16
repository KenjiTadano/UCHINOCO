import type { AlbumSpreadDraft } from './types.ts';
import type { StorySpread } from '../album-story/types.ts';
import type { LayoutPhotoInput } from '../smart-layout/types.ts';

export type EditorialTextKind = 'none' | 'dateOnly' | 'meaningfulCaption' | 'title/event' | 'userProvided';
export function classifyEditorialText(text: string | null | undefined, origin?: 'title/event' | 'userProvided'): EditorialTextKind {
  const clean = text?.replace(/[<>]/g, '').trim() ?? '';
  if (!clean) return 'none';
  const date = /^(?:\d{4}年\s*\d{1,2}月\s*\d{1,2}日|\d{4}-\d{2}-\d{2})[。\s]*$/;
  if (clean.split(/\r?\n/).filter(line => line.trim()).every(line => date.test(line.trim()))) return 'dateOnly';
  return origin ?? 'meaningfulCaption';
}
export function hasMeaningfulEditorialText(text: string | null | undefined) {
  const kind = classifyEditorialText(text);
  return kind !== 'none' && kind !== 'dateOnly';
}
export function editorialDensityMetrics(spreads: AlbumSpreadDraft[], texts: Record<string, string>) {
  let photoOccupiedPageCount = 0, dateOnlyPageCount = 0, meaningfulTextOnlyPageCount = 0;
  for (const spread of spreads) {
    const occupied = new Set(spread.assignments.map(a => a.placement.side)).size;
    photoOccupiedPageCount += occupied;
    const kind = classifyEditorialText(texts[spread.storySpreadId]);
    if (kind === 'dateOnly') dateOnlyPageCount += 2 - occupied;
    else if (kind !== 'none') meaningfulTextOnlyPageCount += 2 - occupied;
  }
  return { photoOccupiedPageCount, emptyPhotoPageCount: spreads.length * 2 - photoOccupiedPageCount, dateOnlyPageCount, meaningfulTextOnlyPageCount,
    singlePhotoSpreadCount: spreads.filter(s => s.assignments.length === 1).length,
    closingSparseSpreadCount: spreads.filter(s => s.layoutId === 'E_CLOSING' && s.assignments.length === 1).length };
}
export const MAX_REBALANCE_ATTEMPTS = 12;
export const MAX_REBALANCE_LAYOUTS = 3;
const REASONS = ['noSafeDonor', 'chronologyConstraint', 'petBalanceConstraint', 'sceneConstraint', 'cropSafety', 'sourceClipping', 'templateIncompatibility', 'boundedSearchExhausted'] as const;
export type DensityDiagnostics = ReturnType<typeof editorialDensityMetrics> & {
  initialClosingSparseSpreadCount: number; finalClosingSparseSpreadCount: number;
  closingCleanupAttemptCount: number; closingCleanupSuccessCount: number;
  closingCleanupFailureReasonCounts: Record<string, number>;
  rebalanceAttemptCount: number; rebalanceSuccessCount: number; initialDateOnlyPageCount: number; finalDateOnlyPageCount: number;
  rebalanceFailureReasonCounts: Record<typeof REASONS[number], number>;
};
type Evaluate = (story: StorySpread, index: number) => { drafts: AlbumSpreadDraft[]; rejection: 'sourceClipping' | 'cropSafety' | 'templateIncompatibility' | null };

/** A quality-only pass. The caller supplies the original safety evaluator and whole-book audit. */
export function rebalanceEditorialDensity(input: { stories: StorySpread[]; spreads: AlbumSpreadDraft[]; photos: LayoutPhotoInput[]; texts: Record<string, string>; evaluate: Evaluate; validBook: (spreads: AlbumSpreadDraft[]) => boolean }) {
  let stories = input.stories.slice(), spreads = input.spreads.slice();
  const initial = editorialDensityMetrics(spreads, input.texts);
  const failures = Object.fromEntries(REASONS.map(r => [r, 0])) as DensityDiagnostics['rebalanceFailureReasonCounts'];
  let attempts = 0, successes = 0;
  const photos = new Map(input.photos.map(p => [p.photoId, p]));
  const score = (id: string) => photos.get(id)?.bestShot?.candidate.scores.overall ?? 0;
  const photoSet = stories.flatMap(s => s.photoIds).sort().join('\n');
  const receivers = stories.map((_, i) => i).filter(i => stories[i].photoIds.length === 1 && classifyEditorialText(input.texts[stories[i].id]) === 'dateOnly');
  for (const receiver of receivers) {
    if (attempts >= MAX_REBALANCE_ATTEMPTS) { failures.boundedSearchExhausted++; break; }
    const target = stories[receiver];
    const donors = stories.map((s, i) => ({ s, i })).filter(({ s }) => s.photoIds.length >= 3)
      .sort((a, b) => Math.abs(Date.parse(a.s.startedAt) - Date.parse(target.startedAt)) - Math.abs(Date.parse(b.s.startedAt) - Date.parse(target.startedAt)) || Math.abs(a.i - receiver) - Math.abs(b.i - receiver) || a.i - b.i).slice(0, 4);
    if (!donors.length) { failures.noSafeDonor++; continue; }
    let accepted = false;
    for (const { i: donor } of donors) {
      const source = stories[donor];
      // Keep both existing Best Shots and therefore their factual text anchors.
      const movable = source.secondaryPhotoIds.filter(id => !source.primaryPhotoIds.includes(id)).sort((a, b) => score(a) - score(b) || a.localeCompare(b)).slice(0, 2);
      for (const id of movable) {
        if (attempts >= MAX_REBALANCE_ATTEMPTS) break;
        attempts++;
        if ([...source.photoIds, ...target.photoIds].some(id => !photos.get(id)?.timeline || !photos.get(id)?.groupId)) { failures.chronologyConstraint++; continue; }
        const photo = photos.get(id), lead = photos.get(target.primaryPhotoIds[0]);
        if (!photo || !lead || score(id) > score(lead.photoId)) { failures.templateIncompatibility++; continue; }
        const petSets = [source, target].map(s => [...new Set(s.photoIds.map(id => photos.get(id)?.petId))].sort().join('|'));
        if (!photo.petId || petSets[0] !== petSets[1] || !source.photoIds.some(other => other !== id && photos.get(other)?.petId === photo.petId)) { failures.petBalanceConstraint++; continue; }
        if (photo.groupId !== lead.groupId && !(photo.scene && photo.scene === lead.scene && photo.activity === lead.activity)) { failures.sceneConstraint++; continue; }
        const update = (story: StorySpread, ids: string[]): StorySpread => {
          const ordered = ids.map(id => photos.get(id)!).sort((a,b) => a.timeline!.localeCompare(b.timeline!) || a.photoId.localeCompare(b.photoId));
          return { ...story, photoIds: ids, secondaryPhotoIds: ids.filter(id => !story.primaryPhotoIds.includes(id)), sceneIds: [...new Set(ordered.map(p => p.groupId!))], startedAt: ordered[0].timeline!, endedAt: ordered.at(-1)!.timeline!, storyType: ids.length === 1 ? 'single' : 'sequence', recommendedDensity: ids.length >= 4 ? 'dense' : 'medium' };
        };
        const nextStories = stories.slice();
        nextStories[donor] = update(source, source.photoIds.filter(p => p !== id));
        nextStories[receiver] = update(target, [...target.photoIds, id]);
        if (nextStories.some((s,i) => !Number.isFinite(Date.parse(s.startedAt)) || (i > 0 && (s.startedAt < nextStories[i-1].startedAt || Date.parse(nextStories[i-1].endedAt) > Date.parse(s.startedAt))))) { failures.chronologyConstraint++; continue; }
        if (nextStories.flatMap(s => s.photoIds).sort().join('\n') !== photoSet) { failures.templateIncompatibility++; continue; }
        const left = input.evaluate(nextStories[donor], donor), right = input.evaluate(nextStories[receiver], receiver);
        if (!left.drafts.length || !right.drafts.length) { failures[left.rejection ?? right.rejection ?? 'templateIncompatibility']++; continue; }
        const trials: { spreads: AlbumSpreadDraft[]; score: number }[] = [];
        for (const a of left.drafts.slice(0, MAX_REBALANCE_LAYOUTS)) for (const b of right.drafts.slice(0, MAX_REBALANCE_LAYOUTS)) {
          const trial = spreads.slice(); trial[donor] = a; trial[receiver] = b;
          const metrics = editorialDensityMetrics(trial, input.texts), before = editorialDensityMetrics(spreads, input.texts);
          if (metrics.dateOnlyPageCount < before.dateOnlyPageCount && metrics.photoOccupiedPageCount > before.photoOccupiedPageCount && input.validBook(trial)) trials.push({ spreads: trial, score: a.layoutScore + b.layoutScore });
        }
        trials.sort((a,b) => b.score - a.score || a.spreads[donor].layoutId.localeCompare(b.spreads[donor].layoutId) || a.spreads[receiver].layoutId.localeCompare(b.spreads[receiver].layoutId));
        if (!trials.length) { failures.templateIncompatibility++; continue; }
        spreads = trials[0].spreads; stories = nextStories; successes++; accepted = true; break;
      }
      if (accepted || attempts >= MAX_REBALANCE_ATTEMPTS) break;
    }
  }
  const metrics = editorialDensityMetrics(spreads, input.texts);
  if (attempts >= MAX_REBALANCE_ATTEMPTS && stories.some(story => story.photoIds.length >= 3) && metrics.dateOnlyPageCount > 0 && !failures.boundedSearchExhausted) failures.boundedSearchExhausted++;
  const diagnostics: DensityDiagnostics = { ...metrics, initialClosingSparseSpreadCount: initial.closingSparseSpreadCount, finalClosingSparseSpreadCount: metrics.closingSparseSpreadCount, closingCleanupAttemptCount: 0, closingCleanupSuccessCount: 0, closingCleanupFailureReasonCounts: {}, rebalanceAttemptCount: attempts, rebalanceSuccessCount: successes, initialDateOnlyPageCount: initial.dateOnlyPageCount, finalDateOnlyPageCount: metrics.dateOnlyPageCount, rebalanceFailureReasonCounts: failures };
  return { stories, spreads, diagnostics };
}


export const MAX_CLOSING_CLEANUP_ATTEMPTS = 8;
type QualityInput = Parameters<typeof rebalanceEditorialDensity>[0] & {
  evaluate: (story: StorySpread, index: number, cleanup?: boolean) => ReturnType<Evaluate>;
};

/** Completion has already passed every blocking audit. Quality can only replace it transactionally. */
export function completionFirstEditorialQuality(input: QualityInput) {
  const initial = editorialDensityMetrics(input.spreads, input.texts);
  const closingFailures: Record<string, number> = {};
  let attempts = 0, successes = 0;
  const fail = (reason: string) => { closingFailures[reason] = (closingFailures[reason] ?? 0) + 1; };
  const cleaned = input.spreads.slice();
  try {
    for (let i = 0; i < cleaned.length - 1; i++) {
      if (cleaned[i].layoutId !== 'E_CLOSING') continue;
      if (attempts >= MAX_CLOSING_CLEANUP_ATTEMPTS) { fail('boundedSearchExhausted'); break; }
      attempts++;
      const result = input.evaluate(input.stories[i], i, true);
      const alternatives = result.drafts.filter(s => s.status !== 'unusable' && s.layoutId !== 'E_CLOSING')
        .sort((a,b) => b.layoutScore - a.layoutScore || a.layoutId.localeCompare(b.layoutId)).slice(0, MAX_REBALANCE_LAYOUTS);
      if (!alternatives.length) { fail(result.rejection ?? 'noSafeAlternative'); continue; }
      for (const candidate of alternatives) {
        const trial = cleaned.slice(); trial[i] = candidate;
        if (!input.validBook(trial)) { fail('blockingAudit'); continue; }
        cleaned[i] = candidate; successes++; break;
      }
    }
    const density = rebalanceEditorialDensity({ ...input, spreads: cleaned });
    // Defense in depth: neither a photo-set change nor a failing final audit may escape quality.
    const ids = (spreads: AlbumSpreadDraft[]) => spreads.flatMap(s => s.assignments.map(a => a.photoId)).sort().join('\n');
    if (ids(density.spreads) !== ids(input.spreads) || !input.validBook(density.spreads)) throw new Error('qualityFinalValidation');
    return { ...density, diagnostics: { ...density.diagnostics,
      initialDateOnlyPageCount: initial.dateOnlyPageCount,
      initialClosingSparseSpreadCount: initial.closingSparseSpreadCount,
      finalClosingSparseSpreadCount: editorialDensityMetrics(density.spreads, input.texts).closingSparseSpreadCount,
      closingCleanupAttemptCount: attempts, closingCleanupSuccessCount: successes,
      closingCleanupFailureReasonCounts: closingFailures,
    } };
  } catch {
    // Evaluation errors or late audit failures must never turn a completed album into action_required.
    fail('qualityPassRolledBack');
    const diagnostics: DensityDiagnostics = { ...initial,
      initialDateOnlyPageCount: initial.dateOnlyPageCount, finalDateOnlyPageCount: initial.dateOnlyPageCount,
      initialClosingSparseSpreadCount: initial.closingSparseSpreadCount, finalClosingSparseSpreadCount: initial.closingSparseSpreadCount,
      closingCleanupAttemptCount: attempts, closingCleanupSuccessCount: 0, closingCleanupFailureReasonCounts: closingFailures,
      rebalanceAttemptCount: 0, rebalanceSuccessCount: 0,
      rebalanceFailureReasonCounts: { ...Object.fromEntries(REASONS.map(r => [r, 0])) } as DensityDiagnostics['rebalanceFailureReasonCounts'],
    };
    return { stories: input.stories, spreads: input.spreads, diagnostics };
  }
}
