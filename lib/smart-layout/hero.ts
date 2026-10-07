/**
 * Task050.2 — Hero suitability and hero confidence calculations
 * combining Photo Intelligence, Best Shot, and intrinsic quality.
 */
import type { LayoutPhotoInput } from "./types.ts";
import { estimatePhotoQuality } from "./photo-set.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/**
 * Compute 0–100 suitability for hero / primary slots.
 * Combines PI core metrics, Best Shot role, and intrinsic analysis quality.
 */
export function computeHeroSuitability(photo: LayoutPhotoInput): number {
  const pi = photo.photoIntelligence;
  const bs = photo.bestShot;
  const candidate = bs?.candidate;
  const intrinsic = estimatePhotoQuality(photo.analysis);

  if (!pi) {
    // Fallback to intrinsic quality if PI is absent
    let base = intrinsic;
    if (candidate?.role === "primary") {
      base += 10;
      base += Math.max(0, Math.min(100, candidate.scores.sceneRepresentativeness)) * 0.04;
    }
    if (candidate?.role === "secondary") base -= 5;
    return clampScore(base);
  }

  // Core PI components (composition, visibility, expression, technical)
  const comp = pi.composition ?? 70;
  const vis = pi.petVisibility ?? 70;
  const expr = pi.expression ?? 70;
  const tech = pi.technicalQuality ?? 70;
  const mem = pi.memoryValue ?? 50;

  // Weighted combination: technical and composition/visibility are paramount for hero
  let score = comp * 0.3 + vis * 0.25 + tech * 0.25 + expr * 0.15 + mem * 0.05; // Memory is light helper only

  // Best Shot role adjustments
  if (candidate) {
    if (candidate.role === "primary") {
      score += 10;
      score += Math.max(0, Math.min(100, candidate.scores.sceneRepresentativeness)) * 0.04;
    } else if (candidate.role === "secondary") {
      score -= 4; // Supporting role
    } else if (candidate.role === "alternate") {
      score -= 10;
    }
  }

  // Sanity check against low technical / bad status
  if (pi.status === "low_quality" || tech < 50) {
    score = Math.min(score, 50);
  }

  return clampScore(score);
}

/**
 * Compute 0–1 confidence for whether a clear hero exists in the photo set.
 * Uses suitability gap between top candidates and safety checks.
 */
export function computeHeroConfidence(photos: LayoutPhotoInput[]): number {
  if (photos.length <= 1) return 0.7;

  const suits = photos.map((p) => computeHeroSuitability(p));
  suits.sort((a, b) => b - a);

  const topGap = suits[0] - (suits[1] ?? suits[0]);
  const absoluteTop = suits[0];

  // Gap-based confidence (e.g. 92 vs 73 -> large gap -> high confidence)
  let gapConf = 0.5;
  if (topGap >= 12) gapConf = 0.92;
  else if (topGap >= 7) gapConf = 0.78;
  else if (topGap >= 3) gapConf = 0.6;
  else gapConf = 0.35; // Near equal (e.g. 88 / 87 / 86)

  // Scale by absolute level and whether top photo is primary / high quality
  const topPhoto = photos.find((p) => computeHeroSuitability(p) === suits[0]);
  const isPrimary = topPhoto?.bestShot?.candidate.role === "primary";
  let multiplier = 1.0;
  if (absoluteTop < 70) multiplier = 0.8;
  if (isPrimary) multiplier = Math.min(1.1, multiplier * 1.08);

  return Math.max(0.0, Math.min(1.0, gapConf * multiplier));
}
