import type { AlbumLayoutDefinition } from "./types.ts";

/**
 * Task050 — Spread layout catalog (tech verification).
 * Preview rects are normalized 0–1 within a landscape page (~16:10).
 */
export const ALBUM_LAYOUTS: AlbumLayoutDefinition[] = [
  {
    id: "L01",
    name: "Hero",
    photoCount: 1,
    purpose: "hero",
    balanceProfile: { heroWeight: 1, symmetry: 0.2, variety: 0.1 },
    frames: [
      {
        id: "L01-hero",
        cropShapeId: "landscape",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.06, y: 0.08, w: 0.88, h: 0.84 },
      },
    ],
  },
  {
    id: "L01b",
    name: "Portrait Hero",
    photoCount: 1,
    purpose: "hero",
    balanceProfile: { heroWeight: 1, symmetry: 0.3, variety: 0.1 },
    frames: [
      {
        id: "L01b-hero",
        cropShapeId: "portrait",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.28, y: 0.05, w: 0.44, h: 0.9 },
      },
    ],
  },
  {
    id: "L02",
    name: "2-Up Vertical",
    photoCount: 2,
    purpose: "sequence",
    balanceProfile: { heroWeight: 0.5, symmetry: 0.9, variety: 0.4 },
    frames: [
      {
        id: "L02-a",
        cropShapeId: "portrait",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.04, y: 0.06, w: 0.44, h: 0.88 },
      },
      {
        id: "L02-b",
        cropShapeId: "portrait",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.52, y: 0.06, w: 0.44, h: 0.88 },
      },
    ],
  },
  {
    id: "L03",
    name: "2-Up Horizontal",
    photoCount: 2,
    purpose: "sequence",
    balanceProfile: { heroWeight: 0.5, symmetry: 0.9, variety: 0.35 },
    frames: [
      {
        id: "L03-a",
        cropShapeId: "landscape",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.05, y: 0.04, w: 0.9, h: 0.44 },
      },
      {
        id: "L03-b",
        cropShapeId: "landscape",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.05, y: 0.52, w: 0.9, h: 0.44 },
      },
    ],
  },
  {
    id: "L04",
    name: "Hero + 2",
    photoCount: 3,
    purpose: "story",
    balanceProfile: { heroWeight: 0.85, symmetry: 0.4, variety: 0.55 },
    frames: [
      {
        id: "L04-hero",
        cropShapeId: "landscape",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.04, y: 0.05, w: 0.62, h: 0.9 },
      },
      {
        id: "L04-s1",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.6,
        rect: { x: 0.7, y: 0.05, w: 0.26, h: 0.42 },
      },
      {
        id: "L04-s2",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.6,
        rect: { x: 0.7, y: 0.53, w: 0.26, h: 0.42 },
      },
    ],
  },
  {
    id: "L05",
    name: "3 Equal",
    photoCount: 3,
    purpose: "collage",
    balanceProfile: { heroWeight: 0.35, symmetry: 0.95, variety: 0.45 },
    frames: [
      {
        id: "L05-a",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.75,
        rect: { x: 0.03, y: 0.18, w: 0.3, h: 0.64 },
      },
      {
        id: "L05-b",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.75,
        rect: { x: 0.35, y: 0.18, w: 0.3, h: 0.64 },
      },
      {
        id: "L05-c",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.75,
        rect: { x: 0.67, y: 0.18, w: 0.3, h: 0.64 },
      },
    ],
  },
  {
    id: "L06",
    name: "Hero + 3",
    photoCount: 4,
    purpose: "story",
    balanceProfile: { heroWeight: 0.8, symmetry: 0.35, variety: 0.6 },
    frames: [
      {
        id: "L06-hero",
        cropShapeId: "landscape",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.03, y: 0.05, w: 0.58, h: 0.9 },
      },
      {
        id: "L06-a",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.55,
        rect: { x: 0.64, y: 0.05, w: 0.33, h: 0.28 },
      },
      {
        id: "L06-b",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.55,
        rect: { x: 0.64, y: 0.36, w: 0.33, h: 0.28 },
      },
      {
        id: "L06-c",
        cropShapeId: "circle",
        slotRole: "detail",
        importance: 0.5,
        rect: { x: 0.68, y: 0.68, w: 0.25, h: 0.27 },
      },
    ],
  },
  {
    id: "L07",
    name: "4 Grid",
    photoCount: 4,
    purpose: "collage",
    balanceProfile: { heroWeight: 0.3, symmetry: 1, variety: 0.5 },
    frames: [
      {
        id: "L07-a",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.7,
        rect: { x: 0.04, y: 0.05, w: 0.44, h: 0.42 },
      },
      {
        id: "L07-b",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.7,
        rect: { x: 0.52, y: 0.05, w: 0.44, h: 0.42 },
      },
      {
        id: "L07-c",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.7,
        rect: { x: 0.04, y: 0.53, w: 0.44, h: 0.42 },
      },
      {
        id: "L07-d",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.7,
        rect: { x: 0.52, y: 0.53, w: 0.44, h: 0.42 },
      },
    ],
  },
  {
    id: "L08",
    name: "Story",
    photoCount: 3,
    purpose: "story",
    balanceProfile: { heroWeight: 0.75, symmetry: 0.35, variety: 0.7 },
    frames: [
      {
        id: "L08-hero",
        cropShapeId: "landscape",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.03, y: 0.06, w: 0.58, h: 0.88 },
      },
      {
        id: "L08-vert",
        cropShapeId: "portrait",
        slotRole: "secondary",
        importance: 0.7,
        rect: { x: 0.64, y: 0.06, w: 0.32, h: 0.55 },
      },
      {
        id: "L08-detail",
        cropShapeId: "circle",
        slotRole: "detail",
        importance: 0.55,
        rect: { x: 0.68, y: 0.66, w: 0.24, h: 0.28 },
      },
    ],
  },
  {
    id: "L09",
    name: "Portrait Pair + Detail",
    photoCount: 3,
    purpose: "detail",
    balanceProfile: { heroWeight: 0.55, symmetry: 0.5, variety: 0.65 },
    frames: [
      {
        id: "L09-a",
        cropShapeId: "portrait",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.04, y: 0.08, w: 0.36, h: 0.84 },
      },
      {
        id: "L09-b",
        cropShapeId: "portrait",
        slotRole: "primary",
        importance: 0.85,
        rect: { x: 0.42, y: 0.08, w: 0.36, h: 0.84 },
      },
      {
        id: "L09-d",
        cropShapeId: "circle",
        slotRole: "detail",
        importance: 0.5,
        rect: { x: 0.8, y: 0.35, w: 0.16, h: 0.3 },
      },
    ],
  },
  {
    id: "L10",
    name: "2 Square",
    photoCount: 2,
    purpose: "collage",
    balanceProfile: { heroWeight: 0.45, symmetry: 0.95, variety: 0.3 },
    frames: [
      {
        id: "L10-a",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.8,
        rect: { x: 0.04, y: 0.12, w: 0.44, h: 0.76 },
      },
      {
        id: "L10-b",
        cropShapeId: "square",
        slotRole: "primary",
        importance: 0.8,
        rect: { x: 0.52, y: 0.12, w: 0.44, h: 0.76 },
      },
    ],
  },
  {
    id: "L11",
    name: "Hero Portrait + 2",
    photoCount: 3,
    purpose: "story",
    balanceProfile: { heroWeight: 0.85, symmetry: 0.4, variety: 0.55 },
    frames: [
      {
        id: "L11-hero",
        cropShapeId: "portrait",
        slotRole: "hero",
        importance: 1,
        rect: { x: 0.06, y: 0.05, w: 0.42, h: 0.9 },
      },
      {
        id: "L11-s1",
        cropShapeId: "landscape",
        slotRole: "secondary",
        importance: 0.6,
        rect: { x: 0.52, y: 0.08, w: 0.42, h: 0.38 },
      },
      {
        id: "L11-s2",
        cropShapeId: "square",
        slotRole: "secondary",
        importance: 0.6,
        rect: { x: 0.56, y: 0.52, w: 0.34, h: 0.4 },
      },
    ],
  },
];

export function getAlbumLayout(id: string): AlbumLayoutDefinition | undefined {
  return ALBUM_LAYOUTS.find((l) => l.id === id);
}

export function layoutsForPhotoCount(n: number): AlbumLayoutDefinition[] {
  return ALBUM_LAYOUTS.filter((l) => l.photoCount === n);
}
