"use client";

import { useEffect, useRef } from "react";

/** Mounted by RootLayout only for Preview, with a second build-time guard. */
export function PreviewImageTimingOutlet() {
  const ref = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS === "1" && ref.current) ref.current.dataset.observerReady = "1";
  }, []);
  if (process.env.NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS !== "1") return null;
  return <output id="image-timing-diagnostics" ref={ref} hidden />;
}
