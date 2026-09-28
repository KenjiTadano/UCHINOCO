import { createHash } from "node:crypto";
import { getCoverColor, getCoverTemplate } from "../album-cover-templates.ts";
import { bookPrintMetrics } from "../album-draft/pages.ts";
import { textStylePreset, visibleDecorationLayers, visibleTextLayers } from "../album-polish/catalog.ts";
import type { DraftDecoration, DraftTextElement } from "../album-polish/types.ts";
import { resolveEffectiveCover, type DraftCoverRow } from "../album-persistence/cover.ts";
import { toPreviewSpread } from "../album-persistence/preview.ts";
import { resolveEffectiveFrame, resolveEffectiveSpread } from "../album-persistence/resolve.ts";
import type { DraftFrameRow, DraftSpreadRow } from "../album-persistence/types.ts";
import { sanitizeCropTransform } from "../smart-crop/transform.ts";
import { ALBUM_PRINT_SCHEMA_VERSION } from "./config.ts";
import { buildPrintGeometry, normRect } from "./geometry.ts";
import { acceptOriginalPath } from "./images.ts";
import { selectPrintSource } from "./source.ts";
import type { AlbumPrintSnapshot, PrintCover, PrintRect, PrintRevisionRecord, PrintSpread } from "./types.ts";

export type PrintSpreadInput = {
  source: DraftSpreadRow;
  frames: DraftFrameRow[];
  texts: DraftTextElement[];
  decorations: DraftDecoration[];
};

