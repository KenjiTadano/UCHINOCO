import type { DraftDecoration, DraftTextElement } from "../album-polish/types.ts";
import type { SpreadLayoutRanking } from "../album-draft/types.ts";
import type { PageBackgroundState, PageElement, PageSide } from "../album-elements/model.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "../album-draft/layouts.ts";
import { sanitizeCropTransform } from "../smart-crop/transform.ts";
import { EDITORIAL_TEMPLATES } from "../smart-layout/editorial-library.ts";
import { ALBUM_LAYOUTS } from "../smart-layout/layouts.ts";
import { templateMetadata } from "../smart-layout/template-system.ts";
import { findDraftLayout, toPreviewSpread } from "./preview.ts";
import { resolveEffectiveFrame, resolveEffectiveSpread } from "./resolve.ts";
import type { CropTriple, DraftFrameRow, DraftSpreadRow } from "./types.ts";
import type { PersistedDraftView, PersistedSpreadView } from "./view.ts";

export const EDITOR_ORDERED_MESSAGE = "注文済みのため編集できません";
export const EDITOR_MISSING_DRAFT_MESSAGE = "保存された初稿がありません。";

/** Path inside pet-photos. Thumbnails and token query strings are not part of the frame source. */
export function originalSignedObjectPath(url: string) {
  const marker = "/object/sign/pet-photos/";
  const start = url.indexOf(marker);
  if (start < 0) return "";
  const path = url.slice(start + marker.length).split("?")[0] ?? "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export type AlbumEditorFrame = {
  id: string;
  frameId: string;
  role: string;
  position: number;
  photoId: string;
  previewUrl: string;
  crop: CropTriple;
  revision: number;
  clientSeq: number;
  photoOverridden: boolean;
  cropOverridden: boolean;
};

export type AlbumEditorSpread = {
  id: string;
  position: number;
  layoutId: string;
  aiLayoutId: string;
  layoutOverridden: boolean;
  revision: number;
  clientSeq: number;
  frames: AlbumEditorFrame[];
};

export type EditorLayoutChoice = {
  id: string;
  label: string;
  category: string;
  recommended: boolean;
  aiRank: number | null;
  aiScore: number | null;
  tier: string | null;
  frames: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }>;
  textSlots: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }>;
};

export function editorIsReadonly(status: string | null | undefined) {
  return status === "ordered";
}

export function presentSaveError(message: string | null) {
  if (message && message.includes("注文済み")) return EDITOR_ORDERED_MESSAGE;
  return message || "保存に失敗しました。";
}

export function saveStatusLabel(state: "saving" | "saved" | "error") {
  if (state === "saving") return "保存中";
  if (state === "error") return "保存失敗";
  return "保存済み";
}

/** Catalog layouts that keep the same frame count. The current layout stays selectable. */
export function layoutChoices(frameCount: number, currentLayoutId: string, ranking?: SpreadLayoutRanking | null): EditorLayoutChoice[] {
  const byId = new Map<string, (typeof ALBUM_LAYOUTS)[number]>();
  for (const layout of (currentLayoutId.startsWith("E_") ? EDITORIAL_TEMPLATES : [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS])) {
    if (layout.photoCount === frameCount) byId.set(layout.id, layout);
  }
  const current = findDraftLayout(currentLayoutId);
  if (current && current.photoCount === frameCount) byId.set(current.id, current);
  const rankingApplies = Boolean(ranking?.selectedLayout && byId.has(ranking.selectedLayout.layoutId));
  const rankedLayouts = rankingApplies ? [ranking!.selectedLayout!, ...ranking!.alternatives] : [];
  const rankById = new Map<string, { rank: number; score: number; tier: string }>();
  rankedLayouts.forEach((candidate, rank) => {
    if (byId.has(candidate.layoutId) && !rankById.has(candidate.layoutId)) {
      rankById.set(candidate.layoutId, { rank, score: candidate.score, tier: candidate.tier });
    }
  });
  const hasRanking = rankById.size > 0;
  return [...byId.values()]
    .map((layout) => {
      const definition = findDraftLayout(layout.id) ?? layout;
      const metadata = templateMetadata(definition);
      const ranked = rankById.get(layout.id);
      const category = metadata.captionSupport === "prominent"
        ? "文字あり"
        : metadata.composition === "hero" || metadata.composition === "fullBleed"
          ? "写真大きめ"
          : metadata.whitespaceIntent === "quiet" || metadata.whitespaceIntent === "editorial"
            ? "余白あり"
            : "バランス";
      return {
        id: layout.id,
        label: layout.name,
        category,
        recommended: ranked?.rank === 0,
        aiRank: ranked?.rank ?? null,
        aiScore: ranked?.score ?? null,
        tier: ranked?.tier ?? null,
        frames: definition.frames.map((frame) => ({ id: frame.id, rect: frame.rect })),
        textSlots: definition.textSlots?.map((slot) => ({ id: slot.id, rect: slot.rect })) ?? [],
      };
    })
    .sort((a, b) => {
      if (hasRanking) {
        if (a.aiRank !== null && b.aiRank !== null) return a.aiRank - b.aiRank;
        if (a.aiRank !== null) return -1;
        if (b.aiRank !== null) return 1;
        return 0;
      }
      return Number(b.id === currentLayoutId) - Number(a.id === currentLayoutId);
    });
}

