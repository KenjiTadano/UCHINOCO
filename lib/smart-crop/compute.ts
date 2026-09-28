import { SMART_CROP_CONFIG } from "./weights.ts";
import {
  clamp,
  normalizeRect,
  rectCenter,
  visibleWindow,
} from "./geometry.ts";
import {
  combinedHeadSafeArea,
  combinedSubjectArea,
  headSafeAreaFromFace,
} from "./head.ts";
import { computeSmartCropV0 } from "./compute-v0.ts";
import { scoreSmartCrop } from "./quality.ts";
import { SMART_CROP_FRAMES } from "./frames.ts";
import type {
  SmartCropFrame,
  SmartCropFrameResult,
  SmartCropPhotoAnalysis,
  SmartCropTransform,
} from "./types.ts";

export { buildSubjectRectV0 as buildSubjectRect } from "./compute-v0.ts";
export { combinedSubjectArea, headSafeAreaFromFace, petHeadSafeAreas, combinedHeadSafeArea } from "./head.ts";

function pickFocus(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): { x: number; y: number } {
  const heads = analysis.pets.map((p) => {
    if (p.face) return headSafeAreaFromFace(normalizeRect(p.face));
    const b = normalizeRect(p.bbox);
    return normalizeRect({
      x: b.x + b.width * 0.1,
      y: b.y,
      width: b.width * 0.8,
      height: b.height * 0.35,
    });
  });

  let focus: { x: number; y: number };
  if (heads.length === 1) {
    focus = rectCenter(heads[0]);
  } else {
    const combined = combinedHeadSafeArea(analysis);
    focus = combined
      ? rectCenter(combined)
      : {
          x: clamp(analysis.focalPoint.x, 0, 1),
          y: clamp(analysis.focalPoint.y, 0, 1),
        };
  }

  if (frame.preferUpperFocal) {
    focus = { x: focus.x, y: clamp(focus.y - 0.03, 0, 1) };
  }
  return focus;
}

function clampTransformToImage(
  imageAspect: number,
  frame: SmartCropFrame,
  t: SmartCropTransform,
): SmartCropTransform {
  const vis = visibleWindow(
    imageAspect,
    frame.aspectRatio,
    t.scale,
    t.x,
    t.y,
  );
  return {
    x: Number(clamp(t.x, vis.width / 2, 1 - vis.width / 2).toFixed(4)),
    y: Number(clamp(t.y, vis.height / 2, 1 - vis.height / 2).toFixed(4)),
    scale: Number(Math.max(1, t.scale).toFixed(4)),
  };
}

/**
 * Task048.1 — evaluate candidates; pick best non-rejected (or best overall).
 */
export function computeSmartCrop(
  analysis: SmartCropPhotoAnalysis,
  frame: SmartCropFrame,
): {
  crop: SmartCropTransform;
  quality: ReturnType<typeof scoreSmartCrop>;
  candidatesEvaluated: number;
} {
  const imageAspect =
    analysis.height > 0 ? analysis.width / analysis.height : 1;
  const focus = pickFocus(analysis, frame);
  const maxScale = Math.min(frame.maxScale, SMART_CROP_CONFIG.maxScale);
  const zooms = SMART_CROP_CONFIG.candidateZooms.filter(
    (z) => z <= maxScale + 1e-6,
  );
  const offsets = SMART_CROP_CONFIG.candidateOffsets;

  let bestPass: {
    crop: SmartCropTransform;
    quality: ReturnType<typeof scoreSmartCrop>;
    rawOverall: number;
  } | null = null;
  let bestAny: {
    crop: SmartCropTransform;
    quality: ReturnType<typeof scoreSmartCrop>;
    rawOverall: number;
  } | null = null;
  let evaluated = 0;

  for (const scale of zooms) {
    for (const ox of offsets) {
      for (const oy of offsets) {
        const raw: SmartCropTransform = {
          x: focus.x + ox,
          y: focus.y + oy,
          scale,
        };
        const crop = clampTransformToImage(imageAspect, frame, raw);
        const quality = scoreSmartCrop(analysis, frame, crop);
        evaluated++;

        // Prefer higher mask/head/ear among equals (esp. circle rejects).
        const tieBreak =
          quality.maskSafety * 0.4 +
          quality.headSafety * 0.3 +
          quality.earSafety * 0.2 +
          quality.subjectScale * 0.1;
        const rawOverall = quality.overall + tieBreak * 0.01;

        if (!bestAny || rawOverall > bestAny.rawOverall) {
          bestAny = { crop, quality, rawOverall };
        }

        if (!quality.rejected) {
          if (!bestPass || rawOverall > bestPass.rawOverall) {
            bestPass = { crop, quality, rawOverall };
          }
        }
      }
    }
  }

  const chosen = bestPass ?? bestAny;
  if (!chosen) {
    const crop = fallbackCenterCrop();
    return {
      crop,
      quality: scoreSmartCrop(analysis, frame, crop),
      candidatesEvaluated: evaluated,
    };
  }

  return {
    crop: chosen.crop,
    quality: chosen.quality,
    candidatesEvaluated: evaluated,
  };
}

export function fallbackCenterCrop(): SmartCropTransform {
  return { x: 0.5, y: 0.5, scale: 1 };
}

/** Build frame results with Task048 (legacy) + Task048.1 crops. */
export function buildSmartCropFrameResults(
  analysis: SmartCropPhotoAnalysis,
): SmartCropFrameResult[] {
  return SMART_CROP_FRAMES.map((frame) => {
    const legacyCrop = computeSmartCropV0(analysis, frame);
    const legacyQuality = scoreSmartCrop(analysis, frame, legacyCrop);
    const { crop, quality, candidatesEvaluated } = computeSmartCrop(
      analysis,
      frame,
    );
    return {
      frame,
      aiCrop: crop,
      quality,
      candidatesEvaluated,
      legacyCrop,
      legacyQuality,
    };
  });
}
