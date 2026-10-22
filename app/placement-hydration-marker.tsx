"use client";
import { useEffect } from "react";
export function PlacementHydrationMarker() {
  useEffect(() => { document.documentElement.setAttribute("data-placement-hydrated", "true"); }, []);
  return null;
}
