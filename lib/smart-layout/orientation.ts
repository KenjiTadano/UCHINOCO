/**
 * Task050.1 — Orientation affinity between photo set and layout frame shapes.
 */
import type { AlbumLayoutDefinition, LayoutPhotoInput } from "./types.ts";
import {
  buildOrientationProfile,
  type OrientationProfile,
} from "./photo-set.ts";

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function layoutShapeBias(layout: AlbumLayoutDefinition): {
  landscape: number;
  portrait: number;
  square: number;
  circle: number;
} {
  const counts = { landscape: 0, portrait: 0, square: 0, circle: 0 };
  for (const f of layout.frames) {
    counts[f.cropShapeId]++;
  }
  const n = Math.max(layout.frames.length, 1);
  return {
    landscape: counts.landscape / n,
    portrait: counts.portrait / n,
    square: counts.square / n,
    circle: counts.circle / n,
  };
}

/**
 * How well layout crop shapes match the photo orientation mix.
 * Does NOT hardcode layout ids — uses frame shape composition.
 */
export function scoreOrientationAffinity(
  photos: LayoutPhotoInput[],
  layout: AlbumLayoutDefinition,
  profile?: OrientationProfile,
): number {
  const orient = profile ?? buildOrientationProfile(photos);
  const shapes = layoutShapeBias(layout);

  if (photos.length <= 1) {
    if (orient.dominant === "portrait" && shapes.portrait >= 0.5) return 78;
    if (orient.dominant === "landscape" && shapes.landscape >= 0.5) return 78;
    if (orient.dominant === "square" && shapes.square + shapes.circle >= 0.5)
      return 72;
    return 60;
  }

  if (orient.allLandscape) {
    let score = 48 + shapes.landscape * 48;
    score -= shapes.square * 18;
    score -= shapes.portrait * 8;
    if (photos.length === 2 && shapes.landscape >= 0.9) score += 8;
    if (photos.length === 2 && shapes.square >= 0.9) score -= 10;
    return clampScore(score);
  }

  if (orient.allPortrait) {
    let score = 48 + shapes.portrait * 48;
    score -= shapes.square * 14;
    score -= shapes.landscape * 8;
    if (photos.length === 2 && shapes.portrait >= 0.9) score += 8;
    if (photos.length === 2 && shapes.square >= 0.9) score -= 10;
    return clampScore(score);
  }

  let score = 58;
  score += shapes.landscape * orient.landscapeCount * 6;
  score += shapes.portrait * orient.portraitCount * 6;
  score += shapes.square * orient.squareCount * 4;
  if (
    shapes.landscape >= 0.99 ||
    shapes.portrait >= 0.99 ||
    shapes.square >= 0.99
  ) {
    score -= 4;
  }
  return clampScore(score);
}
