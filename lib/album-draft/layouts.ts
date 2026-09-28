import type { AlbumLayoutDefinition } from "../smart-layout/types.ts";

/**
 * Draft-only layouts. Kept out of ALBUM_LAYOUTS so Task050 ranking stays the same.
 * Existing 2-photo layouts are equal pairs. Primary + secondary needs one hierarchy option.
 */
export const DRAFT_HIERARCHY_LAYOUTS: AlbumLayoutDefinition[] = [
  {
    id: "L12",
    name: "Lead + Support",
    photoCount: 2,
    purpose: "story",
    balanceProfile: { heroWeight: 0.8, symmetry: 0.35, variety: 0.45 },
    frames: [
      {
        id: "L12-lead",
        cropShapeId: "portrait",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.04, y: 0.06, w: 0.56, h: 0.88 },
      },
      {
        id: "L12-support",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.55,
        rect: { x: 0.66, y: 0.24, w: 0.28, h: 0.52 },
      },
    ],
  },
  {
    id: "L12b",
    name: "Wide Lead + Support",
    photoCount: 2,
    purpose: "story",
    balanceProfile: { heroWeight: 0.78, symmetry: 0.35, variety: 0.4 },
    frames: [
      {
        id: "L12b-lead",
        cropShapeId: "landscape",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.04, y: 0.1, w: 0.56, h: 0.8 },
      },
      {
        id: "L12b-support",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.55,
        rect: { x: 0.66, y: 0.28, w: 0.28, h: 0.44 },
      },
    ],
  },
];
