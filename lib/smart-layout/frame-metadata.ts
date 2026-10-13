import { ALBUM_DRAFT_CONFIG } from "../album-draft/config.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "../album-draft/layouts.ts";
import { contentBox, placeFrames } from "../album-draft/pages.ts";
import { EDITORIAL_TEMPLATES, NO_CROP_FINAL_TEMPLATES } from "./editorial-library.ts";
import { ALBUM_LAYOUTS } from "./layouts.ts";
import type { AlbumFrameDefinition, AlbumLayoutDefinition } from "./types.ts";

export type TemplateFrameMetadata = {
  orientation: "portrait" | "landscape" | "square";
  aspectRatio: number;
  role: "hero" | "secondary" | "supporting";
  placement: "left" | "center" | "right" | "full" | "unknown";
  pageSide: "left" | "right" | "cross-spread" | "unknown";
  gutterRisk: "low" | "medium" | "high";
  fullBleed: boolean;
  allowContain: boolean;
  recoveryOnly: boolean;
  userSelectable: boolean;
};

export type RegisteredTemplateFrameMetadata = {
  layoutId: string;
  frameId: string;
} & TemplateFrameMetadata;

type RegistryEntry = { layout: AlbumLayoutDefinition; recoveryOnly: boolean; userSelectable: boolean };

function registry(): RegistryEntry[] {
  return [
    ...ALBUM_LAYOUTS.map((layout) => ({ layout, recoveryOnly: false, userSelectable: true })),
    ...DRAFT_HIERARCHY_LAYOUTS.map((layout) => ({ layout, recoveryOnly: false, userSelectable: true })),
    ...EDITORIAL_TEMPLATES.map((layout) => ({ layout, recoveryOnly: layout.id.startsWith("E_SAFE_FALLBACK_"), userSelectable: true })),
    ...NO_CROP_FINAL_TEMPLATES.map((layout) => ({ layout, recoveryOnly: true, userSelectable: false })),
  ];
}

function roleFor(frame: AlbumFrameDefinition): TemplateFrameMetadata["role"] {
  if (frame.slotRole === "hero" || (frame.slotRole === "primary" && frame.importance >= 0.9)) return "hero";
  if (frame.slotRole === "secondary") return "secondary";
  return "supporting";
}

function geometryMetadata(layout: AlbumLayoutDefinition, frame: AlbumFrameDefinition, recoveryOnly: boolean, userSelectable: boolean): TemplateFrameMetadata {
  const placements = placeFrames(layout.frames, new Map(layout.frames.map((slot) => [slot.id, 0.5])));
  const index = layout.frames.findIndex((slot) => slot.id === frame.id);
  const placement = index >= 0 ? placements[index] : undefined;
  if (!placement || !Number.isFinite(placement.rect.w) || !Number.isFinite(placement.rect.h) || placement.rect.w <= 0 || placement.rect.h <= 0) {
    return { orientation: "square", aspectRatio: 1, role: roleFor(frame), placement: "unknown", pageSide: "unknown", gutterRisk: "high", fullBleed: false, allowContain: false, recoveryOnly, userSelectable };
  }

  const aspectRatio = placement.rect.w / placement.rect.h;
  const orientation = aspectRatio > 1.15 ? "landscape" : aspectRatio < 0.85 ? "portrait" : "square";
  const pageSide = placement.crossesGutter ? "cross-spread" : placement.side;
  const gutterRisk = placement.crossesGutter || placement.gutterClearance < 0
    ? "high"
    : placement.gutterClearance < Math.max(16, ALBUM_DRAFT_CONFIG.book.gutterInset * 1.5) ? "medium" : "low";
  const page = placement.side === "left" ? ALBUM_DRAFT_CONFIG.book.left : ALBUM_DRAFT_CONFIG.book.right;
  const margin = Math.min(
    placement.rect.x - page.x,
    placement.rect.y - page.y,
    page.x + page.w - placement.rect.x - placement.rect.w,
    page.y + page.h - placement.rect.y - placement.rect.h,
  );
  const fullBleed = !placement.crossesGutter && margin <= ALBUM_DRAFT_CONFIG.book.bleed + 0.5;
  const pageBox = contentBox(placement.side);
  const centerX = (placement.rect.x + placement.rect.w / 2 - pageBox.x) / pageBox.w;
  const fillsPage = placement.rect.w / pageBox.w >= 0.82 && placement.rect.h / pageBox.h >= 0.82;
  const position: TemplateFrameMetadata["placement"] = fullBleed || fillsPage
    ? "full"
    : centerX < 0.34 ? "left" : centerX > 0.66 ? "right" : "center";

  return {
    orientation,
    aspectRatio: Number(aspectRatio.toFixed(4)),
    role: roleFor(frame),
    placement: position,
    pageSide,
    gutterRisk,
    fullBleed,
    allowContain: frame.cropShapeId !== "circle" && !placement.crossesGutter && gutterRisk !== "high",
    recoveryOnly,
    userSelectable,
  };
}

export function deriveTemplateFrameMetadata(layout: AlbumLayoutDefinition, frame: AlbumFrameDefinition, options: { recoveryOnly?: boolean; userSelectable?: boolean } = {}): RegisteredTemplateFrameMetadata {
  return {
    layoutId: layout.id,
    frameId: frame.id,
    ...geometryMetadata(layout, frame, options.recoveryOnly ?? false, options.userSelectable ?? false),
  };
}

export function getTemplateFrameMetadata(layoutId: string): RegisteredTemplateFrameMetadata[] | null {
  const entry = registry().find((item) => item.layout.id === layoutId);
  if (!entry) return null;
  return entry.layout.frames.map((frame) => deriveTemplateFrameMetadata(entry.layout, frame, entry));
}
