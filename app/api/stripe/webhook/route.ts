import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { getOrderIdFromMetadata, getAlbumIdFromMetadata, extractPaymentIntentId, isUUID } from "@/lib/webhook-helpers";
import { subscriptionIdFromCheckout, subscriptionSyncPayload } from "@/lib/subscription-webhook";
import { analyticsEventKey, recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // ── 1. Read raw body (must be before any parsing) ──────────────────────────
  const body = await request.text();

  // ── 2. Require Stripe-Signature header ────────────────────────────────────
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  // ── 3. Require STRIPE_WEBHOOK_SECRET ─────────────────────────────────────
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // ── 4. Verify signature — admin client created only after this succeeds ───
  let event: Stripe.Event;
  try {
    const stripe = createStripeClient();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "signature verification failed";
    console.error("[webhook] constructEvent failed:", msg);
    return new Response("Invalid signature", { status: 400 });
  }

  // ── 5. Process event ──────────────────────────────────────────────────────
  const adminClient = createAdminClient();

  async function syncSubscription(subscription: Stripe.Subscription) {
    const payload = subscriptionSyncPayload(subscription, event);
    if (!payload) {
      console.error(`[webhook] ${event.id} ${event.type}: invalid subscription metadata`);
      return false;
    }
    const { data: previous } = await adminClient
      .from("user_subscriptions")
      .select("plan")
      .eq("user_id", payload.p_user_id)
      .maybeSingle();
    // The RPC is introduced by the pending Task071 migration; generated types are
    // refreshed only after that migration is applied remotely.
    const { error } = await (adminClient as unknown as SupabaseClient).rpc(
      "sync_user_subscription_from_stripe",
      payload,
    );
    if (error) {
      console.error(`[webhook] ${event.id} subscription sync failed: ${error.message}`);
      return false;
    }
    const { data: current } = await adminClient
      .from("user_subscriptions")
      .select("plan, last_stripe_event_id")
      .eq("user_id", payload.p_user_id)
      .maybeSingle();
    // A stale Stripe delivery is ignored by the sync RPC and must not emit KPI events.
    if (!current || current.last_stripe_event_id !== event.id) return true;
    const eventType = previous?.plan !== "PLUS" && current.plan === "PLUS"
      ? "subscription_activated"
      : previous?.plan === "PLUS" && subscription.status === "canceled" ? "subscription_canceled" : null;
    if (eventType) {
      await recordProductAnalyticsEvent({
        supabase: adminClient as unknown as SupabaseClient,
        userId: payload.p_user_id,
        eventType,
        eventKey: await analyticsEventKey(`stripe:${event.id}:${eventType}`),
        source: "webhook",
      });
    }
    return true;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const subscriptionId = subscriptionIdFromCheckout(session);
        if (subscriptionId) {
          const stripe = createStripeClient();
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (!(await syncSubscription(subscription))) {
            return new Response("DB error", { status: 500 });
          }
          break;
        }

        // Only process sessions where payment was actually collected.
        if (session.payment_status !== "paid") {
          console.log(`[webhook] ${event.id} ${event.type}: payment_status=${session.payment_status}, skipping`);
          return new Response("ok", { status: 200 });
        }

        const orderId = getOrderIdFromMetadata(session.metadata as Record<string, string> | null);
        const albumId = getAlbumIdFromMetadata(session.metadata as Record<string, string> | null);

        if (!orderId) {
          console.error(`[webhook] ${event.id} ${event.type}: missing or invalid order_id in metadata`);
          return new Response("ok", { status: 200 });
        }
        if (!albumId) {
          console.error(`[webhook] ${event.id} ${event.type}: missing or invalid album_id in metadata, order_id=${orderId}`);
          return new Response("ok", { status: 200 });
        }

        // album_id binding: metadata.album_id must match the stored order.album_id.
        // Prevents processing events where session metadata was misrouted or tampered.
        const { data: orderCheck } = await adminClient.from("orders").select("album_id, owner_user_id, print_snapshot_id, print_fingerprint").eq("id", orderId).maybeSingle();

        if (!orderCheck) {
          console.log(`[webhook] ${event.id} ${event.type}: order not found in DB, order_id=${orderId}`);
          return new Response("ok", { status: 200 });
        }

        if (orderCheck.album_id !== albumId) {
          console.error(`[webhook] ${event.id} ${event.type}: album_id mismatch for order_id=${orderId}`);
          return new Response("ok", { status: 200 });
        }

        if (orderCheck.print_snapshot_id) {
          const { data: bound } = await adminClient.from("album_print_snapshots").select("album_id, fingerprint").eq("id", orderCheck.print_snapshot_id).maybeSingle();
          if (!bound || bound.album_id !== orderCheck.album_id || bound.fingerprint !== orderCheck.print_fingerprint) {
            console.error(`[webhook] ${event.id} ${event.type}: print snapshot binding mismatch for order_id=${orderId}`);
            return new Response("ok", { status: 200 });
          }
        }

        const paymentIntentId = extractPaymentIntentId(session.payment_intent);

        console.log(`[webhook] ${event.id} ${event.type}: order_id=${orderId}`);

        // Webhook reads the configured provider — client cannot influence this value.
        const printProvider = process.env.PRINT_PROVIDER ?? "mock";

        const { error } = await adminClient.rpc("mark_order_paid", {
          p_order_id: orderId,
          p_stripe_session_id: session.id,
          p_payment_intent_id: paymentIntentId,
          p_provider: printProvider,
        } as never);

        if (error) {
          console.error(`[webhook] ${event.id} mark_order_paid failed: ${error.message}`);
          return new Response("DB error", { status: 500 });
        }
        const paymentKey = await analyticsEventKey(`stripe:${event.id}:payment`);
        await recordProductAnalyticsEvent({ supabase: adminClient as unknown as SupabaseClient, userId: orderCheck.owner_user_id, eventType: "payment_success", eventKey: paymentKey, source: "webhook" });
        await recordProductAnalyticsEvent({ supabase: adminClient as unknown as SupabaseClient, userId: orderCheck.owner_user_id, eventType: "print_order_created", eventKey: paymentKey, source: "webhook" });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (!(await syncSubscription(subscription))) {
          return new Response("DB error", { status: 500 });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = getOrderIdFromMetadata(session.metadata as Record<string, string> | null);

        if (!isUUID(orderId)) {
          console.log(`[webhook] ${event.id} ${event.type}: no valid order_id, ignoring`);
          return new Response("ok", { status: 200 });
        }

        console.log(`[webhook] ${event.id} ${event.type}: order_id=${orderId}`);

        // Only cancel pending orders — paid orders are never downgraded.
        const { error } = await adminClient
          .from("orders")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId)
          .eq("status", "pending");

        if (error) {
          console.error(`[webhook] ${event.id} expired update failed: ${error.message}`);
          return new Response("DB error", { status: 500 });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = getOrderIdFromMetadata(pi.metadata as Record<string, string> | null);

        if (!isUUID(orderId)) {
          console.log(`[webhook] ${event.id} ${event.type}: no valid order_id, ignoring`);
          return new Response("ok", { status: 200 });
        }

        console.log(`[webhook] ${event.id} ${event.type}: order_id=${orderId}`);

        // Only update pending orders — paid orders must not be changed.
        const { error } = await adminClient
          .from("orders")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId)
          .eq("status", "pending");

        if (error) {
          console.error(`[webhook] ${event.id} payment_failed update failed: ${error.message}`);
          return new Response("DB error", { status: 500 });
        }
        break;
      }

      default:
        // Unhandled event types — acknowledge and ignore.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(`[webhook] ${event.id} handler error: ${msg}`);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
