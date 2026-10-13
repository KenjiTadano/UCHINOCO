import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { EDITORIAL_TEMPLATES, NO_CROP_FINAL_TEMPLATES } from "../smart-layout/editorial-library.ts";
import { ALBUM_DRAFT_CONFIG, ALBUM_DRAFT_VERSION } from "./config.ts";
import { EDITORIAL_VERSION, EditorialGenerationError } from "./editorial.ts";
import type { EditorialPhoto } from "./editorial.ts";
import type { StorySpread } from "../album-story/types.ts";
import type { AlbumPageCount } from "../album-capacity.ts";
import { planEditorialAlbum } from "./editorial.ts";
import { sourceSubjectClipped } from "../smart-layout/suitability.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

export type PhotoSubsetSelectionDiagnostics = {
  eligiblePhotoCount: number;
  selectedPhotoCount: number;
  unusedPhotoCount: number;
  subsetAttemptCount: number;
  subsetSuccessCount: number;
  fallbackToPreviousSafeSubsetCount: number;
  initialUnrecoveredCount: number;
  finalUnrecoveredCount: number;
  subsetCandidateCount: number;
  subsetDurationMs: number;
};

export const MAX_SUBSET_SEARCH_ATTEMPTS = 4;

export function scorePhotoQualityAndSuitability(photo: EditorialPhoto, geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>): number {
  let score = photo.candidate.scores.overall;

  if (geometryMap) {
    const analysis = geometryMap.get(photo.photoId);
    if (analysis) {
      if (sourceSubjectClipped(analysis)) {
        score -= 35;
      }
      const suit = analysis.layoutSuitability;
      if (suit) {
        if (!suit.portraitCropSafe && !suit.landscapeCropSafe && !suit.squareCropSafe) {
          score -= 20;
        }
        if (suit.sourceSubjectClipped) {
          score -= 30;
        }
      }
    }
  }

  return score;
}

/**
 * Deterministically ranks eligible photos and produces candidate subsets.
 */
export function rankPhotosForSubset(photos: EditorialPhoto[], geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>): EditorialPhoto[] {
  const eligible = [...new Map(photos.filter((p) => p.candidate.role !== "alternate" && p.candidate.scores.technical >= 25).map((p) => [p.photoId, p])).values()];

  return eligible.sort((a, b) => {
    const scoreA = scorePhotoQualityAndSuitability(a, geometryMap);
    const scoreB = scorePhotoQualityAndSuitability(b, geometryMap);
    return scoreB - scoreA || a.photoId.localeCompare(b.photoId);
  });
}

/**
 * Plans an editorial album using candidate subset search for Monotonic Completion.
 * If excludedPhotoIds is provided, those photos are left unused in the pool.
 */
export function planEditorialAlbumWithSubset(eligiblePhotos: EditorialPhoto[], pageCount: AlbumPageCount, excludedPhotoIds: ReadonlySet<string> = new Set()): { selected: EditorialPhoto[]; spreads: StorySpread[] } {
  const filtered = eligiblePhotos.filter((p) => !excludedPhotoIds.has(p.photoId));
  return planEditorialAlbum(filtered, pageCount);
}

/**
 * Identifies photos in an unsafe spread that are candidates for exclusion/replacement,
 * prioritizing photos with lower suitability, higher crop/clipping risk, or lower overall score.
 */
export function identifyUnsafeSpreadRemovals(story: StorySpread, photoMap: ReadonlyMap<string, EditorialPhoto>, geometryMap?: ReadonlyMap<string, SmartCropPhotoAnalysis>): EditorialPhoto[] {
  const photos = story.photoIds.map((id: string) => photoMap.get(id)).filter((p: EditorialPhoto | undefined): p is EditorialPhoto => Boolean(p));
  if (!photos.length) return [];

  // Sort lowest quality/suitability first so they are removed first
  return [...photos].sort((a, b) => {
    const scoreA = scorePhotoQualityAndSuitability(a, geometryMap);
    const scoreB = scorePhotoQualityAndSuitability(b, geometryMap);
    return scoreA - scoreB || a.photoId.localeCompare(b.photoId);
  });
}

