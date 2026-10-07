"use client";

import { SmartCropPreview } from "@/app/(app)/dev/smart-crop/smart-crop-preview";
import type { LayoutMatchResult } from "@/lib/smart-layout/types";

type Props = {
  result: LayoutMatchResult;
  /** photoId → cached thumbnail/preview URL; this canvas never falls back to originals. */
  previewUrlByPhotoId: Record<string, string>;
  debug?: boolean;
  title?: string;
};

/**
 * Draw a spread with shared SmartCropPreview (same crop look as Task048 Lab).
 */
export function LayoutPreview({ result, previewUrlByPhotoId, debug = false, title }: Props) {
  return (
    <div className="w-full">
      {title ? <p className="mb-2 m-0 text-[13px] font-semibold text-[#5c534e]">{title}</p> : null}
      <div className="relative w-full overflow-hidden rounded-xl border border-[#eadfd8] bg-[#f3ebe4]" style={{ aspectRatio: "16 / 10" }} data-testid={`layout-preview-${result.layoutId}`}>
        {result.layout.frames.map((frameDef) => {
          const a = result.assignments.find((x) => x.frameId === frameDef.id);
          const { rect } = frameDef;
          if (!a) {
            return (
              <div
                key={frameDef.id}
                className="absolute flex flex-col items-center justify-center bg-[#4a2c28] px-2 text-center"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  borderRadius: "8px",
                }}
                data-testid={`layout-slot-missing-${frameDef.id}`}
              >
                <span className="text-[10px] font-bold text-[#ffb4a8]">ASSIGNMENT_MISSING</span>
                <span className="font-mono text-[9px] text-white/60">{frameDef.id}</span>
              </div>
            );
          }

          const preview = previewUrlByPhotoId[a.photoId];
          const primary = preview;
          const fallback = null;

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
              {primary ? (
                <SmartCropPreview src={primary} fallbackSrc={fallback} frame={a.cropFrame} transform={a.crop} fill photoId={a.photoId} showErrorDetails />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#4a2c28] px-2 text-center">
                  <span className="text-[10px] font-bold text-[#ffb4a8]">IMAGE_LOAD_FAILED</span>
                  <span className="font-mono text-[9px] text-white/70">photoId={a.photoId}</span>
                  <span className="text-[9px] text-white/50">missing URL</span>
                </div>
              )}
              {debug ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-black/55 px-1.5 py-1 text-[9px] leading-tight text-white space-y-0.5">
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
                  <div className="border-t border-white/20 pt-0.5 mt-0.5 text-[8px] text-white/90">
                    <div>
                      PI: overall={a.photoIntelligence?.overallScore ?? "N/A"} · comp={a.photoIntelligence?.composition ?? "N/A"} · tech=
                      {a.photoIntelligence?.technicalQuality ?? "N/A"} · vis=
                      {a.photoIntelligence?.petVisibility ?? "N/A"} · exp=
                      {a.photoIntelligence?.expression ?? "N/A"}
                    </div>
                    <div>
                      BestShot: role={a.bestShot?.candidate.role ?? "N/A"} · score=
                      {a.bestShot?.candidate.scores.overall ?? "N/A"} · conf=
                      {a.bestShot?.confidence ?? "N/A"} · sceneRep=
                      {a.bestShot?.candidate.scores.sceneRepresentativeness ?? "N/A"}
                    </div>
                    <div>
                      Hero: suit={a.heroSuitability ?? "N/A"} · conf=
                      {result.heroConfidence ?? "N/A"}
                    </div>
                    <div>
                      Layout: cropQ={a.quality.overall} · frameTier=
                      {a.frameMatch.matchTier ?? "N/A"}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {debug && result.v2 ? (
        <div className="mt-2 rounded-lg border border-[#eadfd8] bg-white/80 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#5c534e]">
          <div>v2 final={result.v2.finalScore} · affinity={result.v2.templateAffinity} · family={result.v2.family}</div>
          <div>orientation={result.v2.orientationFit} · hero={result.v2.heroFit} · caption={result.v2.captionFit} · story={result.v2.storyFit}</div>
          <div>crop={result.v2.cropFit} · spreadSafety={result.v2.spreadSafety}</div>
        </div>
      ) : null}
    </div>
  );
}
