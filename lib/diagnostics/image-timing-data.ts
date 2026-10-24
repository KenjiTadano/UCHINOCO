/** Explicit numeric allowlists: never serialize PerformanceEntry or its name. */
export function finiteTiming(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : 0;
}
export function resourceTimingData(entry: Partial<PerformanceResourceTiming>) {
  return {
    startTime: finiteTiming(entry.startTime),
    requestStart: finiteTiming(entry.requestStart),
    responseStart: finiteTiming(entry.responseStart),
    responseEnd: finiteTiming(entry.responseEnd),
    duration: finiteTiming(entry.duration),
    transferSize: finiteTiming(entry.transferSize),
    encodedBodySize: finiteTiming(entry.encodedBodySize),
    decodedBodySize: finiteTiming(entry.decodedBodySize),
    initiatorType: entry.initiatorType === "img" ? "img" : entry.initiatorType === "link" ? "link" : "other",
    detailTimingExposed: typeof entry.responseStart === "number" && entry.responseStart > 0,
  };
}
export function diagnosticRoute(path: string, search: string) {
  if (/\/pets\/[^/]+\/album\/[^/]+\/pages\/edit$/.test(path)) return "page-editor";
  if (/\/pets\/[^/]+\/album\/[^/]+\/edit$/.test(path)) return "edit";
  if (/\/pets\/[^/]+\/album\/[^/]+$/.test(path) && new URLSearchParams(search).get("view") === "preview") return "preview";
  return null;
}
