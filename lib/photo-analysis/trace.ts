import type { AnalysisType, CacheSource, ResultStatus } from "./constants.ts";

export type AnalysisTrace = {
  photoId: string;
  analysisType: AnalysisType;
  version: string;
  fingerprint: string;
  cacheSource: CacheSource;
  status: ResultStatus;
  visionCalled: boolean;
  createdAt: string | null;
};

const globalStore = globalThis as typeof globalThis & {
  __uchinocoAnalysisTrace?: Map<string, AnalysisTrace>;
  __uchinocoVisionCalls?: number;
};

function traces() {
  return (globalStore.__uchinocoAnalysisTrace ??= new Map());
}

export function clearAnalysisTraces() {
  traces().clear();
}

/** First source in a run wins, so a later memory hit does not hide a DB hit. */
export function noteAnalysisTrace(trace: AnalysisTrace) {
  const key = `${trace.photoId}::${trace.analysisType}`;
  const map = traces();
  if (map.has(key)) return;
  map.set(key, trace);
}

export function analysisTraces(): AnalysisTrace[] {
  return [...traces().values()];
}

export function resetVisionCalls() {
  globalStore.__uchinocoVisionCalls = 0;
}

export function noteVisionCall() {
  globalStore.__uchinocoVisionCalls = (globalStore.__uchinocoVisionCalls ?? 0) + 1;
}

export function visionCallCount() {
  return globalStore.__uchinocoVisionCalls ?? 0;
}

export function aggregateCacheSource(sources: CacheSource[]): CacheSource | "mixed" | undefined {
  const unique = [...new Set(sources)];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];
  return "mixed";
}
