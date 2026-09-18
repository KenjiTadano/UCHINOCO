/**
 * Unit conversion and DPI utilities for print layout.
 * No "server-only" — pure math functions, fully testable.
 */

const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;

/** Convert millimetres to PDF points (1 point = 1/72 inch). */
export function mmToPoints(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

/** Convert PDF points back to millimetres. */
export function pointsToMm(points: number): number {
  return (points / POINTS_PER_INCH) * MM_PER_INCH;
}

/** DPI below this threshold triggers a warning in generated output. */
export const DPI_WARNING_THRESHOLD = 200;

/** Recommended minimum DPI for professional photo printing. */
export const DPI_RECOMMENDED = 300;

/**
 * Estimate effective DPI of an image on a printed surface.
 * Uses the larger dimension for a conservative (worst-case) estimate.
 */
export function estimateDpi(
  pixelDimension: number,
  printDimensionMm: number,
): number {
  const printInches = printDimensionMm / MM_PER_INCH;
  return Math.round(pixelDimension / printInches);
}
