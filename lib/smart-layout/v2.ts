import type { StoryType } from "../album-story/types.ts";
import { templateMetadata } from "./template-system.ts";
import { buildOrientationProfile } from "./photo-set.ts";
import type { LayoutMatchResult, LayoutPhotoInput, SmartLayoutV2Debug, TemplateComposition } from "./types.ts";

export type SmartLayoutV2Context = {
  captionAvailable?: boolean;
  storyType?: StoryType;
  maxCandidates?: number;
};

function storyCompositionFit(storyType: StoryType | undefined, composition: TemplateComposition) {
  if (!storyType) return 0;
  if (storyType === "single") return composition === "hero" || composition === "fullBleed" ? 3 : -1;
  if (storyType === "sequence" || storyType === "same_day") return composition === "story" || composition === "editorial" ? 3 : 0;
  if (storyType === "contrast") return composition === "equal" || composition === "grid" ? 3 : 0;
  if (storyType === "event") return composition === "hero" || composition === "story" ? 2 : 0;
  return composition === "quiet" || composition === "editorial" || composition === "grid" ? 2 : 0;
}

function clampAdjustment(value: number) {
  return Math.max(-6, Math.min(6, value));
}

/** Adds small, explainable preferences without overriding crop-safety tiers. */
export function withSmartLayoutV2Score(result: LayoutMatchResult, photos: LayoutPhotoInput[], context: SmartLayoutV2Context = {}): LayoutMatchResult {
  const meta = templateMetadata(result.layout);
  const dominant = buildOrientationProfile(photos).dominant;
  const orientationFit = meta.orientationAffinity.includes(dominant) ? 3 : meta.orientationAffinity.some((value) => value === "any" || value === "mixed") ? 1 : -1;
  const heroAssignment = result.assignments.find((assignment) => assignment.slotRole === "hero");
  const wantsHero = meta.heroAffinity === "required" || meta.heroAffinity === "preferred";
  const heroFit = result.heroConfidence >= 0.65
    ? wantsHero && heroAssignment?.frameMatch.matchTier === "strict" ? 3 : wantsHero ? -2 : 0
    : result.heroConfidence < 0.35 && meta.heroAffinity === "avoid" ? 2 : result.heroConfidence < 0.35 && meta.heroAffinity === "required" ? -2 : 0;
  const captionAvailable = context.captionAvailable ?? photos.some((photo) => photo.captionAvailable);
  const captionFit = captionAvailable ? meta.captionSupport === "prominent" ? 2 : 0 : meta.captionSupport === "prominent" ? -2 : 0;
  const storyFit = storyCompositionFit(context.storyType, meta.composition);
  const cropFit = result.tier === "strict" ? 1 : result.tier === "fallback" ? -2 : -6;
  const spreadSafety = meta.printSafe ? 0 : -4;
  // Orientation, hero and crop are already first-class Task050 engine signals.
  // Keep them visible for diagnosis, but do not double-count them. Grammar v1
  // contributes only newly introduced semantic context here.
  const templateAffinity = clampAdjustment(captionFit + storyFit + spreadSafety);
  const v2: SmartLayoutV2Debug = {
    family: meta.composition,
    orientationFit,
    heroFit,
    captionFit,
    storyFit,
    cropFit,
    spreadSafety,
    templateAffinity,
    finalScore: Math.max(0, Math.min(100, result.scores.overall + templateAffinity)),
  };
  return { ...result, v2 };
}