export type PrintSnapshotInput = {
  albumId: string;
  albumStatus: string | null;
  hasPaidOrder?: boolean;
  draftVersionId: string;
  draftRevision: number;
  generatedAt: string;
  dateLabel?: string;
  cover: DraftCoverRow | null;
  spreads: PrintSpreadInput[];
  originals: Record<string, { storagePath: string | null }>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function printFingerprint(payload: unknown) {
  return createHash("sha256").update(stable(payload)).digest("hex");
}

function mmPerPx(geometry: ReturnType<typeof buildPrintGeometry>) {
  return geometry.spread.widthMm / geometry.canvas.width;
}

function coverPhotoNorm(templateId: string) {
  if (templateId === "polaroid") return { x: 0.16, y: 0.32, w: 0.68, h: 0.4 };
  return { x: 0.135, y: 0.34, w: 0.72, h: 0.42 };
}

function coverRect(norm: { x: number; y: number; w: number; h: number }, geometry: ReturnType<typeof buildPrintGeometry>): PrintRect {
  const page = geometry.cover;
  return {
    ...norm,
    xMm: norm.x * page.widthMm,
    yMm: norm.y * page.heightMm,
    wMm: norm.w * page.widthMm,
    hMm: norm.h * page.heightMm,
    xPt: (norm.x * page.widthPt),
    yPt: (norm.y * page.heightPt),
    wPt: norm.w * page.widthPt,
    hPt: norm.h * page.heightPt,
  };
}

export function buildAlbumPrintSnapshot(input: PrintSnapshotInput): AlbumPrintSnapshot {
  if (selectPrintSource({ albumStatus: input.albumStatus, hasPaidOrder: input.hasPaidOrder }) !== "draft") {
    throw new Error("ordered-print-uses-order-snapshot");
  }
  const geometry = buildPrintGeometry();
  const scale = mmPerPx(geometry);
  const coverRow = input.cover;
  const effectiveCover = coverRow
    ? resolveEffectiveCover(coverRow)
    : {
        photoId: null,
        title: "",
        subtitle: "",
        templateId: "simple" as const,
        colorId: "white" as const,
      };
  getCoverTemplate(effectiveCover.templateId);
  getCoverColor(effectiveCover.colorId);
  const coverPath = effectiveCover.photoId ? acceptOriginalPath(input.originals[effectiveCover.photoId]?.storagePath) : null;
  const cover: PrintCover = {
    revision: coverRow?.revision ?? 0,
    photoId: effectiveCover.photoId,
    storagePath: coverPath,
    imageKind: "original",
    title: effectiveCover.title,
    subtitle: effectiveCover.subtitle,
    dateLabel: input.dateLabel ?? "",
    templateId: effectiveCover.templateId,
    colorId: effectiveCover.colorId,
    crop: sanitizeCropTransform({ x: 0.5, y: 0.5, scale: 1 }),
    photoRect: coverRect(coverPhotoNorm(effectiveCover.templateId), geometry),
  };

  const spreads: PrintSpread[] = input.spreads
    .slice()
    .sort((a, b) => a.source.position - b.source.position)
    .map((spread) => {
      const layout = resolveEffectiveSpread(spread.source);
      const preview = toPreviewSpread(spread.source, spread.frames, new Map());
      const frames = spread.frames
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((frame, index) => {
          const shown = resolveEffectiveFrame(frame);
          const placement = preview.assignments[index]?.placement;
          const rect = normRect(
            placement?.norm ?? { x: 0, y: 0, w: 0, h: 0 },
            geometry.canvas,
            scale,
          );
          return {
            id: frame.id,
            frameId: frame.frameId,
            revision: frame.revision,
            side: placement?.side ?? "left",
            photoId: shown.photoId,
            storagePath: acceptOriginalPath(input.originals[shown.photoId]?.storagePath),
            imageKind: "original" as const,
            crop: sanitizeCropTransform(shown.crop),
            rect,
            crossesGutter: placement?.crossesGutter ?? false,
          };
        });
      const texts = visibleTextLayers(layout.layoutId, spread.texts).map((layer) => {
        const row = spread.texts.find((item) => item.slotId === layer.slotId);
        return {
          id: row?.id ?? layer.slotId,
          revision: row?.revision ?? 0,
          slotId: layer.slotId,
          kind: layer.kind,
          text: layer.text,
          styleId: layer.styleId,
          fontFamily: textStylePreset(layer.styleId).fontFamily,
          rect: normRect(layer.rect, geometry.canvas, scale),
        };
      });
      const decorations = visibleDecorationLayers(layout.layoutId, spread.decorations).map((layer) => {
        const row = spread.decorations.find((item) => item.slotId === layer.slotId);
        return {
          id: row?.id ?? layer.slotId,
          revision: row?.revision ?? 0,
          slotId: layer.slotId,
          decorationId: layer.decorationId,
          scale: layer.scale,
          rect: normRect(layer.rect, geometry.canvas, scale),
        };
      });
      return {
        id: spread.source.id,
        position: spread.source.position,
        revision: spread.source.revision,
        layoutId: layout.layoutId,
        frames,
        texts,
        decorations,
      };
    });

  const revisions: PrintRevisionRecord = {
    draft: input.draftRevision,
    cover: cover.revision,
    spreads: input.spreads.map((spread) => ({
      id: spread.source.id,
      revision: spread.source.revision,
      frames: spread.frames.map((frame) => ({ id: frame.id, revision: frame.revision })),
      texts: spread.texts.map((text) => ({ id: text.id, revision: text.revision })),
      decorations: spread.decorations.map((item) => ({ id: item.id, revision: item.revision })),
    })),
  };
  const revisionDigest = printFingerprint(revisions);
  const fingerprint = printFingerprint({
    schemaVersion: ALBUM_PRINT_SCHEMA_VERSION,
    rendererRevision: "4",
    draftVersionId: input.draftVersionId,
    sourceRevision: input.draftRevision,
    revisionDigest,
    cover: {
      photoId: cover.photoId,
      title: cover.title,
      subtitle: cover.subtitle,
      dateLabel: cover.dateLabel,
      templateId: cover.templateId,
      colorId: cover.colorId,
      crop: cover.crop,
    },
    spreads: spreads.map((spread) => ({
      id: spread.id,
      position: spread.position,
      layoutId: spread.layoutId,
      frames: spread.frames.map((frame) => ({
        frameId: frame.frameId,
        photoId: frame.photoId,
        crop: frame.crop,
        rect: { x: frame.rect.x, y: frame.rect.y, w: frame.rect.w, h: frame.rect.h },
      })),
      texts: spread.texts.map((text) => ({
        slotId: text.slotId,
        text: text.text,
        styleId: text.styleId,
      })),
      decorations: spread.decorations.map((item) => ({
        slotId: item.slotId,
        decorationId: item.decorationId,
        scale: item.scale,
      })),
    })),
  });

  return {
    albumId: input.albumId,
    draftVersionId: input.draftVersionId,
    cover,
    spreads,
    generatedAt: input.generatedAt,
    sourceRevision: input.draftRevision,
    schemaVersion: ALBUM_PRINT_SCHEMA_VERSION,
    fingerprint,
    revisionDigest,
    revisions,
    geometry,
  };
}

export function draftPrintIsStale(
  saved: Pick<AlbumPrintSnapshot, "fingerprint">,
  current: Pick<AlbumPrintSnapshot, "fingerprint">,
) {
  return saved.fingerprint !== current.fingerprint;
}

/** Gutter band in spread-normalized coordinates. Shared with the editor metrics. */
export function editorGutterBand() {
  const metrics = bookPrintMetrics();
  return {
    x: metrics.gutter.x / metrics.canvas.width,
    y: 0,
    w: metrics.gutter.width / metrics.canvas.width,
    h: 1,
  };
}
