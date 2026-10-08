import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeAppReturnPath } from "../lib/app-return-path.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Task077 A/B: public Pricing shows the real monthly plan and account-aware upgrade actions", async () => {
  const pricing = await read("../app/pricing/page.tsx");
  const checkoutCta = await read("../app/(app)/plus/plus-checkout-button.tsx");
  assert.match(pricing, /月額 ¥680/);
  assert.match(pricing, /FREE/);
  assert.match(pricing, /PLUS/);
  assert.match(pricing, /<PlusUpgradeCta next="\/settings\/billing"/);
  assert.match(pricing, /\/signup\?next=%2Fplus/);
  assert.match(pricing, /\/login\?next=%2Fplus/);
  assert.match(checkoutCta, /PLUSにアップグレード/);
  assert.match(checkoutCta, /disabled=\{pending\}/);
});

test("Task077 B/G: auth return paths are local allowlisted routes, never external redirects", () => {
  assert.equal(safeAppReturnPath("/plus?next=%2Fsettings%2Fbilling"), "/plus?next=%2Fsettings%2Fbilling");
  assert.equal(safeAppReturnPath("/settings/billing"), "/settings/billing");
  assert.equal(safeAppReturnPath("/pets/123/album"), "/pets/123/album");
  assert.equal(safeAppReturnPath("https://evil.example"), null);
  assert.equal(safeAppReturnPath("//evil.example"), null);
  assert.equal(safeAppReturnPath("/\\evil.example"), null);
});

test("Task077 C/D/E/L: Billing is authenticated, server-plan based, and does not offer duplicate upgrade to PLUS", async () => {
  const [billing, appLayout, plusPage, home] = await Promise.all([
    read("../app/settings/billing/page.tsx"),
    read("../app/(app)/layout.tsx"),
    read("../app/(app)/plus/page.tsx"),
    read("../app/(app)/home/page.tsx"),
  ]);
  assert.match(appLayout, /redirect\("\/login"\)/);
  assert.match(billing, /auth\.getUser\(\)/);
  assert.match(billing, /redirect\("\/login\?next=%2Fsettings%2Fbilling"\)/);
  assert.match(billing, /loadUserEntitlements\(supabase, user\.id\)/);
  assert.match(billing, /stripe_customer_id/);
  assert.match(billing, /current_period_end/);
  assert.match(billing, /entitlements\.plan === "PLUS"/);
  assert.match(billing, /月額 ¥680/);
  assert.match(billing, /<PlusUpgradeCta next="\/settings\/billing"/);
  assert.match(plusPage, /entitlements\.plan === "PLUS"/);
  assert.match(home, /href="\/settings\/billing"[\s\S]*プラン・お支払い/);
});

