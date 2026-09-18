/**
 * Pure helpers for Stripe webhook processing.
 * No Supabase or Stripe imports — fully testable without external services.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Validates an order status transition.
 * Allowed:  pending → paid | failed | cancelled
 * Forbidden: paid → anything; cancelled → paid; failed → paid
 */
export function isAllowedStatusTransition(from: string, to: string): boolean {
  if (from === "paid") return false;
  if (from === "cancelled" && to === "paid") return false;
  if (from === "failed" && to === "paid") return false;
  const allowed: Record<string, string[]> = {
    pending: ["paid", "failed", "cancelled"],
  };
  return (allowed[from] ?? []).includes(to);
}

/**
 * Extracts a PaymentIntent string ID from a Stripe field that may be
 * a plain string ID, an expanded PaymentIntent object, or null/undefined.
 */
export function extractPaymentIntentId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value !== null && typeof value === "object") {
    const id = (value as Record<string, unknown>)["id"];
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

export function getOrderIdFromMetadata(
  metadata: Record<string, string> | null | undefined,
): string | null {
  const id = metadata?.["order_id"];
  return isUUID(id) ? id : null;
}

export function getAlbumIdFromMetadata(
  metadata: Record<string, string> | null | undefined,
): string | null {
  const id = metadata?.["album_id"];
  return isUUID(id) ? id : null;
}

/**
 * Maps an order status to a human-readable Japanese message.
 * Used by the order complete page and tests.
 */
export function getOrderStatusMessage(status: string): string {
  switch (status) {
    case "paid":
      return "ご注文ありがとうございます";
    case "pending":
      return "お支払いを確認しています";
    case "failed":
      return "お支払いを確認できませんでした";
    case "cancelled":
      return "この注文はキャンセルされました";
    default:
      return "注文状態を確認できません";
  }
}
