"use client";

import { useEffect, useRef, useState } from "react";
import type { AlbumSpreadDraft } from "@/lib/album-draft/types";
import { ELEMENT_BACKGROUNDS, ELEMENT_COLORS, elementAspectLocked, normalizePageElement, pageElementOrder } from "@/lib/album-elements/model";
import { snapPageElement, type PageBackgroundState, type PageElement, type PageSide, type PageSnapGuides } from "@/lib/album-elements/model";
import { textStylePreset, visibleDecorationLayers, visibleTextLayers } from "@/lib/album-polish/catalog";
import { originalSignedObjectPath, type AlbumEditorFrame } from "@/lib/album-persistence/editor";
import { ALBUM_DRAFT_CONFIG } from "@/lib/album-draft/config";
import { digitalFrameRect, digitalNormalizedRect, digitalSpreadGeometry } from "@/lib/album-draft/pages";
import { PolishMark } from "./polish-mark";
import { PageElementMark } from "./page-element-mark";
import { sanitizeCropTransform } from "@/lib/smart-crop/transform";
import type { CropTriple } from "@/lib/album-persistence/types";

const BLANK_SPREAD = "/album/06_3_album_preview_blank_spread_taller.png";
const DIGITAL_GEOMETRY = digitalSpreadGeometry();

type LoadState = "loading" | "loaded" | "error";
type ElementDrag = {
  element: PageElement;
  pointerId: number;
  operation: "move" | "resize" | "rotate";
  x: number;
  y: number;
  canvas: DOMRect;
  startAngle: number;
};

type Props = {
  preview: AlbumSpreadDraft;
  frames: AlbumEditorFrame[];
  className?: string;
  interactive?: boolean;
  digital?: boolean;
  selectedFrameId?: string | null;
  selectedElementId?: string | null;
  elements?: PageElement[];
  backgrounds?: Record<PageSide, PageBackgroundState>;
  interactiveElements?: boolean;
  onFrameSelect?: (frameId: string | null) => void;
  onElementSelect?: (elementId: string | null) => void;
  onElementChange?: (element: PageElement) => void;
  onElementGestureStart?: (elementId: string) => void;
  onElementGestureEnd?: (elementId: string) => void;
  onCrop?: (frameId: string, crop: CropTriple) => void;
  onCropStart?: (frameId: string) => void;
  onCropEnd?: (frameId: string) => void;
  onImageError?: (photoId: string) => void;
  texts?: Parameters<typeof visibleTextLayers>[1];
  decorations?: Parameters<typeof visibleDecorationLayers>[1];
  layoutId?: string;
};

