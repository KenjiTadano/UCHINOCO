import "server-only";

export type PrintCommerceMode = "disabled" | "test" | "live";

export type PrintReleaseGate =
  | "PROVIDER_UNCONFIRMED"
  | "PRODUCT_MAPPING_UNCONFIRMED"
  | "BINDING_UNCONFIRMED"
  | "COLOR_REQUIREMENTS_UNCONFIRMED"
  | "PDF_STANDARD_UNCONFIRMED"
  | "PRODUCTION_PRICE_UNCONFIRMED";

export const PRINT_RELEASE_GATES: readonly PrintReleaseGate[] = [
  "PROVIDER_UNCONFIRMED",
  "PRODUCT_MAPPING_UNCONFIRMED",
  "BINDING_UNCONFIRMED",
  "COLOR_REQUIREMENTS_UNCONFIRMED",
  "PDF_STANDARD_UNCONFIRMED",
  "PRODUCTION_PRICE_UNCONFIRMED",
];

export function getPrintCommerceMode(value = process.env.PRINT_COMMERCE_MODE): PrintCommerceMode {
  const normalized = value?.trim().toLowerCase() || "disabled";
  if (normalized === "disabled" || normalized === "test" || normalized === "live") {
    return normalized;
  }
  throw new Error("Invalid PRINT_COMMERCE_MODE");
}

/**
 * No production provider/spec/price has been confirmed yet. Even when an
 * environment is accidentally set to LIVE, external submission remains shut.
 */
export function assertLivePrintReleaseReady(mode: PrintCommerceMode): void {
  if (mode !== "live") {
    throw new Error("PRINT_COMMERCE_NOT_LIVE");
  }
  if (PRINT_RELEASE_GATES.length > 0) {
    throw new Error(`PRINT_RELEASE_BLOCKED:${PRINT_RELEASE_GATES.join(",")}`);
  }
}

export function canUseExternalPrintProvider(mode: PrintCommerceMode): boolean {
  return mode === "live" && PRINT_RELEASE_GATES.length === 0;
}

/** Test checkout is allowed only with a Stripe test key. Live checkout remains
 * closed until every production release gate is resolved. */
export function canCreatePrintCheckout(
  mode: PrintCommerceMode,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
): boolean {
  if (mode === "test") return stripeSecretKey?.startsWith("sk_test_") === true;
  return mode === "live" && PRINT_RELEASE_GATES.length === 0;
}
