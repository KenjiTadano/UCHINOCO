import { diagnosticRoute, finiteTiming, resourceTimingData } from "./image-timing-data";

const OUTPUT_ID = "image-timing-diagnostics";
const MAX_IMAGES = 160;
const MAX_RESOURCES = 320;
const MAX_EVENTS = 4;
const MAX_MS = 30_000;
const SCAN_MS = 250;

type RecordState = {
  ordinal: number;
  firstObservedAt: number;
  completeObservedAt: number | null;
  loadEvents: number[];
  errorEvents: number[];
};

/** Preview-only, document-local observer. No fetch, decode, source/attribute mutation, or telemetry. */
export function installImageTimingDiagnostics() {
  const route = diagnosticRoute(location.pathname, location.search);
  if (!route) return;
  const installedAt = performance.now();
  const images = new Map<HTMLImageElement, RecordState>();
  // Resource names exist ONLY as ephemeral closure keys for DOM matching; never in published data.
  const resources = new Map<string, (ReturnType<typeof resourceTimingData> & { ordinal: number })[]>();
  let nextResourceOrdinal = 0;
  let maxScanDurationMs = 0;
  let stopped = false;
  let failed = false;
  let headingAt: number | null = null;
  let documentLoadAt: number | null = null;
  let bodyObservedAt: number | null = null;
  let pendingRelevantImage = false;
  let lastImageEventAt = installedAt;
  let nextOrdinal = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resourceObserver: PerformanceObserver | undefined;
  const now = () => finiteTiming(performance.now());

  function record(img: HTMLImageElement) {
    if (!images.has(img) && images.size < MAX_IMAGES) {
      images.set(img, { ordinal: nextOrdinal++, firstObservedAt: now(), completeObservedAt: null, loadEvents: [], errorEvents: [] });
    }
    return images.get(img);
  }
  function geometry(element: Element) {
    const r = element.getBoundingClientRect();
    let left = Math.max(0, r.left), top = Math.max(0, r.top);
    let right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return "offscreen";
      if (parent === element) continue;
      const p = parent.getBoundingClientRect();
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) { left = Math.max(left, p.left); right = Math.min(right, p.right); }
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowY)) { top = Math.max(top, p.top); bottom = Math.min(bottom, p.bottom); }
    }
    // Opacity-zero loading images still occupy viewport space and must be counted.
    if (r.width <= 0 || r.height <= 0 || right <= left || bottom <= top) return "offscreen";
    return left <= r.left && top <= r.top && right >= r.right && bottom >= r.bottom ? "full" : "partial";
  }
  function attribute(img: HTMLImageElement, key: string, allowed: string[]) {
    const value = img.getAttribute(key);
    return value && allowed.includes(value) ? value : "unspecified";
  }
  function resourceFor(img: HTMLImageElement) {
    // No name/path/url escapes this function; shared URLs may match several DOM ordinals.
    const key = img.currentSrc || img.src;
    return (resources.get(key) ?? []).slice(-MAX_EVENTS);
  }
  function captureHeading() {
    const heading = document.querySelector("h1");
    const expected = route === "edit" ? "アルバムを編集" : route === "page-editor" ? "ページを編集" : "アルバムのプレビュー";
    if (headingAt === null && heading?.textContent?.trim() === expected) headingAt = now();
    if (route === "preview" && bodyObservedAt === null && document.querySelector('[role="tablist"]')) bodyObservedAt = now();
  }
  function publish() {
    const output = document.getElementById(OUTPUT_ID);
    if (!output) return;
    captureHeading();
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const rows = [...images].filter(([img]) => img.isConnected).map(([img, state]) => {
      if (img.complete && img.naturalWidth > 0 && state.completeObservedAt === null) state.completeObservedAt = now();
      const r = img.getBoundingClientRect();
      const group = img.closest('a[href*="/pages/edit?spread="]') ? "body-card"
        : img.closest('[data-testid="book-spread-thumb"], .book-spread-thumb') ? "rail"
        : img.closest(".album-edit-cover-wrap") ? "cover-main"
        : img.closest("main") ? "main-or-other" : "other";
      return {
        ...state, loadEvents: [...state.loadEvents], errorEvents: [...state.errorEvents],
        group, viewport: geometry(img), complete: img.complete,
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        opacity: finiteTiming(Number(getComputedStyle(img).opacity)),
        srcPresent: Boolean(img.getAttribute("src")), currentSrcPresent: Boolean(img.currentSrc),
        rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        loading: attribute(img, "loading", ["eager", "lazy"]), decoding: attribute(img, "decoding", ["sync", "async", "auto"]),
        fetchpriority: attribute(img, "fetchpriority", ["high", "low", "auto"]),
        resources: resourceFor(img),
        loadEventUnavailable: img.complete && state.loadEvents.length === 0,
      };
    });
    pendingRelevantImage = rows.some(row => !row.complete && (row.viewport !== "offscreen" || row.loading !== "lazy"));
    output.textContent = JSON.stringify({
      version: 1, route, timeOrigin: finiteTiming(performance.timeOrigin), observerInstalledAt: finiteTiming(installedAt),
      observedAt: now(), headingObservedAt: headingAt, bodyObservedAt, documentLoadAt,
      navigation: navigation ? {
        startTime: finiteTiming(navigation.startTime), responseStart: finiteTiming(navigation.responseStart),
        responseEnd: finiteTiming(navigation.responseEnd), domContentLoadedEventEnd: finiteTiming(navigation.domContentLoadedEventEnd),
        loadEventStart: finiteTiming(navigation.loadEventStart), loadEventEnd: finiteTiming(navigation.loadEventEnd),
      } : null,
      stopped, maxScanDurationMs: finiteTiming(maxScanDurationMs), observerFailed: failed, imageCapReached: images.size >= MAX_IMAGES,
      resourceCapReached: resources.size >= MAX_RESOURCES, decode: "UNVERIFIED_NOT_INVOKED", images: rows,
    });
  }
  function scan() {
    if (stopped) return;
    const startedAt = performance.now();
    try {
      if (diagnosticRoute(location.pathname, location.search) !== route) { stop(); return; }
      for (const img of document.images) record(img);
      publish();
    } catch { failed = true; }
    finally { maxScanDurationMs = Math.max(maxScanDurationMs, performance.now() - startedAt); }
  }
  function onImage(event: Event) {
    if (stopped || !(event.target instanceof HTMLImageElement)) return;
    const state = record(event.target);
    if (!state) return;
    lastImageEventAt = performance.now();
    const events = event.type === "load" ? state.loadEvents : state.errorEvents;
    if (events.length < MAX_EVENTS) events.push(now());
    if (event.type === "load" && event.target.complete && event.target.naturalWidth > 0) state.completeObservedAt ??= now();
  }
  function onLoad() { documentLoadAt = now(); scan(); }
  function stop() {
    if (stopped) return;
    stopped = true;
    try { publish(); } catch { /* Never log exception contents. */ }
    resourceObserver?.disconnect(); mutationObserver?.disconnect();
    document.removeEventListener("load", onImage, true); document.removeEventListener("error", onImage, true);
    window.removeEventListener("load", onLoad); window.removeEventListener("pagehide", stop);
    if (timer) clearTimeout(timer);
    resources.clear(); images.clear();
  }
  function tick() {
    scan();
    if (stopped) return;
    if (performance.now() - installedAt >= MAX_MS || (documentLoadAt !== null && performance.now() - documentLoadAt >= 4000 && !pendingRelevantImage && performance.now() - lastImageEventAt >= 500)) stop();
    else timer = setTimeout(tick, SCAN_MS);
  }
  document.addEventListener("load", onImage, true); document.addEventListener("error", onImage, true);
  window.addEventListener("load", onLoad, { once: true }); window.addEventListener("pagehide", stop, { once: true });
  if (document.readyState === "complete") documentLoadAt = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.loadEventEnd || null;
  try {
    resourceObserver = new PerformanceObserver(list => {
      try {
        for (const item of list.getEntries()) {
          const entry = item as PerformanceResourceTiming;
          if (entry.initiatorType !== "img" && entry.initiatorType !== "link") continue;
          if (!resources.has(entry.name) && resources.size >= MAX_RESOURCES) continue;
          const values = resources.get(entry.name) ?? [];
          values.push({ ordinal: nextResourceOrdinal++, ...resourceTimingData(entry) }); resources.set(entry.name, values.slice(-MAX_EVENTS));
        }
      } catch { failed = true; }
    });
    resourceObserver.observe({ type: "resource", buffered: true });
  } catch { failed = true; }
  // Only insertion/src changes require immediate scans; never subscribe to our JSON output changes.
  const mutationObserver = new MutationObserver(records => {
    if (!records.some(r => !(r.target instanceof Element && (r.target.id === OUTPUT_ID || r.target.closest(`#${OUTPUT_ID}`))))) return;
    captureHeading();
    for (const mutation of records) for (const node of mutation.addedNodes) {
      if (node instanceof HTMLImageElement) record(node);
      else if (node instanceof Element) for (const img of node.querySelectorAll("img")) record(img);
    }
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
  tick();
}
