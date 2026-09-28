import { decode } from "jpeg-js";
import { readImageDimensions } from "../smart-crop/image-size.ts";
import type {
  TechnicalFlag,
  TechnicalParts,
  TechnicalQualityResult,
  TechnicalSignals,
} from "./types.ts";

const MAX_DECODE_BYTES = 8 * 1024 * 1024;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function score100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(clamp(n, 0, 100));
}

export function scoreResolution(width: number, height: number): number {
  const short = Math.min(width, height);
  if (short >= 1600) return 96;
  if (short >= 1200) return 88;
  if (short >= 800) return 76;
  if (short >= 500) return 62;
  if (short >= 280) return 46;
  if (short > 0) return 30;
  return 0;
}

/**
 * Edge strength on the 96px sample grid.
 * Phone photos often land between 0.02 and 0.1 — keep that range from saturating at 96.
 * Around 0.0016 is slight blur: still usable, not a hard reject.
 */
export function scoreSharpnessFromLaplacian(lapVar: number): number {
  if (!Number.isFinite(lapVar) || lapVar < 0) return 50;
  if (lapVar >= 0.09) return 96;
  if (lapVar >= 0.05) return 90;
  if (lapVar >= 0.028) return 82;
  if (lapVar >= 0.016) return 74;
  if (lapVar >= 0.008) return 68;
  if (lapVar >= 0.0035) return 62;
  if (lapVar >= 0.0016) return 60;
  if (lapVar >= 0.0007) return 48;
  if (lapVar >= 0.00025) return 34;
  return 20;
}

/** Focus acceptability. Mild blur remains usable. */
export function scoreBlurAcceptability(lapVar: number): number {
  if (!Number.isFinite(lapVar) || lapVar < 0) return 50;
  if (lapVar >= 0.02) return 94;
  if (lapVar >= 0.008) return 84;
  if (lapVar >= 0.003) return 74;
  if (lapVar >= 0.0014) return 66;
  if (lapVar >= 0.0006) return 52;
  if (lapVar >= 0.0002) return 34;
  return 18;
}

export function isExtremeBlur(lapVar: number, shortEdge: number): boolean {
  return shortEdge >= 480 && Number.isFinite(lapVar) && lapVar < 0.00012;
}

export function scoreExposure(mean: number): number {
  if (!Number.isFinite(mean)) return 50;
  if (mean >= 0.28 && mean <= 0.72) {
    const mid = 1 - Math.abs(mean - 0.48) / 0.24;
    return score100(82 + clamp(mid, 0, 1) * 14);
  }
  if (mean < 0.28) return score100((mean / 0.28) * 72);
  const over = clamp((mean - 0.72) / 0.28, 0, 1);
  return score100(72 - over * 48);
}

export function scoreContrast(std: number): number {
  if (!Number.isFinite(std) || std < 0) return 40;
  if (std >= 0.12 && std <= 0.28) return 92;
  if (std >= 0.08 && std < 0.12) return 78;
  if (std > 0.28 && std <= 0.38) return 80;
  if (std < 0.04) return 30;
  if (std < 0.08) return 55;
  return 68;
}

export function scoreNoise(neighborDiff: number, lumaStd: number): number {
  if (!Number.isFinite(neighborDiff) || !Number.isFinite(lumaStd)) return 60;
  if (lumaStd >= 0.12) {
    if (neighborDiff <= 0.12) return 90;
    if (neighborDiff <= 0.2) return 78;
    return 66;
  }
  if (neighborDiff <= 0.04) return 88;
  if (neighborDiff <= 0.08) return 70;
  return 48;
}

export function statsFromRgba(
  data: Uint8Array,
  width: number,
  height: number,
): Pick<TechnicalSignals, "meanLuma" | "lumaStd" | "laplacianVar" | "neighborDiff"> {
  if (width < 3 || height < 3 || data.length < width * height * 4) {
    return { meanLuma: 0, lumaStd: 0, laplacianVar: 0, neighborDiff: 0 };
  }
  const target = 96;
  const stepX = Math.max(1, Math.floor(width / target));
  const stepY = Math.max(1, Math.floor(height / target));
  const gw = Math.max(3, Math.floor(width / stepX));
  const gh = Math.max(3, Math.floor(height / stepY));
  const luma = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const sy = Math.min(height - 1, y * stepY);
    for (let x = 0; x < gw; x++) {
      const sx = Math.min(width - 1, x * stepX);
      const i = (sy * width + sx) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      luma[y * gw + x] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
  }

  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  const mean = sum / luma.length;
  let varSum = 0;
  for (let i = 0; i < luma.length; i++) {
    const d = luma[i] - mean;
    varSum += d * d;
  }
  const lumaStd = Math.sqrt(varSum / luma.length);

  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  let diffSum = 0;
  let diffN = 0;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const c = luma[y * gw + x];
      const left = luma[y * gw + (x - 1)];
      const right = luma[y * gw + (x + 1)];
      const up = luma[(y - 1) * gw + x];
      const down = luma[(y + 1) * gw + x];
      const lap = left + right + up + down - 4 * c;
      lapSum += lap;
      lapSq += lap * lap;
      n++;
      diffSum += Math.abs(c - left);
      diffN++;
    }
  }
  const lapMean = n ? lapSum / n : 0;
  const laplacianVar = n ? Math.max(0, lapSq / n - lapMean * lapMean) : 0;
  return {
    meanLuma: mean,
    lumaStd,
    laplacianVar,
    neighborDiff: diffN ? diffSum / diffN : 0,
  };
}

