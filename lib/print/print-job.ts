import "server-only";

import type { PrintOrderParams, PrintJobResult, PrintProviderName } from "./types.ts";
import { getPrintProvider } from "./provider-factory.ts";

/**
 * Submits a print job to the specified provider.
 * No DB writes here — the caller (Server Action / webhook) handles print_jobs INSERT.
 */
export async function submitPrintJob(
  params: PrintOrderParams,
  providerName: PrintProviderName = "mock",
): Promise<PrintJobResult> {
  const provider = getPrintProvider(providerName);
  return provider.submitOrder(params);
}
