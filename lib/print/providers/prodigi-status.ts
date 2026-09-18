import type { PrintJobStatus } from "../types.ts";

/**
 * Prodigi → internal status mapping.
 *
 * IMPORTANT: Only values confirmed via Prodigi Sandbox / official docs are
 * listed here. Do not add guessed status strings.
 * Unknown statuses fall back to "processing" as a safe, non-destructive default.
 *
 * Confirm actual values by inspecting Sandbox order responses before adding entries.
 * See docs/task047-product-mapping-research.md
 */
const PRODIGI_STATUS_MAP: Record<string, PrintJobStatus["status"]> = {
  // Unconfirmed — populate after Sandbox verification
};

/**
 * Converts a raw Prodigi status string to the internal print_jobs.status enum.
 * Falls back to "processing" for any unrecognised value to avoid incorrect
 * terminal states (failed / cancelled) based on an unknown string.
 */
export function normalizeProdigiStatus(
  rawStatus: string,
): PrintJobStatus["status"] {
  return PRODIGI_STATUS_MAP[rawStatus] ?? "processing";
}

export function buildProdigiJobStatus(
  rawStatus: string,
  trackingNumber?: string | null,
): PrintJobStatus {
  const status = normalizeProdigiStatus(rawStatus);
  return trackingNumber ? { status, trackingNumber } : { status };
}
