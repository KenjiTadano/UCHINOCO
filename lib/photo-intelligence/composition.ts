import { normalizeRect } from "../smart-crop/geometry.ts";
import type { NormalizedRect, SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 40;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function areaOf(rect: NormalizedRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function edgeTouches(rect: NormalizedRect) {
  let edges = 0;
  if (rect.y <= 0.012) edges++;
  if (rect.x <= 0.012) edges++;
  if (rect.y + rect.height >= 0.988) edges++;
  if (rect.x + rect.width >= 0.988) edges++;
  return edges;
}

/**
 * Composition of the original photograph.
 * Separate from Smart Crop / Frame Matching, which answer "can this be cropped into a frame".
 */
export function scorePhotoComposition(analysis: SmartCropPhotoAnalysis): {
  score: number;
  notes: string[];
} {
  const notes: string[] = [];
  if (analysis.pets.length === 0) {
    return {
      score: 42,
      notes: ["被写体位置が取れないため、構図は仮の評価です。"],
    };
  }

  const bodies = analysis.pets.map((pet) => normalizeRect(pet.bbox));
  const areas = bodies.map(areaOf);
  const total = areas.reduce((sum, area) => sum + area, 0);
  const largestArea = Math.max(...areas);
  const largest = bodies[areas.indexOf(largestArea)];
  const focal = analysis.focalPoint;
  const margin = Math.min(focal.x, 1 - focal.x, focal.y, 1 - focal.y);

  let placement = 88;
  if (margin >= 0.16) placement = 92;
  else if (margin >= 0.08) placement = 78;
  else placement = clampScore(36 + (margin / 0.08) * 36);
  if (margin < 0.08) notes.push("主役が端に寄っています。");
  // Upper-third faces are fine. A subject sitting in the bottom of the frame is a weaker snapshot.
  if (focal.y > 0.72) placement = Math.min(placement, 68);
  else if (focal.y > 0.64) placement = Math.min(placement, 78);
  if (focal.y > 0.64) notes.push("主役がフレームの下側に寄っています。");

  let presence = 48;
  if (largestArea >= 0.12 && largestArea <= 0.72) presence = 90;
  else if (largestArea >= 0.06) presence = 78;
  else if (largestArea >= 0.03) presence = 64;
  else if (largestArea > 0.88) presence = 74;
  else notes.push("主役が小さく、背景の割合が大きいです。");

  const clarity = total > 0 ? largestArea / total : 1;
  const clarityScore = clampScore(70 + clarity * 25);
  const dominance = largestArea >= 0.1 ? 88 : largestArea >= 0.04 ? 72 : 56;
  const touches = edgeTouches(largest);
  const edgeScore = touches >= 3 ? 58 : touches === 2 ? 74 : 90;
  if (touches >= 3) notes.push("体がフレームの端にかかっています。");

  const score = clampScore(
    placement * 0.28 +
      presence * 0.28 +
      clarityScore * 0.16 +
      dominance * 0.14 +
      edgeScore * 0.14,
  );
  return { score, notes: notes.slice(0, 2) };
}
