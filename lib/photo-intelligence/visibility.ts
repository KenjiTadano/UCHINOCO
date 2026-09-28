import { normalizeRect } from "../smart-crop/geometry.ts";
import { headSafeAreaFromFace } from "../smart-crop/head.ts";
import type { NormalizedRect, SmartCropPhotoAnalysis } from "../smart-crop/types.ts";

export type VisibilityHints = {
  eyesVisible?: boolean | null;
  activity?: string | null;
  petPresent?: boolean | null;
};

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function areaOf(rect: NormalizedRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function sizeScore(area: number) {
  if (area > 0.9) return 86;
  if (area >= 0.12 && area <= 0.75) return 93;
  if (area >= 0.06) return 80;
  if (area >= 0.03) return 66;
  if (area >= 0.012) return 50;
  return 34;
}

function faceScore(face: NormalizedRect | undefined) {
  if (!face) return 52;
  const area = areaOf(face);
  let score = area >= 0.04 ? 92 : area >= 0.015 ? 80 : area >= 0.006 ? 68 : 56;
  if (face.y <= 0.012) score -= 12;
  if (face.x <= 0.005 || face.x + face.width >= 0.995) score -= 6;
  return clampScore(score);
}

function headInsideScore(head: NormalizedRect) {
  const minMargin = Math.min(
    head.y,
    head.x,
    1 - (head.x + head.width),
    1 - (head.y + head.height),
  );
  if (minMargin >= 0.02) return 94;
  if (minMargin >= 0.004) return 82;
  return 70;
}

function eyesScore(hints: VisibilityHints | undefined, hasFace: boolean) {
  if (!hints || hints.eyesVisible == null) return hasFace ? 74 : 60;
  if (hints.eyesVisible) return 92;
  if (hints.activity === "sleeping") return 84;
  return hasFace ? 64 : 48;
}

/**
 * How well the pet can be seen in the original photo.
 * Uses Task048 face / head / body boxes. Not a crop-suitability score.
 */
export function scorePetVisibility(
  analysis: SmartCropPhotoAnalysis,
  hints?: VisibilityHints,
): { score: number; notes: string[] } {
  const notes: string[] = [];
  if (analysis.pets.length === 0) {
    if (hints?.petPresent) {
      notes.push("構図解析ではペット枠を取れませんでしたが、写真にはペットがいるように見えます。");
      return { score: 55, notes };
    }
    notes.push("ペットがほとんど見えていません。");
    return { score: 16, notes };
  }

  const bodies = analysis.pets.map((pet) => normalizeRect(pet.bbox));
  const faces = analysis.pets.map((pet) =>
    pet.face ? normalizeRect(pet.face) : undefined,
  );
  const bodyAreas = bodies.map(areaOf);
  const largest = Math.max(...bodyAreas);

  const faceScores = faces.map(faceScore);
  const strongestFace = Math.max(...faceScores);
  const face =
    faceScores.length === 1
      ? faceScores[0]
      : Math.round(strongestFace * 0.7 + average(faceScores) * 0.3);

  const heads = analysis.pets.map((pet, index) => {
    if (pet.face) return headSafeAreaFromFace(faces[index] ?? normalizeRect(pet.face));
    const body = bodies[index];
    return normalizeRect({
      x: body.x + body.width * 0.1,
      y: body.y,
      width: body.width * 0.8,
      height: body.height * 0.35,
    });
  });
  const head = average(heads.map(headInsideScore));
  const body = sizeScore(largest);
  const primaryFace = faces.find((face): face is NormalizedRect => Boolean(face));
  const size = sizeScore(
    Math.max(largest, primaryFace ? areaOf(primaryFace) * 2.2 : 0),
  );
  const eyes = eyesScore(hints, Boolean(primaryFace));

  let multi = 82;
  if (analysis.pets.length >= 2) {
    const visible = bodyAreas.filter((a) => a >= 0.025).length;
    multi = Math.round(55 + (visible / analysis.pets.length) * 40);
    if (visible < analysis.pets.length) {
      notes.push("複数のペットのうち、小さくて見えにくい子がいます。");
    }
  }

  if (largest < 0.03) notes.push("ペットが画面のなかで小さめです。");
  if (faces.every((face) => !face)) notes.push("顔の位置ははっきり取れていません。");
  else if (Math.min(...faces.filter((f): f is NormalizedRect => Boolean(f)).map((f) => f.y)) <= 0.012) {
    notes.push("頭の上がフレームぎりぎりです。");
  }

  const score = clampScore(
    size * 0.22 + face * 0.26 + head * 0.16 + body * 0.16 + eyes * 0.12 + multi * 0.08,
  );
  return { score, notes: notes.slice(0, 2) };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
