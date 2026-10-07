import { bookPrintMetrics, placeFrames } from "../album-draft/pages.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "../album-draft/layouts.ts";
import type { AlbumSpreadDraft } from "../album-draft/types.ts";
import { ALBUM_DRAFT_VERSION } from "../album-draft/config.ts";
import { SMART_CROP_FRAMES } from "../smart-crop/frames.ts";
import { ALBUM_LAYOUTS } from "../smart-layout/layouts.ts";
import type { AlbumLayoutDefinition } from "../smart-layout/types.ts";
import { resolveEffectiveFrame, resolveEffectiveSpread } from "./resolve.ts";
import type { DraftFrameRow, DraftSpreadRow } from "./types.ts";

const LAYOUTS: AlbumLayoutDefinition[] = [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS];

export function findDraftLayout(layoutId: string) {
  return LAYOUTS.find((layout) => layout.id === layoutId);
}

function cropFrameFor(shapeId: string) {
  return SMART_CROP_FRAMES.find((frame) => frame.id === shapeId) ?? SMART_CROP_FRAMES[0];
}

/** Rebuild the book preview from stored AI rows plus any user overrides. */
export function toPreviewSpread(
  spread: DraftSpreadRow,
  frames: DraftFrameRow[],
  previewUrlByPhotoId: Map<string, string>,
): AlbumSpreadDraft {
  const effective = resolveEffectiveSpread(spread);
  const layout = findDraftLayout(effective.layoutId);
  const ordered = [...frames].sort((a, b) => a.position - b.position);
  const layoutFrames = layout?.frames ?? [];
  const focals = new Map(
    layoutFrames.map((frame, index) => [frame.id, resolveEffectiveFrame(ordered[index] ?? ordered[0]).crop.x]),
  );
  const placements = layoutFrames.length > 0 ? placeFrames(layoutFrames, focals) : [];
  return {
    spreadId: spread.id,
    storySpreadId: spread.storySpreadId,
    layoutId: effective.layoutId,
    layoutScore: 0,
    engineScore: 0,
    selectedLayout: null,
    assignments: ordered.slice(0, layoutFrames.length).map((frame, index) => {
      const shown = resolveEffectiveFrame(frame);
      const slot = layoutFrames[index];
      return {
        // A manual layout switch keeps the same photos, but the visible slot id
        // must come from the selected layout rather than the persisted AI slot.
        frameId: slot?.id ?? frame.frameId,
        role: frame.role as AlbumSpreadDraft["assignments"][number]["role"],
        photoId: shown.photoId,
        frameMatchScore: frame.cropQuality ?? 0,
        crop: shown.crop,
        cropQuality: frame.cropQuality ?? 0,
        safety: {
          faceSafety: 0,
          headSafety: 0,
          earSafety: 0,
          bodySafety: 0,
          subjectScale: 0,
          maskSafety: 0,
        },
        matchTier: (frame.matchTier ?? "STRICT") as AlbumSpreadDraft["assignments"][number]["matchTier"],
        warnings: frame.warnings,
        placement: placements[index] ?? {
          side: "left",
          rect: { x: 0, y: 0, w: 0, h: 0 },
          norm: { x: 0, y: 0, w: 0, h: 0 },
          gutterClearance: 0,
          crossesGutter: false,
        },
        cropFrame: cropFrameFor(slot?.cropShapeId ?? "portrait"),
        previewUrl: previewUrlByPhotoId.get(shown.photoId) ?? "",
      };
    }),
    quality: {
      cropSafety: 0,
      hierarchy: 0,
      balance: 0,
      storyFit: spread.coherence,
      overall: 0,
    },
    alternatives: [],
    status: "ready",
    warnings: spread.warnings,
    analysisVersion: ALBUM_DRAFT_VERSION,
    print: bookPrintMetrics(),
    story: {
      storyType: spread.storyType as AlbumSpreadDraft["story"]["storyType"],
      recommendedDensity: spread.recommendedDensity as AlbumSpreadDraft["story"]["recommendedDensity"],
      importance: spread.importance,
      coherenceScore: spread.coherence,
      primaryPhotoIds: ordered.filter((frame) => frame.role !== "secondary").map((frame) => frame.aiPhotoId),
      secondaryPhotoIds: ordered.filter((frame) => frame.role === "secondary").map((frame) => frame.aiPhotoId),
      startedAt: "",
    },
  };
}
