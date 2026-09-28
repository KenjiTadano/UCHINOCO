"use client";

import { useEffect, useRef, useState } from "react";
import type { AlbumSpreadDraft } from "@/lib/album-draft/types";
import { textStylePreset, visibleDecorationLayers, visibleTextLayers } from "@/lib/album-polish/catalog";
import { originalSignedObjectPath, type AlbumEditorFrame } from "@/lib/album-persistence/editor";
import { PolishMark } from "./polish-mark";
import { sanitizeCropTransform } from "@/lib/smart-crop/transform";
import type { CropTriple } from "@/lib/album-persistence/types";

const BLANK_SPREAD = "/album/06_3_album_preview_blank_spread_taller.png";

type LoadState = "loading" | "loaded" | "error";

type Props = {
  preview: AlbumSpreadDraft;
  frames: AlbumEditorFrame[];
  className?: string;
  interactive?: boolean;
  onCrop?: (frameId: string, crop: CropTriple) => void;
  onCropStart?: (frameId: string) => void;
  onCropEnd?: (frameId: string) => void;
  onImageError?: (photoId: string) => void;
  texts?: Parameters<typeof visibleTextLayers>[1];
  decorations?: Parameters<typeof visibleDecorationLayers>[1];
  layoutId?: string;
};

function FrameImage({
  src,
  crop,
  photoId,
  onImageError,
}: {
  src: string;
  crop: CropTriple;
  photoId: string;
  onImageError?: (photoId: string) => void;
}) {
  const safe = sanitizeCropTransform(crop);
  const [loadState, setLoadState] = useState<LoadState>(src ? "loading" : "error");
  const retried = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    retried.current = false;
    const img = imgRef.current;
    if (!src || !img) {
      setLoadState(src ? "loading" : "error");
      return;
    }
    const markLoaded = () => {
      if (img.complete && img.naturalWidth > 0) setLoadState("loaded");
    };
    markLoaded();
    img.addEventListener("load", markLoaded);
    return () => img.removeEventListener("load", markLoaded);
  }, [src]);

  return (
    <div className="page-edit-draft-photo" data-load-state={loadState}>
      {loadState === "loading" ? <span className="page-edit-draft-photo-status">読み込み中</span> : null}
      {loadState === "error" ? (
        <button
          type="button"
          className="page-edit-draft-photo-status"
          onClick={() => onImageError?.(photoId)}
        >
          再取得
        </button>
      ) : null}
      {src ? (
        // Signed URLs are temporary and already transformed by object-position.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          data-image-kind="original"
          data-src-path={originalSignedObjectPath(src)}
          onLoad={() => setLoadState("loaded")}
          onError={() => {
            setLoadState("error");
            if (!retried.current) {
              retried.current = true;
              onImageError?.(photoId);
            }
          }}
          style={{
            objectPosition: `${safe.x * 100}% ${safe.y * 100}%`,
            transform: `scale(${safe.scale})`,
            transformOrigin: `${safe.x * 100}% ${safe.y * 100}%`,
            opacity: loadState === "loaded" ? 1 : 0,
          }}
        />
      ) : null}
    </div>
  );
}

