/**
 * Provider error hierarchy.
 * These are internal errors — never expose raw messages to clients.
 *
 * Note: parameter properties (public readonly in constructor) are avoided
 * because Node.js --experimental-strip-types does not support TypeScript
 * transformations (strip-only mode). Properties are assigned explicitly.
 */

export class PrintProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PrintProviderError";
    this.code = code;
  }
}

/** Provider is not configured or not yet implemented. */
export class ProviderNotConfiguredError extends PrintProviderError {
  constructor(provider: string, detail?: string) {
    super(
      "PROVIDER_NOT_CONFIGURED",
      detail ?? `Print provider '${provider}' is not configured`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}

/** No SKU / productUid mapping found for the given product + pages + provider. */
export class ProviderProductUnavailableError extends PrintProviderError {
  constructor(productId: string, pages: number, provider: string) {
    super(
      "PRODUCT_UNAVAILABLE",
      `No product mapping for productId='${productId}' pages=${pages} on provider='${provider}'`,
    );
    this.name = "ProviderProductUnavailableError";
  }
}

/** Provider API returned an error response. */
export class ProviderRequestError extends PrintProviderError {
  constructor(message: string) {
    super("REQUEST_FAILED", message);
    this.name = "ProviderRequestError";
  }
}

/** Provider API request timed out. */
export class ProviderTimeoutError extends PrintProviderError {
  constructor(provider: string) {
    super("TIMEOUT", `Request to provider '${provider}' timed out`);
    this.name = "ProviderTimeoutError";
  }
}