function FrameImage({ src, crop, photoId, onImageError }: { src: string; crop: CropTriple; photoId: string; onImageError?: (photoId: string) => void }) {
  const safe = sanitizeCropTransform(crop);
  const originalPath = originalSignedObjectPath(src);
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
        <button type="button" className="page-edit-draft-photo-status" onClick={() => onImageError?.(photoId)}>
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
          data-image-kind={originalPath ? "original" : "preview"}
          data-src-path={originalPath || undefined}
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
  digital = false,
  selectedFrameId = null,
  selectedElementId = null,
  elements = [],
  backgrounds,
  interactiveElements = false,
  onFrameSelect,
  onElementSelect,
  onElementChange,
  onElementGestureStart,
  onElementGestureEnd,
  onCrop,
  onCropStart,
  onCropEnd,
  onImageError,
  texts = [],
  decorations = [],
  layoutId,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [snapGuides, setSnapGuides] = useState<PageSnapGuides>({ x: null, y: null });
  const live = useRef({ frames, elements, interactive, interactiveElements, onCrop, onCropStart, onCropEnd, onElementSelect, onElementChange, onElementGestureStart, onElementGestureEnd });
  const geometry = digital ? DIGITAL_GEOMETRY : null;
  const gutterStart = geometry ? geometry.leftPage.x + geometry.leftPage.w : 0;
  const gutterWidth = geometry ? Math.max(0, geometry.rightPage.x - gutterStart) : 0;

  function selectFromTarget(target: EventTarget | null) {
    const element = (target as HTMLElement | null)?.closest?.("[data-page-element-id]");
    if (element) {
      onFrameSelect?.(null);
      onElementSelect?.(element.getAttribute("data-page-element-id"));
      return;
    }
    const frame = (target as HTMLElement | null)?.closest?.("[data-frame-id]");
    const frameId = frame?.getAttribute("data-frame-id") ?? null;
    onFrameSelect?.(frameId);
    onElementSelect?.(null);
  }

  useEffect(() => {
    live.current = { frames, elements, interactive, interactiveElements, onCrop, onCropStart, onCropEnd, onElementSelect, onElementChange, onElementGestureStart, onElementGestureEnd };
  }, [frames, elements, interactive, interactiveElements, onCrop, onCropStart, onCropEnd, onElementSelect, onElementChange, onElementGestureStart, onElementGestureEnd]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let drag: {
      frameId: string;
      pointerId: number;
      x: number;
      y: number;
      crop: CropTriple;
      width: number;
      height: number;
    } | null = null;
    let elementDrag: ElementDrag | null = null;

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
      const target = event.target as HTMLElement | null;
      const elementNode = target?.closest?.("[data-page-element-id]");
      const elementId = elementNode?.getAttribute("data-page-element-id");
      const element = live.current.elements.find((item) => item.id === elementId);
      if (element && elementNode && live.current.interactiveElements && live.current.onElementChange) {
        const handle = target?.closest?.("[data-element-handle]")?.getAttribute("data-element-handle");
        const canvas = root.getBoundingClientRect();
        const centerX = canvas.left + (element.x + element.width / 2) * canvas.width;
        const centerY = canvas.top + (element.y + element.height / 2) * canvas.height;
        elementDrag = {
          element,
          pointerId: event.pointerId,
          operation: handle === "resize" || handle === "rotate" ? handle : "move",
          x: event.clientX,
          y: event.clientY,
          canvas,
          startAngle: (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI,
        };
        setSnapGuides({ x: null, y: null });
        elementNode.setPointerCapture(event.pointerId);
        live.current.onElementSelect?.(element.id);
        live.current.onElementGestureStart?.(element.id);
        event.preventDefault();
        return;
      }
      const hit = slotFrame(event.target);
      if (!hit) return;
      const bounds = hit.slot.getBoundingClientRect();
      drag = {
        frameId: hit.frame.id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        crop: { ...hit.frame.crop },
        width: bounds.width || 1,
        height: bounds.height || 1,
      };
      hit.slot.setPointerCapture(event.pointerId);
      live.current.onCropStart?.(hit.frame.id);
    };
    const onMove = (event: PointerEvent) => {
      if (elementDrag && elementDrag.pointerId === event.pointerId) {
        const { element, operation, canvas } = elementDrag;
        const dx = (event.clientX - elementDrag.x) / Math.max(canvas.width, 1);
        const dy = (event.clientY - elementDrag.y) / Math.max(canvas.height, 1);
        let next: PageElement = element;
        if (operation === "move") next = { ...element, x: element.x + dx, y: element.y + dy };
        if (operation === "resize") {
          const width = Math.min(0.96, Math.max(element.type === "text" ? 0.08 : 0.035, element.width + dx));
          next = elementAspectLocked(element) ? { ...element, width, height: element.height * (width / element.width) } : { ...element, width };
        }
        if (operation === "rotate") {
          const centerX = canvas.left + (element.x + element.width / 2) * canvas.width;
          const centerY = canvas.top + (element.y + element.height / 2) * canvas.height;
          const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
          next = { ...element, rotation: Math.round((element.rotation + angle - elementDrag.startAngle) / 15) * 15 };
        }
        if (operation === "move" && geometry) {
          const snapped = snapPageElement(next, [geometry.leftPage, geometry.rightPage]);
          next = snapped.element;
          setSnapGuides(snapped.guides);
        } else {
          setSnapGuides({ x: null, y: null });
        }
        const normalized = normalizePageElement(next);
        if (normalized) live.current.onElementChange?.(normalized);
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
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
    const onUp = (event: PointerEvent) => {
      if (elementDrag && elementDrag.pointerId === event.pointerId) {
        const elementId = elementDrag.element.id;
        elementDrag = null;
        setSnapGuides({ x: null, y: null });
        live.current.onElementGestureEnd?.(elementId);
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
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
  }, [geometry]);

  return (
    <div
      ref={rootRef}
      className={`page-edit-draft${digital ? " page-edit-draft--digital" : ""} ${className}`.trim()}
      style={{
        aspectRatio: digital ? `${geometry?.width} / ${geometry?.height}` : `${ALBUM_DRAFT_CONFIG.book.canvas.width} / ${ALBUM_DRAFT_CONFIG.book.canvas.height}`,
        ...(digital ? { width: `min(100%, calc((100dvh - 250px) * ${geometry?.aspectRatio}))` } : {}),
      }}
      data-layout={preview.layoutId}
      data-surface={digital ? "digital" : "book-mock"}
      onClick={(event) => selectFromTarget(event.target)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const element = (event.target as HTMLElement).closest("[data-page-element-id]");
        if (element && onElementSelect) {
          event.preventDefault();
          onFrameSelect?.(null);
          onElementSelect(element.getAttribute("data-page-element-id"));
          return;
        }
        const frame = (event.target as HTMLElement).closest("[data-frame-id]");
        if (!frame || !onFrameSelect) return;
        event.preventDefault();
        onFrameSelect(frame.getAttribute("data-frame-id"));
      }}
    >
      {digital ? (
        <div className="page-edit-digital-pages" aria-hidden="true">
          <div className="page-edit-digital-page" style={{ left: `${geometry!.leftPage.x * 100}%`, top: `${geometry!.leftPage.y * 100}%`, width: `${geometry!.leftPage.w * 100}%`, height: `${geometry!.leftPage.h * 100}%`, backgroundColor: ELEMENT_BACKGROUNDS.find((item) => item.id === backgrounds?.left.backgroundId)?.hex ?? "#ffffff" }} />
          <div className="page-edit-digital-page" style={{ left: `${geometry!.rightPage.x * 100}%`, top: `${geometry!.rightPage.y * 100}%`, width: `${geometry!.rightPage.w * 100}%`, height: `${geometry!.rightPage.h * 100}%`, backgroundColor: ELEMENT_BACKGROUNDS.find((item) => item.id === backgrounds?.right.backgroundId)?.hex ?? "#ffffff" }} />
          {gutterWidth > 0 ? (
            <div
              className="page-edit-digital-gutter"
              style={{ left: `${gutterStart * 100}%`, top: `${Math.min(geometry!.leftPage.y, geometry!.rightPage.y) * 100}%`, width: `${gutterWidth * 100}%`, height: `${Math.max(geometry!.leftPage.y + geometry!.leftPage.h, geometry!.rightPage.y + geometry!.rightPage.h) * 100 - Math.min(geometry!.leftPage.y, geometry!.rightPage.y) * 100}%` }}
            />
          ) : null}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={BLANK_SPREAD} alt="" className="page-edit-draft-blank" />
      )}
      <div className="page-edit-polish-layer" data-testid="page-edit-polish-layer">
        {visibleTextLayers(layoutId ?? preview.layoutId, texts).map((layer) => {
          const preset = textStylePreset(layer.styleId);
          const rect = digital ? digitalNormalizedRect(layer.rect) : layer.rect;
          return (
            <p
              key={layer.slotId}
              className={`page-polish-text page-polish-text--${layer.kind}`}
              data-testid={`page-polish-text-${layer.slotId}`}
              data-style={layer.styleId}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
                fontFamily: preset.fontFamily,
                fontSize: preset.fontSize,
              }}
            >
              {layer.text}
            </p>
          );
        })}
        {visibleDecorationLayers(layoutId ?? preview.layoutId, decorations).map((layer) => {
          const rect = digital ? digitalNormalizedRect(layer.rect) : layer.rect;
          return (
            <span
              key={layer.slotId}
              className={`page-polish-decoration page-polish-decoration--${layer.scale}`}
              data-testid={`page-polish-decoration-${layer.slotId}`}
              data-decoration={layer.decorationId}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            >
              <PolishMark id={layer.decorationId} />
            </span>
          );
        })}
      </div>
      {preview.assignments.map((assignment, index) => {
        const frame = frames[index];
        const crop = frame?.crop ?? assignment.crop;
        const photoId = frame?.photoId ?? assignment.photoId;
        const src = frame?.previewUrl || assignment.previewUrl;
        const norm = digital ? digitalFrameRect(assignment.placement.rect) : assignment.placement.norm;
        return (
          <div
            key={frame?.id ?? assignment.frameId}
            className={`page-edit-draft-frame${interactive ? " is-interactive" : ""}${selectedFrameId === frame?.id ? " is-selected" : ""}`}
            role={onFrameSelect ? "button" : interactive ? "group" : undefined}
            tabIndex={onFrameSelect ? 0 : undefined}
            aria-label={onFrameSelect ? "写真を選択" : interactive ? "写真の位置" : undefined}
            aria-pressed={onFrameSelect ? selectedFrameId === frame?.id : undefined}
            data-testid={frame ? `page-edit-frame-${frame.frameId}` : undefined}
            data-frame-id={frame?.id}
            data-photo-id={photoId}
            data-selected={selectedFrameId === frame?.id ? "true" : "false"}
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
      {digital ? (
        <div className="page-edit-elements-layer" data-testid="page-edit-elements-layer">
          {pageElementOrder(elements).map((element) => {
            const color = ELEMENT_COLORS.find((item) => item.id === element.colorId)?.hex ?? "#332f2b";
            const selected = selectedElementId === element.id;
            return (
              <div
                key={element.id}
                className={`page-edit-element page-edit-element--${element.type}${interactiveElements ? " is-interactive" : ""}${selected ? " is-selected" : ""}`}
                data-page-element-id={element.id}
                data-element-type={element.type}
                data-selected={selected ? "true" : "false"}
                data-print-target={element.printTarget}
                data-testid={`page-edit-element-${element.id}`}
                role={onElementSelect ? "button" : undefined}
                tabIndex={onElementSelect ? 0 : undefined}
                aria-label={element.type === "text" ? element.text : element.type === "stamp" ? `スタンプ ${element.stampId}` : `装飾 ${element.decorationId}`}
                style={{
                  left: `${element.x * 100}%`,
                  top: `${element.y * 100}%`,
                  width: `${element.width * 100}%`,
                  height: `${element.height * 100}%`,
                  zIndex: selected ? 200 : 10 + element.zIndex,
                  transform: `rotate(${element.rotation}deg)`,
                  color,
                  ...(element.type === "text"
                    ? {
                        fontFamily: textStylePreset(element.fontId).fontFamily,
                        fontSize: `${element.fontSize}px`,
                        fontWeight: element.bold ? 700 : 500,
                        textAlign: element.align,
                      }
                    : {}),
                }}
              >
                {element.type === "text" ? element.text : <PageElementMark type={element.type} markId={element.type === "stamp" ? element.stampId : element.decorationId} color={color} />}
                {selected && interactiveElements ? (
                  <>
                    <button type="button" className="page-edit-element-handle page-edit-element-handle--rotate ds-focus" data-element-handle="rotate" aria-label="回転" />
                    <button type="button" className="page-edit-element-handle page-edit-element-handle--resize ds-focus" data-element-handle="resize" aria-label="サイズ変更" />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {digital && interactiveElements && (snapGuides.x !== null || snapGuides.y !== null) ? (
        <div className="page-edit-snap-guides" aria-hidden="true" data-testid="page-edit-snap-guides">
          {snapGuides.x !== null ? <span className="page-edit-snap-guide page-edit-snap-guide--vertical" style={{ left: `${snapGuides.x * 100}%` }} /> : null}
          {snapGuides.y !== null ? <span className="page-edit-snap-guide page-edit-snap-guide--horizontal" style={{ top: `${snapGuides.y * 100}%` }} /> : null}
        </div>
      ) : null}
    </div>
  );
}
