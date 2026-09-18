// No "server-only" — pure function module used in tests.
// Server-side callers should prefer importing through provider-factory.ts.
import type { PrintProviderName } from "./types.ts";

export type ProviderProductMapping = {
  productId: string;
  pages: number;
  providers: {
    prodigi: string | null;
    gelato: string | null;
    fujifilm: string | null;
  };
};

/**
 * Product → provider SKU / productUid mapping.
 *
 * INTENTIONALLY EMPTY until real SKUs are confirmed via:
 *   - Prodigi Sandbox: GET /v4.0/products (destinationCountryCode=JP)
 *   - Gelato Product Catalog API: POST /v3/catalogs/{uid}/products:search
 *
 * See docs/task047-product-mapping-research.md
 * Do NOT add guessed or unverified SKUs.
 */
export const PRODUCT_MAPPING: ProviderProductMapping[] = [];

/**
 * Returns the provider-specific SKU / productUid for a given product + page count.
 * Returns null when no confirmed mapping exists.
 */
export function getProviderProductId(
  productId: string,
  pages: number,
  provider: Exclude<PrintProviderName, "mock">,
): string | null {
  const entry = PRODUCT_MAPPING.find(
    (m) => m.productId === productId && m.pages === pages,
  );
  if (!entry) return null;
  return entry.providers[provider] ?? null;
}
