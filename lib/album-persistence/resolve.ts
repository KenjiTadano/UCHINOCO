import type {
  CropTriple,
  DraftFrameRow,
  DraftSpreadRow,
  EffectiveFrame,
  EffectiveSpread,
  WriteStatus,
} from "./types.ts";

/** Layout the book should show. User choice wins when it is set. */
export function resolveEffectiveSpread(spread: Pick<DraftSpreadRow, "aiLayoutId" | "userLayoutId">): EffectiveSpread {
  const layoutOverridden = spread.userLayoutId != null && spread.userLayoutId !== "";
  return {
    layoutId: layoutOverridden ? spread.userLayoutId! : spread.aiLayoutId,
    layoutOverridden,
  };
}

/** Photo and crop the book should show. Each axis falls back on its own. */
export function resolveEffectiveFrame(frame: Pick<
  DraftFrameRow,
  | "aiPhotoId"
  | "userPhotoId"
  | "aiCropX"
  | "aiCropY"
  | "aiCropScale"
  | "userCropX"
  | "userCropY"
  | "userCropScale"
>): EffectiveFrame {
  const photoOverridden = frame.userPhotoId != null && frame.userPhotoId !== "";
  const cropOverridden = frame.userCropX != null || frame.userCropY != null || frame.userCropScale != null;
  return {
    photoId: photoOverridden ? frame.userPhotoId! : frame.aiPhotoId,
    crop: {
      x: frame.userCropX ?? frame.aiCropX,
      y: frame.userCropY ?? frame.aiCropY,
      scale: frame.userCropScale ?? frame.aiCropScale,
    },
    photoOverridden,
    cropOverridden,
  };
}

export function resolveEffectiveCrop(frame: Parameters<typeof resolveEffectiveFrame>[0]): CropTriple {
  return resolveEffectiveFrame(frame).crop;
}

/**
 * Later edits win. An older in-flight save must not replace them.
 * Same sequence with a mismatched revision is a conflict.
 */
export function decideWrite(input: {
  storedRevision: number;
  storedSeq: number;
  expectedRevision: number;
  clientSeq: number;
}): WriteStatus {
  if (input.clientSeq > input.storedSeq) return "applied";
  if (input.clientSeq < input.storedSeq) return "stale";
  if (input.expectedRevision === input.storedRevision) return "applied";
  return "conflict";
}
