/**
 * Task050.1 — Photo-set features (orientation / quality dispersion).
 * No layout-id hardcoding; derived from photo analyses (layout-independent).
 */
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";
import type { LayoutPhotoInput } from "./types.ts";

export type OrientationProfile = {
  /** Dominant orientation among photos, or "mixed". */
  dominant: "landscape" | "portrait" | "square" | "mixed";
  landscapeCount: number;
  portraitCount: number;
  squareCount: number;
  allSame: boolean;
  allLandscape: boolean;
  allPortrait: boolean;
};

export type QualityProfile = {
  /** Per-photo intrinsic quality (analysis-based, layout-independent). */
  perPhoto: number[];
  max: number;
  min: number;
  /** max - min */
  dispersion: number;
  /** Index of strongest photo */
  bestIndex: number;
  /** Index of weakest photo */
  weakIndex: number;
  /** 0–100: how much hierarchy the set wants */
  hierarchyNeed: number;
};

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

export function buildOrientationProfile(
  photos: LayoutPhotoInput[],
): OrientationProfile {
  let landscapeCount = 0;
  let portraitCount = 0;
  let squareCount = 0;
  for (const p of photos) {
    if (p.analysis.orientation === "landscape") landscapeCount++;
    else if (p.analysis.orientation === "portrait") portraitCount++;
    else squareCount++;
  }
  const n = photos.length;
  const allLandscape = landscapeCount === n && n > 0;
  const allPortrait = portraitCount === n && n > 0;
  const allSame =
    (landscapeCount === n || portraitCount === n || squareCount === n) && n > 0;

  let dominant: OrientationProfile["dominant"] = "mixed";
  if (allLandscape) dominant = "landscape";
  else if (allPortrait) dominant = "portrait";
  else if (squareCount === n && n > 0) dominant = "square";
  else if (landscapeCount > portraitCount && landscapeCount > squareCount) {
    dominant = "landscape";
  } else if (portraitCount > landscapeCount && portraitCount > squareCount) {
    dominant = "portrait";
  } else if (squareCount > landscapeCount && squareCount > portraitCount) {
    dominant = "square";
  }

  return {
    dominant,
    landscapeCount,
    portraitCount,
    squareCount,
    allSame,
    allLandscape,
    allPortrait,
  };
}

/**
 * Layout-independent photo strength for hierarchy decisions.
 * Favors large faces / high confidence / clear subjects over tiny distant faces.
 */
export function estimatePhotoQuality(analysis: SmartCropPhotoAnalysis): number {
  const pets = analysis.pets ?? [];
  if (pets.length === 0) return 38;

  let best = 0;
  for (const pet of pets) {
    const face = pet.face;
    const faceArea = face ? face.width * face.height : 0;
    const bodyArea = pet.bbox.width * pet.bbox.height;
    const conf = Math.max(0, Math.min(1, pet.confidence ?? 0.5));

    // Large face fills → hero material; tiny face → weak supporting shot
    const faceScore = Math.min(100, faceArea * 420);
    const bodyScore = Math.min(75, bodyArea * 95);
    const confScore = conf * 100;
    // Multi-pet slight bump (more content)
    const multi = pets.length > 1 ? 4 : 0;

    const q = faceScore * 0.5 + bodyScore * 0.2 + confScore * 0.3 + multi;
    if (q > best) best = q;
  }
  return clampScore(best);
}

/**
 * hierarchyNeed from quality dispersion (photo-set level).
 * gap ~0 → ~12; gap 8 → ~50; gap 20+ → ~90
 */
export function buildQualityProfile(perPhotoQualities: number[]): QualityProfile {
  if (perPhotoQualities.length === 0) {
    return {
      perPhoto: [],
      max: 0,
      min: 0,
      dispersion: 0,
      bestIndex: 0,
      weakIndex: 0,
      hierarchyNeed: 0,
    };
  }
  let max = -Infinity;
  let min = Infinity;
  let bestIndex = 0;
  let weakIndex = 0;
  for (let i = 0; i < perPhotoQualities.length; i++) {
    const q = perPhotoQualities[i];
    if (q > max) {
      max = q;
      bestIndex = i;
    }
    if (q < min) {
      min = q;
      weakIndex = i;
    }
  }
  const dispersion = max - min;
  // Soft curve — small gaps don't force hierarchy
  const hierarchyNeed = clampScore(
    dispersion <= 4
      ? 12 + dispersion * 2.5
      : dispersion <= 12
        ? 28 + (dispersion - 4) * 3.5
        : 56 + (dispersion - 12) * 2.2,
  );
  return {
    perPhoto: perPhotoQualities,
    max,
    min,
    dispersion,
    bestIndex,
    weakIndex,
    hierarchyNeed,
  };
}

/** Build quality profile from photo analyses (same for every layout). */
export function buildPhotoSetQualityProfile(
  photos: LayoutPhotoInput[],
): QualityProfile {
  return buildQualityProfile(photos.map((p) => estimatePhotoQuality(p.analysis)));
}
