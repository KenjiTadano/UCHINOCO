import { ALBUM_GENERATION_VERSION } from "../album-generation/config.ts";
import type { AlbumSpreadDraft } from "../album-draft/types.ts";
import type { AlbumCompositionPlan } from "../album-draft/composition.ts";
import type { LayoutAlternative, SpreadLayoutRanking } from "../album-draft/types.ts";
import { DRAFT_GENERATION_METADATA } from "./config.ts";
import type { CropTriple } from "./types.ts";

export type PersistableAssignment = {
  frameId: string;
  role: string;
  photoId: string;
  crop: CropTriple;
  cropQuality: number;
  matchTier: string;
  warnings: string[];
};

export type PersistableSpread = {
  storySpreadId: string;
  layoutId: string;
  warnings: string[];
  story: {
    storyType: string;
    recommendedDensity: string;
    importance: number;
    coherenceScore: number;
  };
  selectedLayout?: LayoutAlternative | null;
  alternatives?: LayoutAlternative[];
  assignments: PersistableAssignment[];
};

export type DraftSavePayload = {
  generationVersion: string;
  metadata: Record<string, unknown>;
  spreads: Array<{
    storySpreadId: string;
    position: number;
    storyType: string;
    recommendedDensity: string;
    importance: number;
    coherence: number;
    aiLayoutId: string;
    warnings: string[];
    frames: Array<{
      frameId: string;
      role: string;
      position: number;
      aiPhotoId: string;
      aiCropX: number;
      aiCropY: number;
      aiCropScale: number;
      matchTier: string;
      cropQuality: number;
      warnings: string[];
    }>;
  }>;
};

export function toPersistableSpread(spread: AlbumSpreadDraft): PersistableSpread {
  return {
    storySpreadId: spread.storySpreadId,
    layoutId: spread.layoutId,
    warnings: spread.warnings,
    story: {
      storyType: spread.story.storyType,
      recommendedDensity: spread.story.recommendedDensity,
      importance: spread.story.importance,
      coherenceScore: spread.story.coherenceScore,
    },
    selectedLayout: spread.selectedLayout,
    alternatives: spread.alternatives,
    assignments: spread.assignments.map((assignment) => ({
      frameId: assignment.frameId,
      role: assignment.role,
      photoId: assignment.photoId,
      crop: assignment.crop,
      cropQuality: assignment.cropQuality,
      matchTier: assignment.matchTier,
      warnings: assignment.warnings,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function layoutAlternativeFrom(value: unknown): LayoutAlternative | null {
  if (!isRecord(value)) return null;
  const tier = value.tier;
  const composition = value.composition;
  if (
    typeof value.layoutId !== "string" ||
    !["STRICT", "FALLBACK", "UNUSABLE"].includes(String(tier)) ||
    !["hero", "equal", "story", "grid", "editorial", "quiet", "fullBleed"].includes(String(composition)) ||
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    typeof value.finalScore !== "number" ||
    !Number.isFinite(value.finalScore) ||
    typeof value.layoutScore !== "number" ||
    !Number.isFinite(value.layoutScore)
  )
    return null;
  const fit = (key: string) => (typeof value[key] === "number" && Number.isFinite(value[key]) ? (value[key] as number) : null);
  const debugReasons = Array.isArray(value.debugReasons) ? value.debugReasons.filter((reason): reason is string => typeof reason === "string") : [];
  return {
    layoutId: value.layoutId,
    score: value.score,
    layoutScore: value.layoutScore,
    finalScore: value.finalScore,
    tier: tier as LayoutAlternative["tier"],
    matchTier: (value.matchTier === tier ? value.matchTier : tier) as LayoutAlternative["matchTier"],
    composition: composition as LayoutAlternative["composition"],
    orientationFit: fit("orientationFit"),
    heroFit: fit("heroFit"),
    captionFit: fit("captionFit"),
    storyFit: fit("storyFit"),
    debugReasons,
  };
}

export function parseLayoutRankings(value: unknown): Record<string, SpreadLayoutRanking> {
  if (!isRecord(value)) return {};
  const rankings: Record<string, SpreadLayoutRanking> = {};
  for (const [storySpreadId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const selectedLayout = layoutAlternativeFrom(raw.selectedLayout);
    if (!selectedLayout) continue;
    const alternatives = Array.isArray(raw.alternatives) ? raw.alternatives.map(layoutAlternativeFrom).filter((item): item is LayoutAlternative => item !== null) : [];
    rankings[storySpreadId] = { selectedLayout, alternatives };
  }
  return rankings;
}

/** Stable identity of an AI draft. Same photos, roles, layouts, and crops. */
export function draftSignature(spreads: PersistableSpread[], composition?: AlbumCompositionPlan | null) {
  const spreadSignature = spreads.map((spread) => `${spread.layoutId}:${spread.assignments.map((item) => `${item.photoId}:${item.role}:${item.crop.x}:${item.crop.y}:${item.crop.scale}`).join("+")}`).join("|");
  return composition ? `${spreadSignature}|composition:${JSON.stringify(composition)}` : spreadSignature;
}

/** AI columns only. User override columns are left null by the database insert. */
export function buildDraftSavePayload(spreads: PersistableSpread[], warnings: string[] = [], composition?: AlbumCompositionPlan | null, extraMetadata: Record<string, unknown> = {}): DraftSavePayload {
  const layoutRankings = Object.fromEntries(spreads.flatMap((spread) => (spread.selectedLayout ? [[spread.storySpreadId, { selectedLayout: spread.selectedLayout, alternatives: spread.alternatives ?? [] }]] : [])));
  return {
    generationVersion: ALBUM_GENERATION_VERSION,
    metadata: {
      ...DRAFT_GENERATION_METADATA,
      signature: draftSignature(spreads, composition),
      warnings,
      layoutRankings,
      ...(composition ? { composition } : {}),
      ...extraMetadata,
    },
    spreads: spreads.map((spread, index) => ({
      storySpreadId: spread.storySpreadId,
      position: index,
      storyType: spread.story.storyType,
      recommendedDensity: spread.story.recommendedDensity,
      importance: spread.story.importance,
      coherence: spread.story.coherenceScore,
      aiLayoutId: spread.layoutId,
      warnings: spread.warnings,
      frames: spread.assignments.map((frame, position) => ({
        frameId: frame.frameId,
        role: frame.role,
        position,
        aiPhotoId: frame.photoId,
        aiCropX: frame.crop.x,
        aiCropY: frame.crop.y,
        aiCropScale: frame.crop.scale,
        matchTier: frame.matchTier,
        cropQuality: frame.cropQuality,
        warnings: frame.warnings,
      })),
    })),
  };
}