/** Fixed catalog frames on the blank spread. Frame size stays with the layout. */
export function DraftSpreadView({
  preview,
  frames,
  className = "",
  interactive = false,
  onCrop,
  onCropStart,
  onCropEnd,
  onImageError,
  texts = [],
  decorations = [],
  layoutId,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useRef({ frames, interactive, onCrop, onCropStart, onCropEnd });
  live.current = { frames, interactive, onCrop, onCropStart, onCropEnd };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let drag: {
      frameId: string;
      x: number;
      y: number;
      crop: CropTriple;
      width: number;
      height: number;
    } | null = null;

    const slotFrame = (target: EventTarget | null) => {
      const { frames: slots, interactive: enabled, onCrop: crop } = live.current;
      if (!enabled || !crop) return null;
      const slot = (target as HTMLElement | null)?.closest?.("[data-frame-id]");
      const frameId = slot?.getAttribute("data-frame-id");
      const frame = slots.find((item) => item.id === frameId);
      if (!frame || !slot) return null;
      return { frame, slot, crop };
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = slotFrame(event.target);
      if (!hit) return;
      const bounds = hit.slot.getBoundingClientRect();
      drag = {
        frameId: hit.frame.id,
        x: event.clientX,
        y: event.clientY,
        crop: { ...hit.frame.crop },
        width: bounds.width || 1,
        height: bounds.height || 1,
      };
      live.current.onCropStart?.(hit.frame.id);
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      const { onCrop: crop } = live.current;
      if (!crop) return;
      const dx = (event.clientX - drag.x) / drag.width;
      const dy = (event.clientY - drag.y) / drag.height;
      crop(
        drag.frameId,
        sanitizeCropTransform({
          x: drag.crop.x - dx,
          y: drag.crop.y - dy,
          scale: drag.crop.scale,
        }),
      );
    };
    const onUp = () => {
      if (!drag) return;
      const frameId = drag.frameId;
      drag = null;
      live.current.onCropEnd?.(frameId);
    };
    const onWheel = (event: WheelEvent) => {
      const hit = slotFrame(event.target);
      if (!hit) return;
      event.preventDefault();
      hit.crop(
        hit.frame.id,
        sanitizeCropTransform({
          ...hit.frame.crop,
          scale: hit.frame.crop.scale + (event.deltaY < 0 ? 0.08 : -0.08),
        }),
      );
    };
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`page-edit-draft ${className}`.trim()}
      style={{ aspectRatio: "1076 / 1264" }}
      data-layout={preview.layoutId}
    >
      <div className="page-edit-polish-layer" data-testid="page-edit-polish-layer">
        {visibleTextLayers(layoutId ?? preview.layoutId, texts).map((layer) => {
          const preset = textStylePreset(layer.styleId);
          return (
            <p
              key={layer.slotId}
              className={`page-polish-text page-polish-text--${layer.kind}`}
              data-testid={`page-polish-text-${layer.slotId}`}
              data-style={layer.styleId}
              style={{
                left: `${layer.rect.x * 100}%`,
                top: `${layer.rect.y * 100}%`,
                width: `${layer.rect.w * 100}%`,
                height: `${layer.rect.h * 100}%`,
                fontFamily: preset.fontFamily,
                fontSize: preset.fontSize,
              }}
            >
              {layer.text}
            </p>
          );
        })}
        {visibleDecorationLayers(layoutId ?? preview.layoutId, decorations).map((layer) => (
          <span
            key={layer.slotId}
            className={`page-polish-decoration page-polish-decoration--${layer.scale}`}
            data-testid={`page-polish-decoration-${layer.slotId}`}
            data-decoration={layer.decorationId}
            style={{
              left: `${layer.rect.x * 100}%`,
              top: `${layer.rect.y * 100}%`,
              width: `${layer.rect.w * 100}%`,
              height: `${layer.rect.h * 100}%`,
            }}
          >
            <PolishMark id={layer.decorationId} />
          </span>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BLANK_SPREAD} alt="" className="page-edit-draft-blank" />
      {preview.assignments.map((assignment, index) => {
        const frame = frames[index];
        const crop = frame?.crop ?? assignment.crop;
        const photoId = frame?.photoId ?? assignment.photoId;
        const src = frame?.previewUrl || assignment.previewUrl;
        const { norm } = assignment.placement;
        return (
          <div
            key={frame?.id ?? assignment.frameId}
            className={`page-edit-draft-frame${interactive ? " is-interactive" : ""}`}
            role={interactive ? "group" : undefined}
            aria-label={interactive ? "写真の位置" : undefined}
            data-testid={frame ? `page-edit-frame-${frame.frameId}` : undefined}
            data-frame-id={frame?.id}
            data-photo-id={photoId}
            data-role={frame?.role ?? assignment.role}
            data-crop={`${crop.x},${crop.y},${crop.scale}`}
            data-geometry={`${norm.x},${norm.y},${norm.w},${norm.h}`}
            style={{
              left: `${norm.x * 100}%`,
              top: `${norm.y * 100}%`,
              width: `${norm.w * 100}%`,
              height: `${norm.h * 100}%`,
            }}
          >
            <FrameImage src={src} crop={crop} photoId={photoId} onImageError={onImageError} />
          </div>
        );
      })}
    </div>
  );
}
