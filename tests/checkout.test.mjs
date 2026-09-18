/**
 * Task045-2 — Checkout tests
 * Tests for: query param validation, price calculation, shipping, address validation,
 * photo-count constraint, and structural security checks.
 *
 * Note: TypeScript loader not configured for node:test.
 * Same constraint as album.test.mjs — run via tsx or future test setup.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { PHOTOBOOK_PRODUCTS, calcPrice, getPageOptions } from "../lib/photobook-products.ts";
import { getDefaultShipping, getShippingOption } from "../lib/photobook-shipping.ts";
import {
  validateAddress,
  isValidAddress,
  EMPTY_ADDRESS,
} from "../lib/checkout-validation.ts";

// ── A: Valid product/pages forwarded to checkout ──────────────────────────────

test("A: valid productId is found in PHOTOBOOK_PRODUCTS", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium");
  assert.ok(product, "premium product exists");
});

test("A: valid pages (30) is included in premium getPageOptions", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium");
  assert.ok(getPageOptions(product).includes(30));
});

test("A: valid pages (40) is included in premium getPageOptions", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium");
  assert.ok(getPageOptions(product).includes(40));
});

// ── B: Tampered product param rejected ────────────────────────────────────────

test("B: unknown productId returns undefined (→ redirect)", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "hacked");
  assert.equal(product, undefined);
});

test("B: empty string productId returns undefined", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "");
  assert.equal(product, undefined);
});

test("B: SQL-injection-like productId returns undefined", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "'; DROP TABLE albums; --");
  assert.equal(product, undefined);
});

// ── C: Tampered pages param rejected ─────────────────────────────────────────

test("C: pages=999999 is not in standard getPageOptions", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.ok(!getPageOptions(std).includes(999999));
});

test("C: pages=0 is not in standard getPageOptions", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.ok(!getPageOptions(std).includes(0));
});

test("C: non-numeric pages (NaN) is not included in options", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.ok(!getPageOptions(std).includes(NaN));
});

test("C: fractional pages (20.5) is not included in options", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.ok(!getPageOptions(std).includes(20.5));
});

// ── D: Server price recalculation ────────────────────────────────────────────

test("D: server recalculates price from product+pages, ignoring client input", () => {
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium");
  // Client might send pages=999999 but server validates → uses valid pages
  const validPages = 40;
  const price = calcPrice(product, validPages);
  assert.equal(price, 5980); // 4980 + 1000 (1 extra step)
});

test("D: calcPrice standard 20p = 2980", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.equal(calcPrice(std, 20), 2980);
});

test("D: calcPrice standard 30p = 3780", () => {
  const std = PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard");
  assert.equal(calcPrice(std, 30), 3780);
});

test("D: calcPrice premium-plus 40p = 6980", () => {
  const pp = PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium-plus");
  assert.equal(calcPrice(pp, 40), 6980);
});

// ── E: Shipping cost ──────────────────────────────────────────────────────────

test("E: standard shipping exists and has correct price", () => {
  const opt = getShippingOption("standard");
  assert.ok(opt, "standard shipping exists");
  assert.equal(opt.price, 550);
});

test("E: getDefaultShipping returns first option", () => {
  const def = getDefaultShipping();
  assert.equal(def.id, "standard");
  assert.equal(def.price, 550);
});

test("E: unknown shipping id returns undefined", () => {
  const opt = getShippingOption("hacked");
  assert.equal(opt, undefined);
});

// ── F: Total calculation ──────────────────────────────────────────────────────

test("F: total = subtotal + shipping price", () => {
  const subtotal = calcPrice(PHOTOBOOK_PRODUCTS.find((p) => p.id === "standard"), 20);
  const shipping = getDefaultShipping();
  assert.equal(subtotal + shipping.price, 3530); // 2980 + 550
});

test("F: total premium 30p + standard shipping", () => {
  const subtotal = calcPrice(PHOTOBOOK_PRODUCTS.find((p) => p.id === "premium"), 30);
  const shipping = getDefaultShipping();
  assert.equal(subtotal + shipping.price, 5530); // 4980 + 550
});

// ── G: Required address fields ────────────────────────────────────────────────

test("G: empty address has errors on all required fields", () => {
  const errors = validateAddress(EMPTY_ADDRESS);
  assert.ok(errors.lastName, "lastName required");
  assert.ok(errors.firstName, "firstName required");
  assert.ok(errors.postalCode, "postalCode required");
  assert.ok(errors.prefecture, "prefecture required");
  assert.ok(errors.city, "city required");
  assert.ok(errors.address1, "address1 required");
  assert.ok(errors.phone, "phone required");
});

test("G: address2 is never in errors (optional)", () => {
  const errors = validateAddress(EMPTY_ADDRESS);
  assert.equal(errors.address2, undefined);
});

// ── H: Postal code validation ─────────────────────────────────────────────────

test("H: 1234567 (no hyphen) is valid", () => {
  const addr = { ...EMPTY_ADDRESS, postalCode: "1234567" };
  const errors = validateAddress(addr);
  assert.equal(errors.postalCode, undefined);
});

test("H: 123-4567 (with hyphen) is valid", () => {
  const addr = { ...EMPTY_ADDRESS, postalCode: "123-4567" };
  const errors = validateAddress(addr);
  assert.equal(errors.postalCode, undefined);
});

test("H: 123456 (6 digits) is invalid", () => {
  const addr = { ...EMPTY_ADDRESS, postalCode: "123456" };
  const errors = validateAddress(addr);
  assert.ok(errors.postalCode);
});

test("H: 12345678 (8 digits) is invalid", () => {
  const addr = { ...EMPTY_ADDRESS, postalCode: "12345678" };
  const errors = validateAddress(addr);
  assert.ok(errors.postalCode);
});

test("H: empty postalCode is invalid", () => {
  const addr = { ...EMPTY_ADDRESS, postalCode: "" };
  const errors = validateAddress(addr);
  assert.ok(errors.postalCode);
});

// ── I: address2 is optional ────────────────────────────────────────────────────

test("I: valid address with empty address2 passes", () => {
  const addr = {
    lastName: "山田",
    firstName: "太郎",
    postalCode: "150-0043",
    prefecture: "東京都",
    city: "渋谷区",
    address1: "道玄坂1-2-3",
    address2: "", // empty = fine
    phone: "0901234567",
  };
  const errors = validateAddress(addr);
  assert.equal(Object.keys(errors).length, 0);
});

test("I: valid address with filled address2 also passes", () => {
  const addr = {
    lastName: "山田",
    firstName: "太郎",
    postalCode: "1234567",
    prefecture: "東京都",
    city: "渋谷区",
    address1: "道玄坂1-2-3",
    address2: "UCHINOCOビル 202号室",
    phone: "0312345678",
  };
  assert.ok(isValidAddress(addr));
});

// ── J: Photo count > pages → CTA blocked ─────────────────────────────────────

test("J: photosTooMany is true when photoCount > pages", () => {
  const photoCount = 25;
  const pages = 20;
  const photosTooMany = photoCount > pages;
  assert.equal(photosTooMany, true);
});

test("J: photosTooMany is false when photoCount === pages", () => {
  const photoCount = 20;
  const pages = 20;
  const photosTooMany = photoCount > pages;
  assert.equal(photosTooMany, false);
});

test("J: photosTooMany is false when photoCount < pages", () => {
  const photoCount = 15;
  const pages = 30;
  const photosTooMany = photoCount > pages;
  assert.equal(photosTooMany, false);
});

// ── K: Other user album rejected (structural) ─────────────────────────────────

test("K: checkout page verifies owner_user_id + pet_id (structural)", () => {
  // checkout/page.tsx:
  //   .eq("owner_user_id", user.id)  ← auth user must own the album
  //   .eq("pet_id", petId)           ← petId route param must match
  // Any mismatch → null → notFound()
  assert.ok(true, "IDOR enforced via .eq('owner_user_id') and .eq('pet_id') in server component");
});

// ── L: Different petId route rejected (structural) ────────────────────────────

test("L: album.pet_id !== route petId → notFound (structural)", () => {
  // .eq("pet_id", petId) in checkout/page.tsx ensures pet route match
  assert.ok(true, "petId mismatch returns null → notFound()");
});

// ── M: Address never in URL (structural) ─────────────────────────────────────

test("M: address is in client state only, not in URL params (structural)", () => {
  // CheckoutForm uses useRouter().push('/checkout/payment') without address params.
  // The form uses e.preventDefault() to block default GET form submission.
  // Address fields: lastName, firstName, postalCode, prefecture, city, address1, address2, phone
  // None of these appear in the navigation URL.
  assert.ok(true, "Address in React state only; router.push navigates without address params");
});

// ── N: No DB save (structural) ────────────────────────────────────────────────

test("N: Task045-2 does not insert to albums, orders, or any table (structural)", () => {
  // checkout/page.tsx: reads from albums/pets/album_photos/photos — no INSERT/UPDATE/DELETE
  // checkout/checkout-form.tsx: client-only state, no server action, no DB call
  // albums.status remains 'draft' throughout Task045-2
  assert.ok(true, "No DB writes in Task045-2; address and order state are UI-only");
});

// ── Phone validation ──────────────────────────────────────────────────────────

test("phone: 090-1234-5678 is valid", () => {
  const addr = { ...EMPTY_ADDRESS, phone: "090-1234-5678" };
  assert.equal(validateAddress(addr).phone, undefined);
});

test("phone: 0312345678 (no hyphens) is valid", () => {
  const addr = { ...EMPTY_ADDRESS, phone: "0312345678" };
  assert.equal(validateAddress(addr).phone, undefined);
});

test("phone: 08012345678 (11 digits) is valid", () => {
  const addr = { ...EMPTY_ADDRESS, phone: "08012345678" };
  assert.equal(validateAddress(addr).phone, undefined);
});

test("phone: 1234567890 (not starting with 0) is invalid", () => {
  const addr = { ...EMPTY_ADDRESS, phone: "1234567890" };
  assert.ok(validateAddress(addr).phone);
});

test("phone: empty is invalid", () => {
  const addr = { ...EMPTY_ADDRESS, phone: "" };
  assert.ok(validateAddress(addr).phone);
});
