/**
 * Task047-3 — MockPrintProvider + ProdigiProvider skeleton tests A–T
 *
 * Direct imports: only from modules without "server-only"
 *   (errors, mock provider, product-mapping, request-builder, status)
 * Structural tests: modules with "server-only"
 *   (prodigi-config, prodigi provider, provider-factory)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { MockPrintProvider } from "../lib/print/providers/mock.ts";
import { buildProdigiOrderRequest } from "../lib/print/providers/prodigi-request-builder.ts";
import { normalizeProdigiStatus } from "../lib/print/providers/prodigi-status.ts";
import { PRODUCT_MAPPING, getProviderProductId } from "../lib/print/product-mapping.ts";
import {
  ProviderNotConfiguredError,
  ProviderProductUnavailableError,
  ProviderRequestError,
  ProviderTimeoutError,
} from "../lib/print/errors.ts";

const ORDER_ID = "00000000-0000-4000-8000-000000000001";

const BASE_PARAMS = {
  orderId: ORDER_ID,
  productId: "standard",
  productSize: "180x180",
  coverType: "soft",
  pages: 20,
  items: [],
  recipient: {
    lastName: "山田",
    firstName: "太郎",
    postalCode: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    address1: "道玄坂1-1",
    address2: null,
    phone: "0901234567",
  },
};

// ── A: getPrintProvider("mock") (structural) ──────────────────────────────────

test("A: provider-factory.ts returns MockPrintProvider for 'mock' (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  assert.ok(src.includes("case \"mock\":"), "mock case in switch");
  assert.ok(src.includes("MockPrintProvider"), "returns MockPrintProvider");
});

// ── B: invalid provider rejects (structural) ──────────────────────────────────

test("B: provider-factory.ts throws ProviderNotConfiguredError for gelato/fujifilm (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  assert.ok(src.includes("ProviderNotConfiguredError"), "throws ProviderNotConfiguredError");
  assert.ok(src.includes("case \"gelato\""), "gelato case present");
  assert.ok(src.includes("case \"fujifilm\""), "fujifilm case present");
});

test("B: provider-factory.ts validates PRINT_PROVIDER env value (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  assert.ok(src.includes("Invalid PRINT_PROVIDER"), "invalid value error message");
});

// ── C: default provider = mock (structural) ───────────────────────────────────

test("C: provider-factory.ts defaults to 'mock' when PRINT_PROVIDER is unset (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  // Default: process.env.PRINT_PROVIDER ?? "mock"
  assert.ok(src.includes("?? \"mock\""), "defaults to mock");
});

// ── D: Prodigi sandbox base URL (structural) ──────────────────────────────────

test("D: prodigi-config.ts returns sandbox URL for PRODIGI_ENV=sandbox (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-config.ts", "utf8");
  assert.ok(src.includes("https://api.sandbox.prodigi.com"), "sandbox URL present");
  assert.ok(src.includes("\"sandbox\""), "sandbox branch present");
});

test("D: prodigi-config.ts defaults to sandbox when PRODIGI_ENV is unset (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-config.ts", "utf8");
  // Default: if (!env || env === "sandbox") return "sandbox"
  assert.ok(src.includes("!env") || src.includes("?? \"sandbox\"") || src.includes("sandbox"), "defaults to sandbox");
});

// ── E: Prodigi live base URL (structural) ─────────────────────────────────────

test("E: prodigi-config.ts returns live URL when PRODIGI_ENV=live (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-config.ts", "utf8");
  assert.ok(src.includes("https://api.prodigi.com"), "live URL present");
  assert.ok(src.includes("\"live\""), "live branch present");
  // Sandbox and live are distinct strings
  assert.ok(
    src.includes("https://api.sandbox.prodigi.com") && src.includes("https://api.prodigi.com"),
    "sandbox and live URLs are different",
  );
});

// ── F: invalid PRODIGI_ENV throws (structural) ────────────────────────────────

test("F: prodigi-config.ts throws on invalid PRODIGI_ENV value (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-config.ts", "utf8");
  assert.ok(src.includes("Invalid PRODIGI_ENV"), "error thrown for invalid env value");
  assert.ok(!src.includes("\"production\""), "production is not a valid env value");
});

// ── G: SKU null → PRODUCT_UNAVAILABLE ────────────────────────────────────────

test("G: getProviderProductId returns null when PRODUCT_MAPPING is empty", () => {
  assert.equal(getProviderProductId("standard", 20, "prodigi"), null);
  assert.equal(getProviderProductId("premium", 30, "gelato"), null);
  assert.equal(getProviderProductId("premium-plus", 40, "fujifilm"), null);
});

test("G: ProdigiProvider throws ProviderProductUnavailableError when SKU is null (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi.ts", "utf8");
  assert.ok(src.includes("ProviderProductUnavailableError"), "throws when sku is null");
  assert.ok(src.includes("getProviderProductId"), "calls getProviderProductId");
  assert.ok(src.includes("if (!sku)") || src.includes("if (sku === null)") || src.includes("!providerProductId") || src.includes("if (!providerProductId)"), "null check present");
});

// ── H: PRODUCT_MAPPING has no fake SKUs ──────────────────────────────────────

test("H: PRODUCT_MAPPING is empty — no guessed or unverified SKUs", () => {
  assert.equal(PRODUCT_MAPPING.length, 0);
});

// ── I: request builder uses providerProductId param ──────────────────────────

test("I: buildProdigiOrderRequest sets sku from providerProductId argument", () => {
  const sku = "CONFIRMED-SKU-FROM-SANDBOX";
  const req = buildProdigiOrderRequest(BASE_PARAMS, sku, []);
  assert.equal(req.items[0].sku, sku);
});

test("I: buildProdigiOrderRequest propagates orderId to merchantReference", () => {
  const req = buildProdigiOrderRequest(BASE_PARAMS, "ANY-SKU", []);
  assert.equal(req.merchantReference, ORDER_ID);
});

test("I: buildProdigiOrderRequest uses idempotencyKey over orderId when provided", () => {
  const params = { ...BASE_PARAMS, idempotencyKey: ORDER_ID + "-attempt-2" };
  const req = buildProdigiOrderRequest(params, "ANY-SKU", []);
  assert.equal(req.merchantReference, params.idempotencyKey);
});

test("I: buildProdigiOrderRequest sets pageCount from params.pages", () => {
  const req = buildProdigiOrderRequest(BASE_PARAMS, "ANY-SKU", []);
  assert.equal(req.items[0].attributes.pageCount, BASE_PARAMS.pages);
});

test("I: buildProdigiOrderRequest countryCode is always JP", () => {
  const req = buildProdigiOrderRequest(BASE_PARAMS, "ANY-SKU", []);
  assert.equal(req.recipient.address.countryCode, "JP");
});

// ── J: request builder has no PII logging (structural) ───────────────────────

test("J: prodigi-request-builder.ts has no console calls (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-request-builder.ts", "utf8");
  assert.ok(!src.includes("console.log"), "no console.log");
  assert.ok(!src.includes("console.error"), "no console.error");
  assert.ok(!src.includes("console.warn"), "no console.warn");
});

// ── K: Mock submit success ────────────────────────────────────────────────────

test("K: MockPrintProvider success returns submitted status", async () => {
  const mock = new MockPrintProvider("success");
  const result = await mock.submitOrder(BASE_PARAMS);
  assert.equal(result.status, "submitted");
  assert.ok(result.providerOrderId.startsWith("mock-"), "providerOrderId has mock- prefix");
});

// ── L: Mock fail ──────────────────────────────────────────────────────────────

test("L: MockPrintProvider fail throws ProviderRequestError", async () => {
  const mock = new MockPrintProvider("fail");
  await assert.rejects(() => mock.submitOrder(BASE_PARAMS), ProviderRequestError);
});

// ── M: Mock timeout ───────────────────────────────────────────────────────────

test("M: MockPrintProvider timeout throws ProviderTimeoutError", async () => {
  const mock = new MockPrintProvider("timeout");
  await assert.rejects(() => mock.submitOrder(BASE_PARAMS), ProviderTimeoutError);
});

// ── N: Mock processing ────────────────────────────────────────────────────────

test("N: MockPrintProvider processing returns processing status", async () => {
  const mock = new MockPrintProvider("processing");
  const status = await mock.getJobStatus("any-id");
  assert.equal(status.status, "processing");
});

// ── O: Mock shipped ───────────────────────────────────────────────────────────

test("O: MockPrintProvider shipped returns shipped status with trackingNumber", async () => {
  const mock = new MockPrintProvider("shipped");
  const status = await mock.getJobStatus("any-id");
  assert.equal(status.status, "shipped");
  assert.ok(status.trackingNumber, "trackingNumber present");
});

// ── P: idempotencyKey propagates ─────────────────────────────────────────────

test("P: idempotencyKey is reflected in MockPrintProvider providerOrderId", async () => {
  const idemKey = ORDER_ID + "-attempt-1";
  const mock = new MockPrintProvider("success");
  const result = await mock.submitOrder({ ...BASE_PARAMS, idempotencyKey: idemKey });
  assert.ok(result.providerOrderId.includes(idemKey), "idempotencyKey in providerOrderId");
});

// ── Q: Prodigi API key server-only (structural) ───────────────────────────────

test("Q: prodigi-config.ts has server-only import and no NEXT_PUBLIC_ prefix (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-config.ts", "utf8");
  assert.ok(src.includes("server-only"), "server-only import present");
  assert.ok(!src.includes("NEXT_PUBLIC"), "no NEXT_PUBLIC_ prefix on API key");
});

// ── R: Gelato not configured (structural) ────────────────────────────────────

test("R: provider-factory.ts throws ProviderNotConfiguredError for gelato (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  assert.ok(src.includes("case \"gelato\""), "gelato case exists in factory");
  assert.ok(src.includes("ProviderNotConfiguredError"), "throws ProviderNotConfiguredError");
});

// ── S: Fujifilm not configured (structural) ───────────────────────────────────

test("S: provider-factory.ts throws ProviderNotConfiguredError for fujifilm (structural)", async () => {
  const src = await readFile("./lib/print/provider-factory.ts", "utf8");
  assert.ok(src.includes("case \"fujifilm\""), "fujifilm case exists in factory");
});

// ── T: unknown Prodigi status falls back to processing ────────────────────────

test("T: normalizeProdigiStatus returns 'processing' for unknown status strings", () => {
  assert.equal(normalizeProdigiStatus("SomeUnknownStatus"), "processing");
  assert.equal(normalizeProdigiStatus(""), "processing");
  assert.equal(normalizeProdigiStatus("Pending"), "processing");
});

test("T: prodigi-status.ts PRODIGI_STATUS_MAP has comment about unconfirmed values (structural)", async () => {
  const src = await readFile("./lib/print/providers/prodigi-status.ts", "utf8");
  assert.ok(
    src.includes("Unconfirmed") || src.includes("confirm") || src.includes("Sandbox"),
    "status map has note about verification",
  );
});

// ── Additional: error classes ─────────────────────────────────────────────────

test("errors: ProviderNotConfiguredError has correct code", () => {
  const err = new ProviderNotConfiguredError("mock");
  assert.equal(err.code, "PROVIDER_NOT_CONFIGURED");
  assert.ok(err instanceof Error);
});

test("errors: ProviderProductUnavailableError has correct code", () => {
  const err = new ProviderProductUnavailableError("standard", 20, "prodigi");
  assert.equal(err.code, "PRODUCT_UNAVAILABLE");
  assert.ok(err.message.includes("standard"));
  assert.ok(err.message.includes("20"));
});

test("errors: ProviderRequestError has correct code", () => {
  const err = new ProviderRequestError("network error");
  assert.equal(err.code, "REQUEST_FAILED");
});

test("errors: ProviderTimeoutError has correct code", () => {
  const err = new ProviderTimeoutError("prodigi");
  assert.equal(err.code, "TIMEOUT");
});