export function assembleEditorSpread(spread: DraftSpreadRow, frames: DraftFrameRow[], previewUrlByPhotoId: Map<string, string>, texts: DraftTextElement[] = [], decorations: DraftDecoration[] = [], elements: PageElement[] = [], backgrounds: Partial<Record<PageSide, PageBackgroundState>> = {}): PersistedSpreadView {
  const ordered = [...frames].sort((a, b) => a.position - b.position);
  const effective = resolveEffectiveSpread(spread);
  return {
    id: spread.id,
    position: spread.position,
    storySpreadId: spread.storySpreadId,
    aiLayoutId: spread.aiLayoutId,
    userLayoutId: spread.userLayoutId,
    effectiveLayoutId: effective.layoutId,
    revision: spread.revision,
    clientSeq: spread.clientSeq,
    source: spread,
    sourceFrames: ordered,
    texts,
    decorations,
    elements,
    backgrounds: {
      left: backgrounds.left ?? { backgroundId: null, revision: 0, clientSeq: 0 },
      right: backgrounds.right ?? { backgroundId: null, revision: 0, clientSeq: 0 },
    },
    frames: ordered.map((frame) => {
      const shown = resolveEffectiveFrame(frame);
      const userCrop = frame.userCropX == null && frame.userCropY == null && frame.userCropScale == null ? null : { x: frame.userCropX, y: frame.userCropY, scale: frame.userCropScale };
      return {
        id: frame.id,
        frameId: frame.frameId,
        role: frame.role,
        position: frame.position,
        aiPhotoId: frame.aiPhotoId,
        userPhotoId: frame.userPhotoId,
        effectivePhotoId: shown.photoId,
        aiCrop: { x: frame.aiCropX, y: frame.aiCropY, scale: frame.aiCropScale },
        userCrop,
        effectiveCrop: shown.crop,
        revision: frame.revision,
        clientSeq: frame.clientSeq,
      };
    }),
    preview: toPreviewSpread(spread, ordered, previewUrlByPhotoId),
  };
}

export function toAlbumEditorSpread(spread: PersistedSpreadView, previewUrls: Record<string, string>): AlbumEditorSpread {
  const effective = resolveEffectiveSpread(spread.source);
  return {
    id: spread.id,
    position: spread.position,
    layoutId: effective.layoutId,
    aiLayoutId: spread.source.aiLayoutId,
    layoutOverridden: effective.layoutOverridden,
    revision: spread.source.revision,
    clientSeq: spread.source.clientSeq,
    frames: spread.sourceFrames.map((frame) => {
      const shown = resolveEffectiveFrame(frame);
      return {
        id: frame.id,
        frameId: frame.frameId,
        role: frame.role,
        position: frame.position,
        photoId: shown.photoId,
        previewUrl: previewUrls[shown.photoId] ?? "",
        crop: shown.crop,
        revision: frame.revision,
        clientSeq: frame.clientSeq,
        photoOverridden: shown.photoOverridden,
        cropOverridden: shown.cropOverridden,
      };
    }),
  };
}

export function editorPhotoIds(view: PersistedDraftView) {
  const ids = new Set<string>();
  for (const spread of view.spreads) {
    for (const frame of toAlbumEditorSpread(spread, view.previewUrls).frames) ids.add(frame.photoId);
  }
  return [...ids];
}

function urlMap(view: PersistedDraftView, extra?: { photoId: string; url: string }) {
  const map = new Map(Object.entries(view.previewUrls));
  if (extra?.url) map.set(extra.photoId, extra.url);
  return map;
}

