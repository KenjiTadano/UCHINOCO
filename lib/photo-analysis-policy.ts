export const MAX_ANALYSIS_ATTEMPTS = 3;
export const ANALYSIS_RETRY_DELAY_MS = 60_000;
export const ANALYSIS_STALE_MS = 30 * 60_000;

export const TERMINAL_ANALYSIS_ERRORS = [
  "storage_missing", "unsupported_image", "image_too_large", "invalid_image_content",
] as const;
export function isTerminalAnalysisError(code: string | null | undefined) {
  return TERMINAL_ANALYSIS_ERRORS.some((value) => value === code);
}

export function canClaimAnalysis(
  analysis: { status: string; attempts: number; updated_at: string; error_code?: string | null },
  now = Date.now(),
) {
  if (isTerminalAnalysisError(analysis.error_code) || analysis.attempts >= MAX_ANALYSIS_ATTEMPTS) return false;
  if (analysis.status === "pending") return true;
  const age = now - Date.parse(analysis.updated_at);
  return (analysis.status === "failed" && age >= ANALYSIS_RETRY_DELAY_MS) ||
    (analysis.status === "processing" && age >= ANALYSIS_STALE_MS);
}