test("Task077 F/G: Checkout uses the server Price ID and binds the authenticated user", async () => {
  const action = await read("../app/(app)/plus/actions.ts");
  const loginGuard = action.indexOf("if (!user) redirect");
  const priceId = action.indexOf("process.env.STRIPE_PLUS_PRICE_ID");
  const stripeCreate = action.indexOf("stripe.checkout.sessions.create");
  assert.ok(loginGuard >= 0 && priceId > loginGuard && stripeCreate > priceId);
  assert.match(action, /mode: "subscription"/);
  assert.match(action, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
  assert.match(action, /metadata: \{ purpose: "plus_subscription", user_id: user\.id \}/);
  assert.match(action, /subscription_data:/);
  assert.doesNotMatch(action, /formData\.get\("(?:price|amount|plan)"\)/);
  assert.doesNotMatch(action, /plan:\s*"PLUS"/);
});

test("Task077 H: Checkout return displays pending until DB entitlement is PLUS and polling is bounded", async () => {
  const [plusPage, returnStatus, entitlements, webhook] = await Promise.all([
    read("../app/(app)/plus/page.tsx"),
    read("../app/(app)/plus/checkout-return-status.tsx"),
    read("../lib/entitlements-server.ts"),
    read("../app/api/stripe/webhook/route.ts"),
  ]);
  assert.match(plusPage, /query\.checkout === "complete" && entitlements\.plan !== "PLUS"/);
  assert.match(plusPage, /query\.checkout === "complete" && entitlements\.plan === "PLUS"/);
  assert.match(plusPage, /upgrade-return:/);
  assert.match(returnStatus, /attempts < 6/);
  assert.match(entitlements, /subscriptionStatus:/);
  assert.match(webhook, /checkout\.session\.completed/);
  assert.match(webhook, /customer\.subscription\.created/);
  assert.match(webhook, /customer\.subscription\.updated/);
  assert.match(webhook, /customer\.subscription\.deleted/);
  assert.match(webhook, /sync_user_subscription_from_stripe/);
});

test("Task077 I/J/K/L: all requested Plus-gated surfaces retain server checks and show upgrade UI", async () => {
  const files = await Promise.all([
    read("../app/(app)/pets/new/page.tsx"),
    read("../app/(app)/pets/actions.ts"),
    read("../app/(app)/pets/[petId]/family/page.tsx"),
    read("../app/(app)/pets/[petId]/family/actions.ts"),
    read("../app/(app)/pets/[petId]/album/year/[year]/page.tsx"),
    read("../app/(app)/pets/[petId]/album/year/[year]/actions.ts"),
    read("../app/(app)/pets/[petId]/anniversary/page.tsx"),
    read("../app/(app)/search/_components/search-screen.tsx"),
    read("../app/(app)/pets/[petId]/album/[albumId]/analytics-actions.ts"),
    read("../app/(app)/pets/[petId]/album/[albumId]/album-complete-screen.tsx"),
    read("../app/(app)/_components/plus-upsell.tsx"),
  ]);
  const [newPet, petAction, family, familyAction, annual, annualAction, anniversary, search, albumAction, albumComplete, plusUpsell] = files;
  assert.match(newPet, /<PlusUpsell/);
  assert.match(petAction, /!entitlements\.canUseMultiplePets/);
  assert.match(family, /<PlusUpsell/);
  assert.match(familyAction, /!entitlements\.canUseFamilySharing/);
  assert.match(annual, /<PlusUpsell/);
  assert.match(annualAction, /!entitlements\.canUseAnnualMemory/);
  assert.match(anniversary, /<PlusUpsell/);
  assert.match(search, /advancedSearchBlocked/);
  assert.match(albumAction, /!entitlements\.canRegenerateAlbum/);
  assert.match(albumComplete, /showRegenerateUpsell/);
  assert.match(plusUpsell, /<PlusUpgradeCta/);
  assert.match(plusUpsell, /今はFREEのまま使う/);
});

test("Task077 M/N: Customer Portal uses only the authenticated row's customer and fails safely", async () => {
  const [portalAction, portalButton, billing] = await Promise.all([
    read("../app/(app)/settings/billing/actions.ts"),
    read("../app/(app)/settings/billing/billing-portal-button.tsx"),
    read("../app/settings/billing/page.tsx"),
  ]);
  assert.match(portalAction, /auth\.getUser\(\)/);
  assert.match(portalAction, /\.eq\("user_id", user\.id\)/);
  assert.match(portalAction, /stripe\.billingPortal\.sessions\.create/);
  assert.match(portalAction, /customer: customerId/);
  assert.match(portalAction, /return_url: `\$\{siteUrl\}\/settings\/billing`/);
  assert.match(portalAction, /if \(subscriptionError \|\| !customerId \|\| !siteUrl\)/);
  assert.doesNotMatch(portalAction, /formData\.get\("customer/);
  assert.doesNotMatch(portalAction, /console\.(?:log|error).*error/);
  assert.match(portalButton, /disabled=\{pending\}/);
  assert.match(billing, /subscription\?\.stripe_customer_id \?\s*\(/);
});

test("Task077 O/P/Q: downgrade preserves existing data, Print remains disabled, and secrets are not exposed", async () => {
  const [migration, printConfig, pricing, billingAction, checkoutAction] = await Promise.all([
    read("../supabase/migrations/20261007140000_free_plus_entitlements.sql"),
    read("../lib/print/commerce-readiness.ts"),
    read("../app/pricing/page.tsx"),
    read("../app/(app)/settings/billing/actions.ts"),
    read("../app/(app)/plus/actions.ts"),
  ]);
  assert.doesNotMatch(migration, /delete from public\.(pets|photos|albums|pet_family_members)/i);
  assert.match(migration, /v_plan := case when p_status in \('trialing', 'active'\) then 'PLUS' else 'FREE' end/);
  assert.match(printConfig, /value\?\.trim\(\)\.toLowerCase\(\) \|\| "disabled"/);
  assert.match(pricing, /Production Printの注文受付は現在行っていません/);
  assert.doesNotMatch(pricing, /フォトブック注文可能|フォトブックを注文できます/);
  for (const source of [billingAction, checkoutAction, pricing]) {
    assert.doesNotMatch(source, /sk_live_[A-Za-z0-9]+|rk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/);
  }
});