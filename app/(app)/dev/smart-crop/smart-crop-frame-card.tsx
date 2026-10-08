"use client";

import { useCallback, useRef, useState } from "react";
import type {
  SmartCropFrameResult,
  SmartCropQuality,
  SmartCropTransform,
} from "@/lib/smart-crop/types";
import { SmartCropPreview } from "./smart-crop-preview";

type Props = {
  result: SmartCropFrameResult;
  imageUrl: string;
};

type ViewMode = "after" | "before";

function QualityGrid({
  quality,
  title,
}: {
  quality: SmartCropQuality;
  title: string;
}) {
  return (
    <div className="mt-3">
      <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8a7c74]">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-[#5c534e]">
        <div>
          Face <strong>{quality.faceSafety}</strong>
        </div>
        <div>
          Head <strong>{quality.headSafety}</strong>
        </div>
        <div>
          Ear <strong>{quality.earSafety}</strong>
        </div>
        <div>
          Body <strong>{quality.bodySafety}</strong>
        </div>
        <div>
          Subject Scale <strong>{quality.subjectScale}</strong>
        </div>
        <div>
          Mask <strong>{quality.maskSafety}</strong>
        </div>
        <div>
          Crop Amt <strong>{quality.cropAmount}</strong>
        </div>
        <div>
          Composition <strong>{quality.composition}</strong>
        </div>
        <div>
          Subject Cov. <strong>{quality.subjectCoverage}</strong>
        </div>
        <div>
          Overall <strong>{quality.overall}</strong>
          {quality.rejected ? (
            <span className="ml-1 text-[#a24129]">reject</span>
          ) : null}
        </div>
      </div>
      {quality.rejectReason ? (
        <p className="mt-1 m-0 text-[11px] text-[#a24129]">
          {quality.rejectReason}
        </p>
      ) : null}
    </div>
  );
}

export function SmartCropFrameCard({ result, imageUrl }: Props) {
  const {
    frame,
    aiCrop,
    quality,
    legacyCrop,
    legacyQuality,
    candidatesEvaluated,
  } = result;
  const [viewMode, setViewMode] = useState<ViewMode>("after");
  const [adjustedCrop, setAdjustedCrop] = useState<SmartCropTransform | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origin: SmartCropTransform;
  } | null>(null);

  const activeAi = viewMode === "after" ? aiCrop : legacyCrop;
  const activeQuality = viewMode === "after" ? quality : legacyQuality;
  const crop = viewMode === "after" ? (adjustedCrop ?? activeAi) : activeAi;
  const userAdjusted = viewMode === "after" && adjustedCrop !== null;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (viewMode !== "after") return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: crop,
      };
    },
    [crop, viewMode],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || viewMode !== "after") return;
      const dx = (e.clientX - dragRef.current.startX) / 280;
      const dy = (e.clientY - dragRef.current.startY) / 280;
      setAdjustedCrop({
        ...dragRef.current.origin,
        x: Math.min(
          1,
          Math.max(0, dragRef.current.origin.x - dx / crop.scale),
        ),
        y: Math.min(
          1,
          Math.max(0, dragRef.current.origin.y - dy / crop.scale),
        ),
      });
    },
    [crop.scale, viewMode],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <article
      className="rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm"
      data-testid={`smart-crop-frame-${frame.id}`}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-bold text-[#332f2b]">
          {frame.label}
        </h2>
        <span className="text-[12px] text-[#8a7c74]">
          mask={frame.mask} · Overall {activeQuality.overall}
          {viewMode === "after" ? ` · cand=${candidatesEvaluated}` : ""}
        </span>
      </header>

      <div className="mb-3 flex gap-1 rounded-xl bg-[#f5efe9] p-1 text-[12px] font-semibold">
        <button
          type="button"
          className={`flex-1 rounded-lg px-2 py-1.5 ${
            viewMode === "after"
              ? "bg-white text-[#b36048] shadow-sm"
              : "text-[#8a7c74]"
          }`}
          onClick={() => {
            setViewMode("after");
            setAdjustedCrop(null);
          }}
        >
          After (048.1)
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-2 py-1.5 ${
            viewMode === "before"
              ? "bg-white text-[#b36048] shadow-sm"
              : "text-[#8a7c74]"
          }`}
          onClick={() => {
            setViewMode("before");
            setAdjustedCrop(null);
          }}
        >
          Before (048)
        </button>
      </div>

      <div
        className={
          viewMode === "after"
            ? "cursor-grab touch-none active:cursor-grabbing"
            : "touch-none"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <SmartCropPreview src={imageUrl} frame={frame} transform={crop} />
      </div>

      <QualityGrid
        quality={activeQuality}
        title={viewMode === "after" ? "Quality · 048.1" : "Quality · 048 (scored)"}
      />

      {viewMode === "after" ? (
        <>
          <div className="mt-3 font-mono text-[11px] text-[#6a5c54]">
            x={crop.x.toFixed(3)} · y={crop.y.toFixed(3)} · scale=
            {crop.scale.toFixed(3)}
            {userAdjusted ? " · adjusted" : " · AI"}
          </div>

          <label className="mt-3 flex items-center gap-2 text-[12px] text-[#5c534e]">
            Zoom
            <input
              type="range"
              min={1}
              max={2.8}
              step={0.01}
              value={crop.scale}
              className="flex-1"
              onChange={(e) => {
                setAdjustedCrop((current) => ({
                  ...(current ?? aiCrop),
                  scale: Number(e.target.value),
                }));
              }}
            />
            <span className="w-10 tabular-nums">{crop.scale.toFixed(2)}</span>
          </label>

          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[13px] font-semibold text-[#b36048] disabled:opacity-40"
            disabled={!userAdjusted}
            onClick={() => {
              setAdjustedCrop(null);
            }}
          >
            AIおすすめに戻す
          </button>
        </>
      ) : (
        <div className="mt-3 font-mono text-[11px] text-[#6a5c54]">
          legacy x={legacyCrop.x.toFixed(3)} · y={legacyCrop.y.toFixed(3)} ·
          scale={legacyCrop.scale.toFixed(3)}
        </div>
      )}
    </article>
  );
}
