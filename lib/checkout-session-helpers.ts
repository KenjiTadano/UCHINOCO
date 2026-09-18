/**
 * Pure helpers for building order snapshots and Stripe Checkout Session params.
 * No DB or Stripe imports — fully testable without external services.
 */

import type { PhotobookProduct } from "./photobook-products";
import type { ShippingOption } from "./photobook-shipping";
import type { ShippingAddress } from "./checkout-validation";

// ── Order snapshot ────────────────────────────────────────────────────────────

export type OrderSnapshot = {
  owner_user_id: string;
  album_id: string;
  pet_id: string;
  status: "pending";
  product_id: string;
  product_name: string;
  product_size: string;
  product_cover_type: string;
  product_cover_type_label: string;
  pages: number;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_option_id: string;
  shipping_option_name: string;
  shipping_last_name: string;
  shipping_first_name: string;
  shipping_postal_code: string;
  shipping_prefecture: string;
  shipping_city: string;
  shipping_address1: string;
  shipping_address2: string | null;
  shipping_phone: string;
};

export function buildOrderSnapshot(
  userId: string,
  albumId: string,
  petId: string,
  product: PhotobookProduct,
  pages: number,
  subtotal: number,
  shipping: ShippingOption,
  addr: ShippingAddress,
): OrderSnapshot {
  return {
    owner_user_id: userId,
    album_id: albumId,
    pet_id: petId,
    status: "pending",
    product_id: product.id,
    product_name: product.name,
    product_size: product.size,
    product_cover_type: product.coverType,
    product_cover_type_label: product.coverTypeLabel,
    pages,
    subtotal,
    shipping_fee: shipping.price,
    total: subtotal + shipping.price,
    shipping_option_id: shipping.id,
    shipping_option_name: shipping.name,
    shipping_last_name: addr.lastName,
    shipping_first_name: addr.firstName,
    shipping_postal_code: addr.postalCode,
    shipping_prefecture: addr.prefecture,
    shipping_city: addr.city,
    shipping_address1: addr.address1,
    shipping_address2: addr.address2 || null,
    shipping_phone: addr.phone,
  };
}

// ── Stripe line items ─────────────────────────────────────────────────────────

export type StripeLineItem = {
  price_data: {
    currency: string;
    product_data: { name: string };
    unit_amount: number;
  };
  quantity: 1;
};

export function buildStripeLineItems(
  product: PhotobookProduct,
  pages: number,
  subtotal: number,
  shipping: ShippingOption,
): StripeLineItem[] {
  return [
    {
      price_data: {
        currency: "jpy",
        product_data: { name: `${product.name} ${pages}ページ` },
        unit_amount: subtotal,
      },
      quantity: 1,
    },
    {
      price_data: {
        currency: "jpy",
        product_data: { name: shipping.name },
        unit_amount: shipping.price,
      },
      quantity: 1,
    },
  ];
}

// ── Stripe metadata ───────────────────────────────────────────────────────────
// PII (name/address/phone) must NOT be in Stripe metadata.

export type StripeSessionMetadata = {
  order_id: string;
  album_id: string;
};

export type StripePaymentIntentMetadata = {
  order_id: string;
};

export function buildStripeSessionMetadata(
  orderId: string,
  albumId: string,
): StripeSessionMetadata {
  return { order_id: orderId, album_id: albumId };
}

export function buildStripePaymentIntentMetadata(
  orderId: string,
): StripePaymentIntentMetadata {
  return { order_id: orderId };
}

// ── URLs ──────────────────────────────────────────────────────────────────────

export function buildSuccessUrl(
  siteUrl: string,
  petId: string,
  albumId: string,
  orderId: string,
): string {
  return `${siteUrl}/pets/${petId}/album/${albumId}/order/${orderId}?session_id={CHECKOUT_SESSION_ID}`;
}

export function buildCancelUrl(
  siteUrl: string,
  petId: string,
  albumId: string,
  productId: string,
  pages: number,
): string {
  // Address is deliberately excluded — PII must not appear in URLs.
  return `${siteUrl}/pets/${petId}/album/${albumId}/checkout?product=${encodeURIComponent(productId)}&pages=${pages}&cancelled=1`;
}

// ── Idempotency thresholds ─────────────────────────────────────────────────────

/** Pending orders with no Stripe session older than this are considered stale. */
export const PENDING_STALE_THRESHOLD_MS = 60_000;

export function isPendingStale(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > PENDING_STALE_THRESHOLD_MS;
}
