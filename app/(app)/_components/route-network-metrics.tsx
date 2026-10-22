"use client";
import { useEffect } from "react";
import { requestTransport } from "@/lib/request-transport";

/** Preview-only, effect-local observations. URLs stay in memory; logs contain counts only. */
export function RouteNetworkMetrics() {
  useEffect(() => {
    let last = "";
    const canonical = (raw: string) => { const u = new URL(raw, location.href); u.searchParams.delete("_rsc"); u.searchParams.sort(); return u.origin + u.pathname + u.search; };
    let started = 0;
    let target = canonical(location.href);
    const requests: Array<{ key: string; at: number; kind: "document" | "rsc" | "prefetch" }> = [];
    const click = (event: MouseEvent) => {
      const a = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (a && a.origin === location.origin && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { started = performance.now(); target = canonical(a.href); last = ""; }
    };
    const original = window.fetch;
    const wrapped: typeof fetch = (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      try { if (new URL(raw, location.href).origin === location.origin) requests.push({ key: canonical(raw), at: performance.now(), kind: requestTransport(headers, new URL(raw, location.href).href).kind }); } catch { /* not a URL */ }
      return original.call(window, input, init);
    };
    window.fetch = wrapped;
    const summary = () => {
      const main = document.querySelector('main[data-load-stage="primary"]');
      if (!main || main.getAttribute("data-fully-ready") !== "true") return;
      const key = canonical(location.href);
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const rsc = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(entry => {
        try { return new URL(entry.name).searchParams.has("_rsc") && canonical(entry.name) === key; } catch { return false; }
      });
      const active = rsc.filter(entry => key === target && entry.startTime >= started);
      const observed = requests.filter(entry => entry.key === key);
      const atClick = observed.filter(entry => entry.at >= started && key === target);
      const bytes = active.reduce((n, e) => n + e.encodedBodySize, 0);
      const signature = `${key}:${active.length}:${bytes}:${Boolean(navigation?.responseEnd)}`;
      if (signature === last) return;
      last = signature;
      const route = location.pathname === "/home" ? "home" : location.pathname.endsWith("/print") ? "print" : location.pathname.endsWith("/pages/edit") ? "page-editor" : location.pathname.endsWith("/edit") ? "edit" : new URLSearchParams(location.search).get("view") === "preview" ? "preview" : "complete";
      console.info("Route network metrics", JSON.stringify({ route, mode: new URLSearchParams(location.search).get("deliveryMode") === "baseline" ? "baseline" : "candidate", atMs: Date.now(), navigationObserved: started > 0 && key === target, rscRequestCount: active.length, rscEncodedBytes: bytes, navigationRscObserved: atClick.filter(x => x.kind === "rsc").length, prefetchRscObserved: observed.filter(x => x.kind === "prefetch").length, documentCount: started === 0 ? 1 : 0, documentEncodedBytes: started === 0 ? navigation?.encodedBodySize ?? 0 : 0, documentBytesFinal: Boolean(navigation?.responseEnd) }));
    };
    document.addEventListener("click", click, true);
    const observer = new MutationObserver(summary);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-fully-ready"] });
    const resources = new PerformanceObserver(summary);
    resources.observe({ entryTypes: ["resource", "navigation"] });
    window.addEventListener("load", summary);
    summary();
    return () => { if (window.fetch === wrapped) window.fetch = original; document.removeEventListener("click", click, true); observer.disconnect(); resources.disconnect(); window.removeEventListener("load", summary); };
  }, []);
  return null;
}