/** Rebuild derived frame preview data without dropping persisted page-level editing state. */
function reassemblePersistedSpread(
  spread: PersistedSpreadView,
  frames: DraftFrameRow[],
  previewUrlByPhotoId: Map<string, string>,
  source: DraftSpreadRow = spread.source,
) {
  return assembleEditorSpread(
    source,
    frames,
    previewUrlByPhotoId,
    spread.texts ?? [],
    spread.decorations ?? [],
    spread.elements ?? [],
    spread.backgrounds,
  );
}

export function applySpreadLayout(view: PersistedDraftView, spreadId: string, userLayoutId: string | null, clientSeq: number): PersistedDraftView {
  return {
    ...view,
    spreads: view.spreads.map((spread) => {
      if (spread.id !== spreadId) return spread;
      const source: DraftSpreadRow = { ...spread.source, userLayoutId, clientSeq };
      return reassemblePersistedSpread(spread, spread.sourceFrames, urlMap(view), source);
    }),
  };
}

export function applyFrameCrop(view: PersistedDraftView, frameId: string, crop: CropTriple | null, clientSeq: number): PersistedDraftView {
  const safe = crop ? sanitizeCropTransform(crop) : null;
  return {
    ...view,
    spreads: view.spreads.map((spread) => {
      const index = spread.sourceFrames.findIndex((frame) => frame.id === frameId);
      if (index < 0) return spread;
      const frames = spread.sourceFrames.map((frame, frameIndex) =>
        frameIndex === index
          ? {
              ...frame,
              clientSeq,
              userCropX: safe ? safe.x : null,
              userCropY: safe ? safe.y : null,
              userCropScale: safe ? safe.scale : null,
            }
          : frame,
      );
      return reassemblePersistedSpread(spread, frames, urlMap(view));
    }),
  };
}

export function applyFramePhoto(view: PersistedDraftView, frameId: string, photoId: string | null, clientSeq: number, previewUrl?: string): PersistedDraftView {
  const previewUrls = photoId && previewUrl ? { ...view.previewUrls, [photoId]: previewUrl } : view.previewUrls;
  return {
    ...view,
    previewUrls,
    spreads: view.spreads.map((spread) => {
      const index = spread.sourceFrames.findIndex((frame) => frame.id === frameId);
      if (index < 0) return spread;
      const frames = spread.sourceFrames.map((frame, frameIndex) => (frameIndex === index ? { ...frame, clientSeq, userPhotoId: photoId } : frame));
      return reassemblePersistedSpread(spread, frames, urlMap({ ...view, previewUrls }));
    }),
  };
}

export function applyPreviewUrls(view: PersistedDraftView, urls: Record<string, string>): PersistedDraftView {
  const previewUrls = { ...view.previewUrls, ...urls };
  const map = new Map(Object.entries(previewUrls));
  return {
    ...view,
    previewUrls,
    spreads: view.spreads.map((spread) => reassemblePersistedSpread(spread, spread.sourceFrames, map)),
  };
}

export function clientSeqOf(view: PersistedDraftView, id: string) {
  for (const spread of view.spreads) {
    if (spread.id === id) return spread.source.clientSeq;
    const frame = spread.sourceFrames.find((item) => item.id === id);
    if (frame) return frame.clientSeq;
    const text = (spread.texts ?? []).find((item) => item.id === id || `text:${spread.id}:${item.slotId}` === id);
    if (text) return text.clientSeq;
    const decoration = (spread.decorations ?? []).find((item) => item.id === id || `decoration:${spread.id}:${item.slotId}` === id);
    if (decoration) return decoration.clientSeq;
    if (id.startsWith(`element:${spread.id}:`)) {
      const element = spread.elements?.find((item) => `element:${spread.id}:${item.id}` === id);
      if (element) return element.clientSeq;
    }
    if (id.startsWith(`background:${spread.id}:`)) {
      const side = id.slice(`background:${spread.id}:`.length);
      if (side === "left" || side === "right") return spread.backgrounds?.[side]?.clientSeq ?? 0;
    }
  }
  return 0;
}

/** A slower response must not replace a newer local edit. */
export function mergeServerDraft(local: PersistedDraftView, server: PersistedDraftView, sentSeq: number, targetId: string): PersistedDraftView {
  if (clientSeqOf(local, targetId) > sentSeq) return local;
  return server;
}
