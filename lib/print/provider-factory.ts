import "server-only";

import type { PrintProvider, PrintProviderName } from "./types.ts";
import { MockPrintProvider } from "./providers/mock.ts";
import { ProdigiProvider } from "./providers/prodigi.ts";
import { ProviderNotConfiguredError } from "./errors.ts";

const VALID_PROVIDERS: ReadonlyArray<PrintProviderName> = [
  "mock",
  "prodigi",
  "gelato",
  "fujifilm",
];

/** Returns a PrintProvider instance for the given provider name. */
export function getPrintProvider(name: PrintProviderName): PrintProvider {
  switch (name) {
    case "mock":
      return new MockPrintProvider();
    case "prodigi":
      return new ProdigiProvider();
    case "gelato":
      throw new ProviderNotConfiguredError(
        "gelato",
        "Gelato provider is not yet implemented.",
      );
    case "fujifilm":
      throw new ProviderNotConfiguredError(
        "fujifilm",
        "Fujifilm provider is not yet implemented.",
      );
  }
}

/**
 * Returns the default PrintProvider based on PRINT_PROVIDER env var.
 * Defaults to "mock" — never silently switches to a live provider.
 * Throws on invalid PRINT_PROVIDER values.
 */
export function getDefaultPrintProvider(): PrintProvider {
  const raw = process.env.PRINT_PROVIDER ?? "mock";
  if (!(VALID_PROVIDERS as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid PRINT_PROVIDER: '${raw}'. Valid values: ${VALID_PROVIDERS.join(", ")}`,
    );
  }
  return getPrintProvider(raw as PrintProviderName);
}
