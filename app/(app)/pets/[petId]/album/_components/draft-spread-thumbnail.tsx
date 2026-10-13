"use client";

import { useEffect, useRef, useState } from "react";
import { digitalSpreadGeometry } from "@/lib/album-draft/pages";
import { draftSpreadRenderProps } from "@/lib/album-persistence/editor";
import type { PersistedSpreadView } from "@/lib/album-persistence/view";
import { DraftSpreadView } from "./draft-spread-view";

const geometry = digitalSpreadGeometry();

/** Scale the existing renderer, including text/layers, rather than rebuilding an image. */
export function DraftSpreadThumbnail({ spread, previewUrls }: { spread: PersistedSpreadView; previewUrls: Record<string, string> }) {
  const root = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(70);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => { if (node.clientWidth > 0) setWidth(node.clientWidth); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={root} className="draft-spread-thumbnail" style={{ display: "block", width: "100%", aspectRatio: geometry.aspectRatio, position: "relative", overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
      <span style={{ display: "block", position: "absolute", width: geometry.width, height: geometry.height, transform: `scale(${width / geometry.width})`, transformOrigin: "top left" }}>
        <DraftSpreadView {...draftSpreadRenderProps(spread, previewUrls)} thumbnail />
      </span>
    </span>
  );
}
