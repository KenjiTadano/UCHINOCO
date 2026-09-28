import { SMART_CROP_CONFIG } from "./weights.ts";
import { expandRect, normalizeRect, unionRects } from "./geometry.ts";
import type { NormalizedRect, SmartCropPet, SmartCropPhotoAnalysis } from "./types.ts";

/** Expand face bbox → headSafeArea (ears / crown). */
export function headSafeAreaFromFace(face: NormalizedRect): NormalizedRect {
  const e = SMART_CROP_CONFIG.headExpansion;
  return expandRect(face, {
    top: face.height * e.top,
    left: face.width * e.left,
    right: face.width * e.right,
    bottom: face.height * e.bottom,
  });
}

/** Top band of headSafeArea ≈ ear region. */
export function earBandFromHead(head: NormalizedRect): NormalizedRect {
  return normalizeRect({
    x: head.x,
    y: head.y,
    width: head.width,
    height: head.height * SMART_CROP_CONFIG.earBandHeightRatio,
  });
}

export function petHeadSafeAreas(pets: SmartCropPet[]): NormalizedRect[] {
  const heads: NormalizedRect[] = [];
  for (const pet of pets) {
    if (pet.face) {
      heads.push(headSafeAreaFromFace(normalizeRect(pet.face)));
    } else {
      // Approximate head as upper third of body
      const b = normalizeRect(pet.bbox);
      heads.push(
        normalizeRect({
          x: b.x + b.width * 0.1,
          y: b.y,
          width: b.width * 0.8,
          height: b.height * 0.35,
        }),
      );
    }
  }
  return heads;
}

export function combinedHeadSafeArea(
  analysis: SmartCropPhotoAnalysis,
): NormalizedRect | null {
  return unionRects(petHeadSafeAreas(analysis.pets));
}

export function combinedSubjectArea(
  analysis: SmartCropPhotoAnalysis,
): NormalizedRect | null {
  const parts: NormalizedRect[] = [];
  for (const pet of analysis.pets) {
    parts.push(normalizeRect(pet.bbox));
  }
  parts.push(...petHeadSafeAreas(analysis.pets));
  const union = unionRects(parts);
  if (!union) return null;
  const pad = SMART_CROP_CONFIG.subjectPad;
  return expandRect(union, {
    top: pad,
    right: pad,
    bottom: pad,
    left: pad,
  });
}