// Stored in the existing draft generation_metadata, never in production logs.
export type PreviousSafeSubset = {
  version: 1;
  scope: string;
  baseCount: number;
  baseTokens: string[];
  selectedPhotoIds: string[];
  selectedPhotos: EditorialPhoto[];
  stories: StorySpread[];
  layouts: Record<string, string>;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function safeSubsetScope(settings: unknown) {
  return createHash("sha256").update(canonical({ settings, editorial: EDITORIAL_VERSION, config: ALBUM_DRAFT_CONFIG, draft: ALBUM_DRAFT_VERSION, templates: [...EDITORIAL_TEMPLATES, ...NO_CROP_FINAL_TEMPLATES], snapshot: 1 })).digest("hex");
}

export function safeSubsetBaseTokens(photos: EditorialPhoto[], geometry: ReadonlyMap<string, SmartCropPhotoAnalysis>, stableInputs?: ReadonlyMap<string, unknown>) {
  return rankPhotosForSubset(photos, geometry).map((photo) => {
    // Base identity deliberately excludes group/rank/relative uniqueness, which
    // may change when one photo becomes eligible. Preserve their prior values
    // separately in selectedPhotos to replay the exact prior evaluation context.
    const source = stableInputs?.get(photo.photoId) ?? { photoId: photo.photoId, petId: photo.petId, timeline: photo.timeline };
    return `${photo.photoId}:${createHash("sha256").update(canonical({ source, analysis: geometry.get(photo.photoId) })).digest("hex")}`;
  }).sort();
}

export function previousSafeSubset(value: unknown, scope: string, tokens: string[], pageCount: AlbumPageCount): PreviousSafeSubset | null {
  if (!value || typeof value !== "object") return null;
  const p = value as PreviousSafeSubset;
  if (p.version !== 1 || p.scope !== scope || p.baseCount !== tokens.length - 1 || !Array.isArray(p.baseTokens) || p.baseTokens.length !== p.baseCount || new Set(p.baseTokens).size !== p.baseCount || !p.baseTokens.every((t) => typeof t === "string" && tokens.includes(t))) return null;
  const baseIds = new Set(p.baseTokens.map((t) => t.slice(0, t.lastIndexOf(":"))));
  if (!Array.isArray(p.selectedPhotoIds) || !p.selectedPhotoIds.every((id) => baseIds.has(id)) || !Array.isArray(p.stories) || p.stories.length !== pageCount / 2 || !p.layouts || typeof p.layouts !== "object") return null;
  if (!p.stories.every((s) => s && typeof s.id === "string" && Array.isArray(s.photoIds) && s.photoIds.length > 0 && s.photoIds.every((id) => p.selectedPhotoIds.includes(id)) && typeof p.layouts[s.id] === "string")) return null;
  if (!Array.isArray(p.selectedPhotos) || p.selectedPhotos.length !== p.selectedPhotoIds.length || !p.selectedPhotos.every((photo, i) => photo && photo.photoId === p.selectedPhotoIds[i] && typeof photo.petId === "string" && photo.candidate?.scores && typeof photo.candidate.scores.overall === "number")) return null;
  const used = p.stories.flatMap((s) => s.photoIds);
  if (new Set(used).size !== used.length || new Set(used).size !== p.selectedPhotoIds.length) return null;
  return p;
}

export type SubsetPlan = { selected: EditorialPhoto[]; spreads: StorySpread[]; preservedLayouts?: Record<string, string> };

/** Shared by the server action and regression tests. No caller-specified exclusions.
 * Reserve the final attempt for the persisted N-photo safe plan: unchanged base
 * tokens + one addition reproduce its stories/roles/layouts without reranking.
 * The evaluator must recheck safety; budget exhaustion never becomes unsafe PASS.
 */
export async function searchSafePhotoSubset<T extends { selectedPhotoIds: string[]; stories: StorySpread[]; recovery: { unrecoveredCount: number } }>(input: {
  photos: EditorialPhoto[];
  geometry: ReadonlyMap<string, SmartCropPhotoAnalysis>;
  pageCount: AlbumPageCount;
  unsafeStories: StorySpread[];
  initialUnrecoveredCount: number;
  currentSelectedCount: number;
  previous: PreviousSafeSubset | null;
  budgetExceeded: () => boolean;
  evaluate: (plan: SubsetPlan) => Promise<T>;
  onDiagnostics?: (diagnostics: PhotoSubsetSelectionDiagnostics) => void;
}) {
  const started = performance.now();
  const ranked = rankPhotosForSubset(input.photos, input.geometry);
  const photoMap = new Map(ranked.map((p) => [p.photoId, p]));
  const implicated = new Map<string, number>();
  for (const story of input.unsafeStories) for (const p of identifyUnsafeSpreadRemovals(story, photoMap, input.geometry)) implicated.set(p.photoId, (implicated.get(p.photoId) ?? 0) + 1);
  const removals = [...implicated.keys()].sort((a, b) => (implicated.get(b)! - implicated.get(a)!) || scorePhotoQualityAndSuitability(photoMap.get(a)!, input.geometry) - scorePhotoQualityAndSuitability(photoMap.get(b)!, input.geometry) || photoMap.get(a)!.candidate.scores.relativeUniqueness - photoMap.get(b)!.candidate.scores.relativeUniqueness || a.localeCompare(b));
  const ordinaryLimit = MAX_SUBSET_SEARCH_ATTEMPTS - Number(Boolean(input.previous));
  const candidates: Array<{ removal?: string; previous?: PreviousSafeSubset }> = removals.slice(0, ordinaryLimit).map((removal) => ({ removal }));
  if (input.previous) candidates.push({ previous: input.previous });
  const diagnostics: PhotoSubsetSelectionDiagnostics = {
    eligiblePhotoCount: ranked.length, selectedPhotoCount: input.currentSelectedCount, unusedPhotoCount: Math.max(0, ranked.length - input.currentSelectedCount), subsetAttemptCount: 0, subsetSuccessCount: 0, fallbackToPreviousSafeSubsetCount: 0, initialUnrecoveredCount: input.initialUnrecoveredCount, finalUnrecoveredCount: input.initialUnrecoveredCount, subsetCandidateCount: candidates.length, subsetDurationMs: 0,
  };
  for (const candidate of candidates) {
    if (input.budgetExceeded()) break;
    diagnostics.subsetAttemptCount++;
    try {
      const plan: SubsetPlan = candidate.previous
        ? { selected: candidate.previous.selectedPhotos, spreads: candidate.previous.stories, preservedLayouts: candidate.previous.layouts }
        : planEditorialAlbumWithSubset(ranked, input.pageCount, new Set([candidate.removal!]));
      const editorial = await input.evaluate(plan);
      diagnostics.finalUnrecoveredCount = editorial.recovery.unrecoveredCount;
      if (editorial.recovery.unrecoveredCount !== 0) continue;
      diagnostics.subsetSuccessCount = 1;
      diagnostics.fallbackToPreviousSafeSubsetCount = Number(Boolean(candidate.previous));
      diagnostics.selectedPhotoCount = editorial.selectedPhotoIds.length;
      diagnostics.unusedPhotoCount = ranked.length - editorial.selectedPhotoIds.length;
      diagnostics.subsetDurationMs = performance.now() - started;
      input.onDiagnostics?.(diagnostics);
      return { editorial, plan: { ...plan, selected: editorial.selectedPhotoIds.map((id) => plan.selected.find((p) => p.photoId === id) ?? photoMap.get(id)!), spreads: editorial.stories }, diagnostics };
    } catch (error) {
      // Only layout failures are recoverable; other failures still emit diagnostics.
      if (!(error instanceof EditorialGenerationError)) {
        diagnostics.subsetDurationMs = performance.now() - started;
        input.onDiagnostics?.(diagnostics);
        throw error;
      }
      const recovery = (error as Error & { recoveryStats?: { unrecoveredCount: number } }).recoveryStats;
      if (recovery) diagnostics.finalUnrecoveredCount = recovery.unrecoveredCount;
    }
  }
  diagnostics.subsetDurationMs = performance.now() - started;
  input.onDiagnostics?.(diagnostics);
  return { editorial: null, plan: null, diagnostics };
}

export function snapshotSafeSubset(scope: string, baseTokens: string[], editorial: { selectedPhotoIds: string[]; stories: StorySpread[]; spreads: Array<{ storySpreadId: string; layoutId: string }> }, selectedPhotos: EditorialPhoto[]): PreviousSafeSubset {
  return { version: 1, scope, baseCount: baseTokens.length, baseTokens, selectedPhotoIds: editorial.selectedPhotoIds, selectedPhotos: editorial.selectedPhotoIds.map((id) => selectedPhotos.find((p) => p.photoId === id)!), stories: editorial.stories, layouts: Object.fromEntries(editorial.spreads.map((s) => [s.storySpreadId, s.layoutId])) };
}


export async function loadPreviousSafeSubset(client: SupabaseClient, ownerId: string, scope: string, tokens: string[], pageCount: AlbumPageCount) {
  const { data, error } = await client.from("album_draft_versions")
    .select("generation_metadata,albums!inner(owner_user_id)")
    .eq("albums.owner_user_id", ownerId)
    .eq("generation_metadata->safe_subset->>scope", scope)
    .eq("generation_metadata->safe_subset->>baseCount", String(tokens.length - 1))
    // String input is required: PostgREST array input serializes as a SQL array,
    // while this column is JSONB and must receive a JSON array literal.
    .containedBy("generation_metadata->safe_subset->baseTokens", JSON.stringify(tokens))
    .order("created_at", { ascending: false }).limit(1);
  const metadata = data?.[0]?.generation_metadata as Record<string, unknown> | undefined;
  return { previous: previousSafeSubset(metadata?.safe_subset, scope, tokens, pageCount), error };
}
