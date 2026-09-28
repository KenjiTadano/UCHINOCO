import { decode } from "jpeg-js";
import type { NormalizedRect } from "../smart-crop/types.ts";
import type { VisualDescriptor } from "./types.ts";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function sampleLuma(
  data: Uint8Array,
  width: number,
  height: number,
  gridW: number,
  gridH: number,
): Float32Array {
  const out = new Float32Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / gridH));
    for (let x = 0; x < gridW; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / gridW));
      const i = (sy * width + sx) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      out[y * gridW + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return out;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble =
      (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/** 64-bit difference hash. Low distance means a near-duplicate or a tight burst. */
export function dHashFromLuma(luma: Float32Array, gridW: number): string {
  const gridH = luma.length / gridW;
  const bits: number[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW - 1; x++) {
      bits.push(luma[y * gridW + x] < luma[y * gridW + x + 1] ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

export function aHashFromLuma(luma: Float32Array): string {
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  const mean = sum / luma.length;
  const bits = Array.from(luma, (value) => (value >= mean ? 1 : 0));
  return bitsToHex(bits);
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = Number.parseInt(a[i] ?? "0", 16) ^ Number.parseInt(b[i] ?? "0", 16);
    count += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return count;
}

export function hashSimilarity(a: string, b: string): number {
  const dist = hammingHex(a, b);
  return Math.round((1 - dist / 64) * 100);
}

function histIndex(r: number, g: number, b: number) {
  const qr = Math.min(3, Math.floor(r / 64));
  const qg = Math.min(3, Math.floor(g / 64));
  const qb = Math.min(3, Math.floor(b / 64));
  return (qr << 4) | (qg << 2) | qb;
}

export function colorHistogram(
  data: Uint8Array,
  width: number,
  height: number,
  mask?: (x: number, y: number) => boolean,
): { hist: number[]; samples: number } {
  const hist = new Array<number>(64).fill(0);
  const step = Math.max(1, Math.floor(Math.max(width, height) / 96));
  let samples = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (mask && !mask(x / width, y / height)) continue;
      const i = (y * width + x) * 4;
      hist[histIndex(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)] += 1;
      samples++;
    }
  }
  if (samples > 0) {
    for (let i = 0; i < hist.length; i++) hist[i] /= samples;
  }
  return { hist, samples };
}

export function histogramSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let intersection = 0;
  for (let i = 0; i < a.length; i++) intersection += Math.min(a[i] ?? 0, b[i] ?? 0);
  return Math.round(clamp01(intersection) * 100);
}

function outsidePets(pets: NormalizedRect[]) {
  return (x: number, y: number) => {
    for (const pet of pets) {
      if (
        x >= pet.x &&
        y >= pet.y &&
        x <= pet.x + pet.width &&
        y <= pet.y + pet.height
      ) {
        return false;
      }
    }
    return true;
  };
}

export function descriptorFromRgba(
  data: Uint8Array,
  width: number,
  height: number,
  petBoxes: NormalizedRect[] = [],
): VisualDescriptor {
  const dGrid = sampleLuma(data, width, height, 9, 8);
  const aGrid = sampleLuma(data, width, height, 8, 8);
  const color = colorHistogram(data, width, height);
  let backgroundHist: number[] | null = null;
  if (petBoxes.length > 0) {
    const background = colorHistogram(data, width, height, outsidePets(petBoxes));
    const total = color.samples;
    if (background.samples >= 24 && total > 0 && background.samples / total >= 0.12) {
      backgroundHist = background.hist;
    }
  }
  return {
    dHash: dHashFromLuma(dGrid, 9),
    aHash: aHashFromLuma(aGrid),
    colorHist: color.hist,
    backgroundHist,
  };
}

export function descriptorFromJpeg(
  bytes: Uint8Array,
  petBoxes: NormalizedRect[] = [],
): VisualDescriptor | null {
  try {
    const raw = decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxResolutionInMP: 24,
      maxMemoryUsageInMB: 256,
    });
    if (raw.width < 8 || raw.height < 8) return null;
    return descriptorFromRgba(raw.data, raw.width, raw.height, petBoxes);
  } catch {
    return null;
  }
}

/** Blend of structure (dHash / aHash) and overall color. Not enough by itself to join a scene. */
export function scoreVisualSimilarity(
  a: VisualDescriptor | null,
  b: VisualDescriptor | null,
): number {
  if (!a || !b) return 50;
  const structure =
    hashSimilarity(a.dHash, b.dHash) * 0.7 + hashSimilarity(a.aHash, b.aHash) * 0.3;
  const color = histogramSimilarity(a.colorHist, b.colorHist) ?? 50;
  return Math.round(structure * 0.72 + color * 0.28);
}

export function scoreBackgroundSimilarity(
  a: VisualDescriptor | null,
  b: VisualDescriptor | null,
): number {
  const score = histogramSimilarity(a?.backgroundHist ?? null, b?.backgroundHist ?? null);
  return score ?? 55;
}
