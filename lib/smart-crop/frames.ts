import type { FrameLayoutRole, SmartCropFrame } from "./types.ts";

const FULL: SmartCropFrame["safeArea"] = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

const CIRCLE_SAFE: SmartCropFrame["safeArea"] = {
  x: 0.12,
  y: 0.12,
  width: 0.76,
  height: 0.76,
};

function withLayout(
  frame: Omit<SmartCropFrame, "layoutRole">,
  layoutRole: FrameLayoutRole,
): SmartCropFrame {
  return { ...frame, layoutRole };
}

export const SMART_CROP_FRAMES: SmartCropFrame[] = [
  withLayout(
    {
      id: "landscape",
      label: "Landscape 16:9",
      aspectRatio: 16 / 9,
      mask: "rect",
      safeArea: FULL,
      role: "landscape",
      idealHeadOccupancy: { min: 0.2, max: 0.38 },
      maxScale: 1.2,
      preferUpperFocal: true,
    },
    "hero",
  ),
  withLayout(
    {
      id: "portrait",
      label: "Portrait 3:4",
      aspectRatio: 3 / 4,
      mask: "rect",
      safeArea: FULL,
      role: "portrait",
      idealHeadOccupancy: { min: 0.18, max: 0.34 },
      maxScale: 1.35,
      preferUpperFocal: true,
    },
    "portrait",
  ),
  withLayout(
    {
      id: "square",
      label: "Square 1:1",
      aspectRatio: 1,
      mask: "rect",
      safeArea: FULL,
      role: "square",
      idealHeadOccupancy: { min: 0.22, max: 0.4 },
      maxScale: 1.3,
      preferUpperFocal: false,
    },
    "standard",
  ),
  withLayout(
    {
      id: "circle",
      label: "Circle 1:1",
      aspectRatio: 1,
      mask: "circle",
      safeArea: CIRCLE_SAFE,
      role: "circle",
      // Slightly wider ideal band so face-up photos can pass subjectScale
      idealHeadOccupancy: { min: 0.18, max: 0.42 },
      maxScale: 1.2,
      preferUpperFocal: true,
    },
    "detail",
  ),
];

export function getSmartCropFrame(id: string): SmartCropFrame | undefined {
  return SMART_CROP_FRAMES.find((f) => f.id === id);
}
