/**
 * Task048 baseline crop (v0) — kept for Before/After comparison.
 * Do not change behavior; Task048.1 improvements live in compute.ts.
 */
import {
  CONTAIN_SCALE_FACTOR,
  FACE_EAR_PAD_BOTTOM,
  FACE_EAR_PAD_SIDE,
  FACE_EAR_PAD_TOP,
  MAX_SCALE,
  SUBJECT_PAD,
} from "./weights.ts";
import {
  expandRect,
  normalizeRect,
  rectCenter,
  unionRects,
  visibleWindow,
  clamp,
} from "./geometry.ts";
import type {
  NormalizedRect,
  SmartCropFrame,
  SmartCropPhotoAnalysis,
  SmartCropTransform,
} from "./types.ts";

function protectFace(face: NormalizedRect): NormalizedRect {
  return expandRect(face, {
    top: face.height * FACE_EAR_PAD_TOP,
    right: face.width * FACE_EAR_PAD_SIDE,
    bottom: face.height * FACE_EAR_PAD_BOTTOM,
    left: face.width * FACE_EAR_PAD_SIDE,
  });
}

export function buildSubjectRectV0(
  analysis: SmartCropPhotoAnalysis,
): NormalizedRect | null {
  const parts: NormalizedRect[] = [];
  for (const pet of analysis.pets) {
    parts.push(normalizeRect(pet.bbox));
    if (pet.face) parts.push(protectFace(normalizeRect(pet.face)));
  }
  const union = unionRects(parts);
  if (!union) return null;
  return expandRect(union, {
    top: SUBJECT_PAD,
    right: SUBJECT_PAD,
    bottom: SUBJECT_PAD,
    left: SUBJECT_PAD,
  });
}

function pickFocusV0(
  analysis: SmartCropPhotoAnalysis,
  subject: NormalizedRect | null,
): { x: number; y: number } {
  const faces = analysis.pets
    .map((p) => p.face)
    .filter((f): f is NormalizedRect => Boolean(f));
  if (faces.length === 1) {
    return rectCenter(protectFace(faces[0]));
  }
  if (faces.length > 1) {
    const u = unionRects(faces.map((f) => protectFace(f)));
    if (u) return rectCenter(u);
  }
  if (subject) return rectCenter(subject);
  return {
    x: clamp(analysis.focalPoint.x, 0, 1),
    y: clamp(analysis.focalPoint.y, 0, 1),
  };
}

/** Task048 original single-pass crop. */
export function computeSmartCropV0(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): SmartCropTransform {
  const imageAspect =
    analysis.height > 0 ? analysis.width / analysis.height : 1;
  const frameAspect = frame.aspectRatio;
  const subject = buildSubjectRectV0(analysis);
  const focus = pickFocusV0(analysis, subject);

  const base = visibleWindow(imageAspect, frameAspect, 1, 0.5, 0.5);

  let scale = 1;
  if (subject) {
    const maxContain = Math.min(
      base.width / Math.max(subject.width, 0.02),
      base.height / Math.max(subject.height, 0.02),
    );
    if (maxContain > 1) {
      scale = clamp(maxContain * CONTAIN_SCALE_FACTOR, 1, MAX_SCALE);
    }
  }

  if (frame.mask === "circle" && subject && scale > 1) {
    scale = clamp(scale * 1.05, 1, MAX_SCALE);
  }

  const vis = visibleWindow(imageAspect, frameAspect, scale, focus.x, focus.y);
  const x = clamp(focus.x, vis.width / 2, 1 - vis.width / 2);
  const y = clamp(focus.y, vis.height / 2, 1 - vis.height / 2);

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    scale: Number(scale.toFixed(4)),
  };
}
