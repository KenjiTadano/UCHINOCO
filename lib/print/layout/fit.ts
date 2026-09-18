/**
 * Image placement geometry helpers.
 * No "server-only" — pure functions, fully testable.
 */

export type FitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * "contain": image fits entirely within target bounds with no cropping.
 * The image is scaled to fill as much of the target as possible while
 * preserving aspect ratio, then centred. Empty space (letterbox/pillarbox)
 * appears on the short axis.
 */
export function calculateContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FitRect {
  const scaleW = targetWidth / sourceWidth;
  const scaleH = targetHeight / sourceHeight;
  const scale = Math.min(scaleW, scaleH);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

/**
 * "cover": image fills the entire target area; excess is cropped.
 * The image is scaled so that neither dimension is smaller than target,
 * then centred. x/y may be negative (indicating cropped region).
 */
export function calculateCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FitRect {
  const scaleW = targetWidth / sourceWidth;
  const scaleH = targetHeight / sourceHeight;
  const scale = Math.max(scaleW, scaleH);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}
