import type { StoryDensity } from "../album-story/types.ts";
import type { LayoutMatchResult } from "../smart-layout/types.ts";
import { templateMetadata } from "../smart-layout/template-system.ts";
import type { TemplateComposition, TemplateDensity, WhitespaceIntent } from "../smart-layout/types.ts";

export type LayoutFamily = "hero" | "equal" | "story" | "grid" | "quiet";
export type LayoutOrientation = "portrait" | "landscape" | "square" | "mixed";

export type LayoutRhythmEntry = {
  layoutId: string;
  family: LayoutFamily;
  density: StoryDensity;
  heroStrength: number;
  orientation: LayoutOrientation;
  composition?: TemplateComposition;
  templateDensity?: TemplateDensity;
  whitespaceIntent?: WhitespaceIntent;
};

export type LayoutRhythmContext = {
  recent: LayoutRhythmEntry[];
};

export type LayoutRhythmDebug = {
  family: LayoutFamily;
  adjustment: number;
  recentFamilies: LayoutFamily[];
  repeatStreak: number;
  candidateGap: number | null;
  composition: TemplateComposition;
  whitespaceIntent: WhitespaceIntent;
};

export type RhythmCandidateContext = {
  repeatStreak: number;
  candidateGap: number | null;
  candidateIsBest: boolean;
};

function clamp(n: number) {
  return Math.max(-8, Math.min(4, Math.round(n)));
}

export function layoutFamily(result: LayoutMatchResult): LayoutFamily {
  const frames = result.layout.frames;
  const heroFrames = frames.filter((frame) => frame.slotRole === "hero");
  if (heroFrames.length > 0) {
    return result.layout.purpose === "story" && frames.length > 1 ? "story" : "hero";
  }
  if (result.layout.purpose === "collage" && frames.length >= 4) return "grid";
  if (result.layout.purpose === "collage" || result.layout.purpose === "sequence") return "equal";
  return "quiet";
}

function layoutOrientation(result: LayoutMatchResult): LayoutOrientation {
  const shapes = new Set(result.layout.frames.map((frame) => frame.cropShapeId));
  if (shapes.has("portrait") && !shapes.has("landscape")) return "portrait";
  if (shapes.has("landscape") && !shapes.has("portrait")) return "landscape";
  if (shapes.size === 1 && shapes.has("square")) return "square";
  return "mixed";
}

function isHeroLike(entry: LayoutRhythmEntry) {
  return (entry.family === "hero" || entry.family === "story") && entry.heroStrength >= 0.75;
}

export function rhythmAdjustment(result: LayoutMatchResult, density: StoryDensity, context?: LayoutRhythmContext, candidate?: RhythmCandidateContext): LayoutRhythmDebug {
  const family = layoutFamily(result);
  const orientation = layoutOrientation(result);
  const metadata = templateMetadata(result.layout);
  const recent = context?.recent ?? [];
  if (recent.length === 0) return { family, adjustment: 0, recentFamilies: [], repeatStreak: 0, candidateGap: null, composition: metadata.composition, whitespaceIntent: metadata.whitespaceIntent };

  const previous = recent[recent.length - 1];
  let adjustment = previous.layoutId === result.layoutId ? -4 : previous.family === family ? -3 : 1;
  const sameFamilyCount = recent.filter((entry) => entry.family === family).length;
  const sameDensityCount = recent.filter((entry) => entry.density === density).length;
  if (sameFamilyCount >= 2) adjustment -= 2;
  if (sameDensityCount >= 2) adjustment -= 1;
  else if (previous.density !== density) adjustment += 1;

  if (candidate?.candidateIsBest && candidate.repeatStreak >= 3) {
    if (candidate.candidateGap !== null && candidate.candidateGap <= 3) {
      adjustment -= Math.min(6, 3 + (candidate.repeatStreak - 3));
    }
  } else if (candidate?.candidateIsBest && candidate.repeatStreak >= 2) {
    adjustment -= 1;
  }

  let heroLikeStreak = 0;
  for (let index = recent.length - 1; index >= 0 && isHeroLike(recent[index]); index--) {
    heroLikeStreak++;
  }
  const currentHeroLike = isHeroLike({
    layoutId: result.layoutId,
    family,
    density,
    heroStrength: result.heroConfidence,
    orientation,
  });
  if (currentHeroLike && heroLikeStreak >= 2) adjustment -= 5;
  else if (currentHeroLike && heroLikeStreak === 1) adjustment -= 2;
  if ((family === "hero" || family === "story") && orientation !== "mixed" && previous.orientation === orientation) adjustment -= 1;
  const sameComposition = recent.filter((entry) => entry.composition === metadata.composition).length;
  if (sameComposition >= 2) adjustment -= 2;
  else if (previous.composition && previous.composition !== metadata.composition) adjustment += 1;
  const denseStreak = recent.length >= 2 && recent.slice(-2).every((entry) => entry.templateDensity === "dense");
  if (previous.templateDensity === "dense" && metadata.density === "dense") adjustment -= 2;
  if (denseStreak && metadata.density === "dense") adjustment -= 2;
  if (denseStreak && (metadata.whitespaceIntent === "quiet" || metadata.whitespaceIntent === "editorial")) adjustment += 1;

  return {
    family,
    adjustment: clamp(adjustment),
    recentFamilies: recent.map((entry) => entry.family),
    repeatStreak: candidate?.repeatStreak ?? 0,
    candidateGap: candidate?.candidateGap ?? null,
    composition: metadata.composition,
    whitespaceIntent: metadata.whitespaceIntent,
  };
}

export function rhythmEntry(result: LayoutMatchResult, density: StoryDensity): LayoutRhythmEntry {
  const family = layoutFamily(result);
  const metadata = templateMetadata(result.layout);
  return {
    layoutId: result.layoutId,
    family,
    density,
    heroStrength: result.heroConfidence,
    orientation: layoutOrientation(result),
    composition: metadata.composition,
    templateDensity: metadata.density,
    whitespaceIntent: metadata.whitespaceIntent,
  };
}
