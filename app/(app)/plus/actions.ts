"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { analyticsEventKey, recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import { createStripeClient, hasStripeKey } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { safeAppReturnPath } from "@/lib/app-return-path";

export type PlusCheckoutState = { error: string | null };

export async function startPlusCheckout(
  _state: PlusCheckoutState,
  formData: FormData,
): Promise<PlusCheckoutState> {
  const next = safeAppReturnPath(String(formData.get("next") ?? "")) ?? "/settings/billing";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plus?next=${next}`)}`);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const priceId = process.env.STRIPE_PLUS_PRICE_ID;
  if (!hasStripeKey() || !siteUrl || !priceId) {
    return { error: "PLUSのお申し込みは現在準備中です。" };
  }

  const entitlements = await loadUserEntitlements(supabase as unknown as SupabaseClient, user.id);
  if (entitlements.plan === "PLUS") redirect(next);

  const { data: subscription } = await (supabase as unknown as SupabaseClient)
    .from("user_subscriptions")
    .select("stripe_customer_id,stripe_subscription_id,status")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = (subscription as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  const subscriptionStatus = (subscription as { status?: string | null } | null)?.status;
  const subscriptionId = (subscription as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id;
  if (customerId && subscriptionId && ["past_due", "unpaid", "incomplete", "paused"].includes(subscriptionStatus ?? "")) {
    return { error: "現在のお支払い・契約情報をBilling画面でご確認ください。" };
  }

  let checkoutUrl: string | null = null;
  let checkoutSessionId: string | null = null;
  try {
    const stripe = createStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      locale: "ja",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      metadata: { purpose: "plus_subscription", user_id: user.id },
      subscription_data: {
        metadata: { purpose: "plus_subscription", user_id: user.id },
      },
      success_url: `${siteUrl}/plus?checkout=complete&next=${encodeURIComponent(next)}`,
      cancel_url: `${siteUrl}/plus?checkout=cancelled&next=${encodeURIComponent(next)}`,
    });
    checkoutUrl = session.url;
    checkoutSessionId = session.id;
  } catch (error) {
    console.error("PLUS checkout creation failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { error: "PLUSのお申し込みを開始できませんでした。時間をおいてお試しください。" };
  }
  if (!checkoutUrl) return { error: "PLUSのお申し込みを開始できませんでした。" };
  if (checkoutSessionId) {
    await recordProductAnalyticsEvent({
      supabase: supabase as unknown as SupabaseClient,
      userId: user.id,
      eventType: "upgrade_started",
      eventKey: await analyticsEventKey(`upgrade-start:${checkoutSessionId}`),
    });
  }
  redirect(checkoutUrl);
}
