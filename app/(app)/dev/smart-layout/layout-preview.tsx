"use client";

import { SmartCropPreview } from "@/app/(app)/dev/smart-crop/smart-crop-preview";
import type { LayoutMatchResult } from "@/lib/smart-layout/types";

type Props = {
  result: LayoutMatchResult;
  /** photoId → preview URL (thumbnail preferred) */
  previewUrlByPhotoId: Record<string, string>;
  debug?: boolean;
  title?: string;
};

/**
 * Draw a spread with shared SmartCropPreview (same crop look as Task048 Lab).
 */
export function LayoutPreview({
  result,
  previewUrlByPhotoId,
  debug = false,
  title,
}: Props) {
  return (
    <div className="w-full">
      {title ? (
        <p className="mb-2 m-0 text-[13px] font-semibold text-[#5c534e]">{title}</p>
      ) : null}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-[#eadfd8] bg-[#f3ebe4]"
        style={{ aspectRatio: "16 / 10" }}
        data-testid={`layout-preview-${result.layoutId}`}
      >
        {result.assignments.map((a) => {
          const frame = result.layout.frames.find((f) => f.id === a.frameId);
          if (!frame) return null;
          const src = previewUrlByPhotoId[a.photoId];
          const { rect } = frame;
          return (
            <div
              key={a.frameId}
              className="absolute overflow-hidden"
              data-photo-id={a.photoId}
              data-frame-id={a.frameId}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            >
              {src ? (
                <SmartCropPreview
                  src={src}
                  frame={a.cropFrame}
                  transform={a.crop}
                  fill
                  photoId={a.photoId}
                  showErrorDetails
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#4a2c28] px-2 text-center">
                  <span className="text-[10px] font-bold text-[#ffb4a8]">
                    IMAGE LOAD ERROR
                  </span>
                  <span className="font-mono text-[9px] text-white/70">
                    photoId={a.photoId}
                  </span>
                  <span className="text-[9px] text-white/50">missing previewUrl</span>
                </div>
              )}
              {debug ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-black/55 px-1.5 py-1 text-[9px] leading-tight text-white">
                  <div>
                    {a.slotRole} · {a.cropShapeId}
                  </div>
                  <div>
                    Match {a.frameMatch.matchScore} {a.frameMatch.matchTier}
                  </div>
                  <div>
                    Crop {a.quality.overall} · x={a.crop.x.toFixed(2)} y=
                    {a.crop.y.toFixed(2)} s={a.crop.scale.toFixed(2)}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
