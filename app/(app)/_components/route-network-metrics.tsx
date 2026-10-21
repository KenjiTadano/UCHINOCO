"use client";
import { useEffect } from "react";

/** Preview-only aggregate evidence. Never logs resource URLs or identifiers. */
export function RouteNetworkMetrics() {
  useEffect(() => {
    let last = "";
    const summary = () => {
      const main = document.querySelector('main[data-load-stage="primary"]');
      if (!main || main.getAttribute("data-fully-ready") !== "true") return;
      const key = location.pathname + location.search;
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const rsc = performance.getEntriesByType("resource").filter(entry => {
        try { const url = new URL(entry.name); return url.origin === location.origin && url.searchParams.has("_rsc") && url.pathname === location.pathname && url.searchParams.get("view") === new URLSearchParams(location.search).get("view"); } catch { return false; }
      }) as PerformanceResourceTiming[];
      const bytes = rsc.reduce((n, e) => n + e.encodedBodySize, 0);
      const final = Boolean(navigation?.responseEnd);
      const signature = `${key}:${rsc.length}:${bytes}:${final}`;
      if (signature === last) return;
      last = signature;
      const route = location.pathname === "/home" ? "home" : location.pathname.endsWith("/print") ? "print" : location.pathname.endsWith("/pages/edit") ? "page-editor" : location.pathname.endsWith("/edit") ? "edit" : new URLSearchParams(location.search).get("view") === "preview" ? "preview" : "complete";
      console.info("Route network metrics", JSON.stringify({ route, phase: "client-data-ready", atMs: Date.now(), rscCumulativeCount: rsc.length, rscCumulativeEncodedBytes: bytes, documentEncodedBytes: navigation?.encodedBodySize ?? 0, documentBytesFinal: final }));
    };
    const observer = new MutationObserver(summary);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-fully-ready"] });
    const resources = new PerformanceObserver(summary);
    resources.observe({ entryTypes: ["resource", "navigation"] });
    window.addEventListener("load", summary);
    summary();
    return () => { observer.disconnect(); resources.disconnect(); window.removeEventListener("load", summary); };
  }, []);
  return null;
}
