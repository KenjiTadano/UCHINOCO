import { clamp01, isValidRect, normalizeRect } from "./geometry.ts";
import type {
  NormalizedRect,
  SmartCropPet,
  SmartCropPhotoAnalysis,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRect(value: unknown): NormalizedRect | null {
  if (!isRecord(value)) return null;
  const x = typeof value.x === "number" ? value.x : NaN;
  const y = typeof value.y === "number" ? value.y : NaN;
  const width = typeof value.width === "number" ? value.width : NaN;
  const height = typeof value.height === "number" ? value.height : NaN;
  const rect = { x, y, width, height };
  if (!isValidRect(rect)) return null;
  return normalizeRect(rect);
}

/**
 * Parse / sanitize Vision JSON for Smart Crop.
 * Does not invent pets — empty pets → caller applies center fallback.
 */
export function parseSmartCropVisionOutput(
  raw: string,
  width: number,
  height: number,
): SmartCropPhotoAnalysis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const petsRaw = Array.isArray(parsed.pets) ? parsed.pets : [];
  const pets: SmartCropPet[] = [];
  for (const item of petsRaw.slice(0, 8)) {
    if (!isRecord(item)) continue;
    const bbox = parseRect(item.bbox);
    if (!bbox) continue;
    const face = item.face != null ? parseRect(item.face) : undefined;
    const confidence =
      typeof item.confidence === "number"
        ? clamp01(item.confidence)
        : undefined;
    pets.push({
      bbox,
      ...(face ? { face } : {}),
      ...(confidence != null ? { confidence } : {}),
    });
  }

  let focalPoint = { x: 0.5, y: 0.5 };
  if (isRecord(parsed.focalPoint)) {
    const fx = typeof parsed.focalPoint.x === "number" ? parsed.focalPoint.x : 0.5;
    const fy = typeof parsed.focalPoint.y === "number" ? parsed.focalPoint.y : 0.5;
    focalPoint = { x: clamp01(fx), y: clamp01(fy) };
  } else if (pets.length > 0) {
    const p = pets[0];
    const r = p.face ?? p.bbox;
    focalPoint = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }

  const ratio = height > 0 ? width / height : 1;
  let orientation: SmartCropPhotoAnalysis["orientation"] = "square";
  if (ratio > 1.08) orientation = "landscape";
  else if (ratio < 0.92) orientation = "portrait";

  let petDetection = 0;
  if (pets.length > 0) {
    const confs = pets
      .map((p) => p.confidence)
      .filter((c): c is number => typeof c === "number");
    petDetection =
      confs.length > 0
        ? confs.reduce((a, b) => a + b, 0) / confs.length
        : 0.75;
  }

  return {
    width,
    height,
    pets,
    focalPoint,
    orientation,
    analysisConfidence: { petDetection },
  };
}

export const SMART_CROP_VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          bbox: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          face: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
                required: ["x", "y", "width", "height"],
              },
              { type: "null" },
            ],
          },
          confidence: { type: "number" },
        },
        required: ["bbox", "face", "confidence"],
      },
    },
    focalPoint: {
      type: "object",
      additionalProperties: false,
      properties: {
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["x", "y"],
    },
  },
  required: ["pets", "focalPoint"],
} as const;

export const SMART_CROP_VISION_PROMPT = `
You analyze pet photos for Smart Crop. Return ONLY structured JSON.
Coordinates are normalized 0–1 relative to the full image (origin top-left).

Rules:
- Detect each visible pet (dog/cat). bbox = full body/subject silhouette.
- face = head including ears when visible. Prefer slightly loose face boxes so ears are inside.
- If face cannot be seen, still provide face as the upper head region of bbox (best effort).
- confidence 0–1 for that pet detection.
- focalPoint = the visual center of the main subject (often between eyes / face center). For multiple pets, use the midpoint of the group.
- Do not invent pets that are not visible.
- Empty pets array is allowed if no pet is clearly visible.
`.trim();
