import "server-only";

import type { PrintOrderParams, PrintJobResult, PrintProviderName } from "./types.ts";
import { getPrintProvider } from "./provider-factory.ts";
import { assertLivePrintReleaseReady, getPrintCommerceMode } from "./commerce-readiness.ts";

/**
 * Submits a print job to the specified provider.
 * No DB writes here — the caller (Server Action / webhook) handles print_jobs INSERT.
 */
export async function submitPrintJob(
  params: PrintOrderParams,
  providerName: PrintProviderName = "mock",
): Promise<PrintJobResult> {
  const mode = getPrintCommerceMode();
  assertLivePrintReleaseReady(mode);
  const provider = getPrintProvider(providerName);
  await provider.validateOrder(params);
  return provider.createOrder(params);
}
