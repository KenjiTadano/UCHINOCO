import type { CacheSource, ResultStatus } from "./constants.ts";

/** Memory is enough. A database success is enough. The model runs only after both miss. */
export function analysisReadPlan(input: {
  force: boolean;
  memoryHit: boolean;
  dbHit: boolean;
}): CacheSource {
  if (!input.force && input.memoryHit) return "memory";
  if (!input.force && input.dbHit) return "db";
  return "ai";
}

export type StoredAnalysis = {
  analysisVersion: string;
  sourceFingerprint: string;
  resultStatus: ResultStatus;
  result: unknown;
};

export type AnalysisRequest = {
  analysisVersion: string;
  sourceFingerprint: string;
};

/** Only a success row for the same version and fingerprint is reused. */
export function reusableAnalysis(
  stored: StoredAnalysis | null,
  requested: AnalysisRequest,
): StoredAnalysis | null {
  if (!stored) return null;
  if (stored.resultStatus !== "success") return null;
  if (stored.analysisVersion !== requested.analysisVersion) return null;
  if (stored.sourceFingerprint !== requested.sourceFingerprint) return null;
  return stored;
}

export type WriteDecision =
  | { action: "insert" }
  | { action: "replace_non_success" }
  | { action: "keep"; reason: "success_immutable" | "non_success_kept" };

/**
 * A success row is immutable.
 * A later success may replace fallback or failed.
 * A failure never replaces success.
 */
export function decideAnalysisWrite(
  existing: { resultStatus: ResultStatus } | null,
  incoming: ResultStatus,
): WriteDecision {
  if (!existing) return { action: "insert" };
  if (existing.resultStatus === "success") return { action: "keep", reason: "success_immutable" };
  if (incoming === "success") return { action: "replace_non_success" };
  return { action: "keep", reason: "non_success_kept" };
}
