"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { SmartCropFrame, SmartCropTransform } from "@/lib/smart-crop/types";
import { sanitizeCropTransform } from "@/lib/smart-crop/transform";

type LoadState = "loading" | "loaded" | "error";

type Props = {
  src: string;
  /** Optional fallback if primary src fails (e.g. full image after thumb 403). */
  fallbackSrc?: string | null;
  frame: SmartCropFrame;
  transform: SmartCropTransform;
  className?: string;
  /** Fill parent box (layout slots) instead of enforcing frame aspectRatio. */
  fill?: boolean;
  /** Dev error details */
  photoId?: string;
  showErrorDetails?: boolean;
  borderRadius?: string | number;
  /** ms before treating hung load as IMAGE_LOAD_FAILED */
  loadTimeoutMs?: number;
};

/**
 * Shared Smart Crop preview — same CropTransform → same look
 * in Smart Crop Lab and Smart Layout Lab.
 */
export function SmartCropPreview({ src, fallbackSrc, ...props }: Props) {
  return <SmartCropPreviewContent key={`${src}\0${fallbackSrc ?? ""}`} src={src} fallbackSrc={fallbackSrc} {...props} />;
}

function SmartCropPreviewContent({ src, fallbackSrc, frame, transform, className, fill = false, photoId, showErrorDetails = false, borderRadius, loadTimeoutMs = 8000 }: Props) {
  const safe = sanitizeCropTransform(transform);
  const [activeSrc, setActiveSrc] = useState(src);
  const [triedFallback, setTriedFallback] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (loadState !== "loading") return;
    const t = window.setTimeout(() => {
      if (!triedFallback && fallbackSrc && fallbackSrc !== activeSrc) {
        setTriedFallback(true);
        setActiveSrc(fallbackSrc);
        setLoadState("loading");
        return;
      }
      setErrorCode("IMAGE_LOAD_FAILED");
      setLoadState("error");
    }, loadTimeoutMs);
    return () => window.clearTimeout(t);
  }, [loadState, activeSrc, fallbackSrc, triedFallback, loadTimeoutMs]);

  const radius = borderRadius ?? (frame.mask === "circle" ? "9999px" : fill ? "8px" : "12px");

  const imgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: `${safe.x * 100}% ${safe.y * 100}%`,
    transform: `scale(${safe.scale})`,
    transformOrigin: `${safe.x * 100}% ${safe.y * 100}%`,
    display: "block",
    userSelect: "none",
    pointerEvents: "none",
    opacity: loadState === "loaded" ? 1 : 0,
    transition: "opacity 120ms ease-out",
  };

  return (
    <div
      className={className}
      data-load-state={loadState}
      data-error-code={errorCode ?? undefined}
      style={{
        position: "relative",
        width: "100%",
        height: fill ? "100%" : undefined,
        aspectRatio: fill ? undefined : String(frame.aspectRatio),
        overflow: "hidden",
        borderRadius: radius,
        background: loadState === "error" ? "#4a2c28" : "#e8dfd6",
      }}
    >
      {loadState === "loading" ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{
            background: "linear-gradient(110deg, #efe6df 25%, #f7f1ec 37%, #efe6df 63%)",
            backgroundSize: "200% 100%",
          }}
        >
          <span className="text-[10px] font-semibold tracking-wide text-[#8a7c74]">LOADING</span>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#4a2c28] px-2 text-center">
          <span className="text-[10px] font-bold text-[#ffb4a8]">IMAGE_LOAD_FAILED</span>
          {showErrorDetails ? (
            <>
              <span className="break-all font-mono text-[9px] text-white/70">photoId={photoId ?? "?"}</span>
              <span className="line-clamp-2 break-all font-mono text-[8px] text-white/50">{activeSrc.slice(0, 120)}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeSrc}
        alt=""
        draggable={false}
        style={imgStyle}
        onLoad={() => {
          setLoadState("loaded");
          setErrorCode(null);
        }}
        onError={() => {
          if (!triedFallback && fallbackSrc && fallbackSrc !== activeSrc) {
            setTriedFallback(true);
            setActiveSrc(fallbackSrc);
            setLoadState("loading");
            return;
          }
          setErrorCode("IMAGE_LOAD_FAILED");
          setLoadState("error");
        }}
      />
    </div>
  );
}
