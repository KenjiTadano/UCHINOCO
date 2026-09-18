"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStripeKey, createStripeClient } from "@/lib/stripe/server";
import { PHOTOBOOK_PRODUCTS, calcPrice, getPageOptions } from "@/lib/photobook-products";
import { getDefaultShipping } from "@/lib/photobook-shipping";
import { validateAddress, hasAddressErrors } from "@/lib/checkout-validation";
import {
  buildOrderSnapshot,
  buildStripeLineItems,
  buildStripeSessionMetadata,
  buildStripePaymentIntentMetadata,
  buildSuccessUrl,
  buildCancelUrl,
  isPendingStale,
} from "@/lib/checkout-session-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutActionState = { error: string } | null;

/**
 * Creates a pending order and a Stripe Checkout Session, then redirects to Stripe.
 *
 * Security checklist (all verified against user session — service role is NOT used for auth):
 *   1. STRIPE_SECRET_KEY present (fail-fast before DB writes)
 *   2. auth.getUser()
 *   3. Album ownership + pet_id match + status === 'draft'
 *   4. Pet ownership
 *   5. Product in PHOTOBOOK_PRODUCTS
 *   6. Pages in getPageOptions(product)
 *   7. Address validated server-side (client validation is not trusted)
 *   8. Photo count <= pages (server re-fetches)
 *   9. Price recalculated server-side
 *  10. Pending order idempotency
 *  11. Order INSERT via service-role admin client only
 *  12. Stripe Session created — metadata contains NO PII
 *  13. Session ID saved to order, then redirect to Stripe
 */
export async function createCheckoutSession(
  petId: string,
  albumId: string,
  productId: string,
  pages: number,
  formData: FormData,
): Promise<CheckoutActionState> {
  // ── 1. Fail-fast: Stripe key ───────────────────────────────────────────────
  if (!hasStripeKey()) {
    return { error: "決済サービスが設定されていません。管理者にお問い合わせください。" };
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const userClient = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return { error: "ログインが必要です。" };

  // Basic route param sanity
  if (!UUID_RE.test(petId) || !UUID_RE.test(albumId)) {
    return { error: "無効なリクエストです。" };
  }

  // ── 3. Album ownership + status ───────────────────────────────────────────
  const { data: album } = await userClient
    .from("albums")
    .select("id, owner_user_id, pet_id, status")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!album) return { error: "アルバムが見つかりません。" };
  if (album.owner_user_id !== user.id) return { error: "権限がありません。" };
  if (album.pet_id !== petId) return { error: "無効なリクエストです。" };
  if (album.status !== "draft") {
    return { error: "このアルバムは注文を開始できない状態です。" };
  }

  // ── 4. Pet ownership ──────────────────────────────────────────────────────
  const { data: pet } = await userClient
    .from("pets")
    .select("id, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!pet) return { error: "ペット情報が見つかりません。" };

  // ── 5. Product validation ─────────────────────────────────────────────────
  const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === productId);
  if (!product) return { error: "選択した商品が見つかりません。" };

  // ── 6. Pages validation ───────────────────────────────────────────────────
  const pageOptions = getPageOptions(product);
  if (!Number.isInteger(pages) || !pageOptions.includes(pages)) {
    return { error: "ページ数が正しくありません。" };
  }

  // ── 7. Address validation (server-side, never trust client) ───────────────
  const addr = {
    lastName: String(formData.get("lastName") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    prefecture: String(formData.get("prefecture") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    address1: String(formData.get("address1") ?? "").trim(),
    address2: String(formData.get("address2") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  };

  const addrErrors = validateAddress(addr);
  if (hasAddressErrors(addrErrors)) {
    return { error: "配送先の入力内容を確認してください。" };
  }

  // ── 8. Photo count capacity check ────────────────────────────────────────
  const { count: photoCount } = await userClient
    .from("album_photos")
    .select("photo_id", { count: "exact", head: true })
    .eq("album_id", albumId);

  if ((photoCount ?? 0) > pages) {
    return {
      error: `写真枚数（${photoCount}枚）がページ数（${pages}ページ）を超えています。写真を減らすか、ページ数の多いプランをお選びください。`,
    };
  }

  // ── 9. Server-side price calculation (client values ignored) ──────────────
  const shipping = getDefaultShipping();
  const subtotal = calcPrice(product, pages);

  // ── 10. Pending order idempotency ─────────────────────────────────────────
  const adminClient = createAdminClient();

  const { data: existingPending } = await adminClient
    .from("orders")
    .select("id, stripe_checkout_session_id, created_at, status")
    .eq("album_id", albumId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    if (existingPending.stripe_checkout_session_id) {
      // A. Try to reuse an existing Stripe session
      try {
        const stripe = createStripeClient();
        const session = await stripe.checkout.sessions.retrieve(
          existingPending.stripe_checkout_session_id,
        );
        if (session.status === "open" && session.url) {
          redirect(session.url);
        }
        // Session expired or complete → cancel the pending order and proceed
        await adminClient
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", existingPending.id);
      } catch {
        // Stripe retrieval failed → cancel stale pending order and proceed
        await adminClient
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", existingPending.id);
      }
    } else {
      // C. No Stripe session yet
      if (!isPendingStale(existingPending.created_at)) {
        // Created very recently — likely a concurrent request, do not double-create
        return { error: "注文処理が進行中です。しばらくしてから再度お試しください。" };
      }
      // Stale pending with no session → cancel and proceed
      await adminClient
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", existingPending.id);
    }
  }

  // ── 11. Create order (admin client — RLS bypassed intentionally) ──────────
  const snapshot = buildOrderSnapshot(user.id, albumId, petId, product, pages, subtotal, shipping, addr);

  const { data: order, error: insertErr } = await adminClient
    .from("orders")
    .insert(snapshot)
    .select("id")
    .single();

  if (insertErr || !order) {
    return { error: "注文の作成に失敗しました。しばらくしてから再度お試しください。" };
  }

  // ── 12. Create Stripe Checkout Session ────────────────────────────────────
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  let stripeSessionUrl: string;
  try {
    const stripe = createStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "ja",
      line_items: buildStripeLineItems(product, pages, subtotal, shipping),
      payment_intent_data: {
        metadata: buildStripePaymentIntentMetadata(order.id),
      },
      metadata: buildStripeSessionMetadata(order.id, albumId),
      success_url: buildSuccessUrl(siteUrl, petId, albumId, order.id),
      cancel_url: buildCancelUrl(siteUrl, petId, albumId, productId, pages),
    });

    if (!session.url) {
      throw new Error("Stripe session URL is null");
    }
    stripeSessionUrl = session.url;

    // ── 13. Save Stripe Session ID to order ──────────────────────────────
    await adminClient
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);
  } catch (e) {
    // Stripe Session creation failed → mark order as failed (preserve audit trail)
    await adminClient.from("orders").update({ status: "failed" }).eq("id", order.id);
    if (process.env.NODE_ENV !== "production") {
      console.error("[createCheckoutSession] Stripe error:", e);
    }
    return { error: "決済セッションの作成に失敗しました。しばらくしてから再度お試しください。" };
  }

  redirect(stripeSessionUrl);
}
