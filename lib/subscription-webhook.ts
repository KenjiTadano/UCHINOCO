import type Stripe from "stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

export type SubscriptionSyncPayload = {
  p_user_id: string;
  p_customer_id: string;
  p_subscription_id: string;
  p_status: string;
  p_current_period_end: string | null;
  p_cancel_at_period_end: boolean;
  p_event_id: string;
  p_event_created: number;
};

function objectId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

export function subscriptionSyncPayload(
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created">,
): SubscriptionSyncPayload | null {
  const userId = subscription.metadata.user_id;
  if (!UUID.test(userId ?? "") || !SUPPORTED_STATUSES.has(subscription.status)) return null;
  const periodEnd = subscription.items.data.reduce<number | null>((latest, item) => {
    if (!Number.isFinite(item.current_period_end)) return latest;
    return latest === null ? item.current_period_end : Math.max(latest, item.current_period_end);
  }, null);
  return {
    p_user_id: userId,
    p_customer_id: objectId(subscription.customer),
    p_subscription_id: subscription.id,
    p_status: subscription.status,
    p_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_event_id: event.id,
    p_event_created: event.created,
  };
}

export function subscriptionIdFromCheckout(session: Stripe.Checkout.Session): string | null {
  if (session.mode !== "subscription" || !session.subscription) return null;
  return objectId(session.subscription);
}