function partsFromSignals(signals: TechnicalSignals): TechnicalParts {
  const resolution = scoreResolution(signals.width, signals.height);
  if (!signals.pixelsKnown) {
    return {
      blur: 62,
      sharpness: 62,
      exposure: 62,
      contrast: 62,
      noise: 62,
      resolution,
    };
  }
  return {
    blur: scoreBlurAcceptability(signals.laplacianVar),
    sharpness: scoreSharpnessFromLaplacian(signals.laplacianVar),
    exposure: scoreExposure(signals.meanLuma),
    contrast: scoreContrast(signals.lumaStd),
    noise: scoreNoise(signals.neighborDiff, signals.lumaStd),
    resolution,
  };
}

function blendTechnical(parts: TechnicalParts): number {
  return score100(
    parts.resolution * 0.16 +
      parts.sharpness * 0.18 +
      parts.blur * 0.14 +
      parts.exposure * 0.2 +
      parts.contrast * 0.16 +
      parts.noise * 0.16,
  );
}

function flagsFor(signals: TechnicalSignals): TechnicalFlag[] {
  const flags: TechnicalFlag[] = [];
  if (!signals.readable) flags.push("CORRUPT_IMAGE");
  if (
    signals.pixelsKnown &&
    signals.meanLuma < 0.04 &&
    signals.lumaStd < 0.025
  ) {
    flags.push("BLACK_IMAGE");
  }
  const short = Math.min(signals.width, signals.height);
  if (signals.pixelsKnown && isExtremeBlur(signals.laplacianVar, short)) {
    flags.push("EXTREME_BLUR");
  }
  return flags;
}

export function technicalResultFromSignals(
  signals: TechnicalSignals,
): TechnicalQualityResult {
  const parts = partsFromSignals(signals);
  return {
    technicalQuality: signals.readable ? blendTechnical(parts) : 8,
    parts,
    signals,
    flags: flagsFor(signals),
  };
}

function isJpeg(bytes: Uint8Array, mimeType: string) {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  );
}

/**
 * Resolution always comes from the file header when possible.
 * Blur / exposure / noise need decoded pixels (JPEG). Other formats stay neutral.
 */
export function measureTechnicalQuality(
  bytes: Uint8Array,
  mimeType: string,
): TechnicalQualityResult {
  const dims = readImageDimensions(bytes, mimeType);
  const width = dims?.width ?? 0;
  const height = dims?.height ?? 0;
  const readable = width > 0 && height > 0;
  let pixelsKnown = false;
  let meanLuma = 0;
  let lumaStd = 0;
  let laplacianVar = 0;
  let neighborDiff = 0;
  let measuredWidth = width;
  let measuredHeight = height;

  if (readable && isJpeg(bytes, mimeType) && bytes.byteLength <= MAX_DECODE_BYTES) {
    try {
      const raw = decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        tolerantDecoding: true,
        maxResolutionInMP: 24,
        maxMemoryUsageInMB: 256,
      });
      const stats = statsFromRgba(raw.data, raw.width, raw.height);
      pixelsKnown = raw.width >= 3 && raw.height >= 3;
      meanLuma = stats.meanLuma;
      lumaStd = stats.lumaStd;
      laplacianVar = stats.laplacianVar;
      neighborDiff = stats.neighborDiff;
      if (raw.width > 0 && raw.height > 0) {
        measuredWidth = raw.width;
        measuredHeight = raw.height;
      }
    } catch {
      pixelsKnown = false;
    }
  }

  return technicalResultFromSignals({
    width: measuredWidth,
    height: measuredHeight,
    readable,
    pixelsKnown,
    meanLuma,
    lumaStd,
    laplacianVar,
    neighborDiff,
  });
}
