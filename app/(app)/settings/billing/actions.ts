"use server";

import { redirect } from "next/navigation";
import { createStripeClient } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

export type BillingPortalState = { error: string | null };

export async function startBillingPortal(
  _previousState: BillingPortalState,
  _formData: FormData,
): Promise<BillingPortalState> {
  void _previousState;
  void _formData;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fsettings%2Fbilling");

  const { data: subscription, error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = subscription?.stripe_customer_id;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (subscriptionError || !customerId || !siteUrl) {
    return { error: "お支払い・契約情報を確認できません。時間をおいて再度お試しください。" };
  }

  let portalUrl: string | null = null;
  try {
    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/settings/billing`,
    });
    portalUrl = session.url;
  } catch {
    return { error: "契約管理を開始できませんでした。時間をおいて再度お試しください。" };
  }

  if (!portalUrl) return { error: "契約管理を開始できませんでした。時間をおいて再度お試しください。" };
  redirect(portalUrl);
}