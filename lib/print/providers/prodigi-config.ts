import "server-only";

import { ProviderNotConfiguredError } from "../errors.ts";

export type ProdigiEnv = "sandbox" | "live";

/**
 * Returns the configured Prodigi environment.
 * Defaults to "sandbox" — Live must be explicitly set.
 * Throws on invalid values to prevent misconfiguration.
 */
export function getProdigiEnv(): ProdigiEnv {
  const raw = process.env.PRODIGI_ENV?.toLowerCase().trim();
  if (!raw || raw === "sandbox") return "sandbox";
  if (raw === "live") return "live";
  throw new Error(
    `Invalid PRODIGI_ENV: '${raw}'. Must be 'sandbox' or 'live'.`,
  );
}

/**
 * Returns the correct Prodigi base URL for the current environment.
 * Sandbox and Live endpoints are intentionally separate to prevent
 * Sandbox API keys from hitting the Live endpoint.
 */
export function getProdigiBaseUrl(): string {
  const env = getProdigiEnv();
  return env === "live"
    ? "https://api.prodigi.com"
    : "https://api.sandbox.prodigi.com";
}

/**
 * Returns the Prodigi API key from environment.
 * Throws ProviderNotConfiguredError if not set.
 * Never log the returned value.
 */
export function getProdigiApiKey(): string {
  const key = process.env.PRODIGI_API_KEY;
  if (!key) {
    throw new ProviderNotConfiguredError(
      "prodigi",
      "PRODIGI_API_KEY is not configured",
    );
  }
  return key;
}
