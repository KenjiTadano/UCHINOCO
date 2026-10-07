import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canShowAds,
  freeSearchSelection,
  getUserEntitlements,
  planFromSubscriptionStatus,
  resolvePlan,
} from "../lib/entitlements.ts";

test("Task071: FREE keeps core memories and Print available", () => {
  const free = getUserEntitlements("FREE");
  assert.equal(free.canPrint, true);
  assert.equal(free.canAddPhotos, true);
  assert.equal(free.canUsePhotoIntelligence, true);
  assert.equal(free.canUseNow, true);
  assert.equal(free.canCreateAlbum, true);
  assert.equal(free.canEditAlbum, true);
  assert.equal(free.canUseBasicSearch, true);
  assert.equal(free.canUseFamilySharing, false);
  assert.equal(free.canUseMultiplePets, false);
});

test("Task071: PLUS enables advanced memory entitlements", () => {
  const plus = getUserEntitlements("PLUS");
  assert.equal(plus.canUseFamilySharing, true);
  assert.equal(plus.canUseMultiplePets, true);
  assert.equal(plus.canUseAnnualMemory, true);
  assert.equal(plus.canUseAdvancedSearch, true);
  assert.equal(plus.canUseOnThisDayHistory, true);
  assert.equal(plus.canRegenerateAlbum, true);
  assert.equal(plus.isAdFree, true);
});

test("Task071: only active and trialing subscriptions grant PLUS", () => {
  for (const status of ["active", "trialing"]) assert.equal(planFromSubscriptionStatus(status), "PLUS");
  for (const status of ["past_due", "canceled", "unpaid", "incomplete", "paused", null]) {
    assert.equal(planFromSubscriptionStatus(status), "FREE");
  }
});

test("Task071: developer override cannot forge production plan", () => {
  assert.equal(resolvePlan({ subscriptionStatus: "canceled", devOverride: "PLUS", nodeEnv: "test" }), "PLUS");
  assert.equal(resolvePlan({ subscriptionStatus: "canceled", devOverride: "PLUS", nodeEnv: "production" }), "FREE");
});

test("Task071: FREE advanced search input is stripped but basic fields survive", () => {
  const state = {
    q: "散歩", pet: "pet", kind: "tag", word: "公園", favorite: true,
    from: "2025-01-01", to: "2025-12-31", year: "2025", month: "8",
    season: "summer", best: true, anniversary: "birthday", story: "event",
  };
  const free = freeSearchSelection(state);
  assert.equal(free.q, "散歩");
  assert.equal(free.word, "公園");
  assert.equal(free.favorite, true);
  assert.equal(free.year, "");
  assert.equal(free.best, false);
  assert.equal(free.anniversary, "");
});

test("Task071: ads are only eligible on safe FREE list surfaces", () => {
  const free = getUserEntitlements("FREE");
  const plus = getUserEntitlements("PLUS");
  assert.equal(canShowAds("home", free), true);
  assert.equal(canShowAds("search-list", free), true);
  assert.equal(canShowAds("viewer", free), false);
  assert.equal(canShowAds("editor", free), false);
  assert.equal(canShowAds("checkout", free), false);
  assert.equal(canShowAds("home", plus), false);
});

test("Task071: DB boundaries and Stripe webhook are authoritative", async () => {
  const [migration, webhook, checkout, printAction] = await Promise.all([
    readFile("./supabase/migrations/20261007140000_free_plus_entitlements.sql", "utf8"),
    readFile("./app/api/stripe/webhook/route.ts", "utf8"),
    readFile("./app/(app)/plus/actions.ts", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/print/actions.ts", "utf8"),
  ]);
  assert.match(migration, /create table public\.user_subscriptions/);
  assert.match(migration, /grant execute on function public\.sync_user_subscription_from_stripe[\s\S]*service_role/);
  assert.match(migration, /pets: entitled owner insert/);
  assert.match(migration, /photos: entitled family insert/);
  assert.match(migration, /PLUSプランで家族を招待できます/);
  assert.match(webhook, /customer\.subscription\.updated/);
  assert.match(webhook, /sync_user_subscription_from_stripe/);
  assert.doesNotMatch(checkout, /update\(\{\s*plan:/);
  assert.doesNotMatch(printAction, /canPrint|loadUserEntitlements/);
});

test("Task071: downgrade preserves rows and only restricts new writes", async () => {
  const migration = await readFile("./supabase/migrations/20261007140000_free_plus_entitlements.sql", "utf8");
  assert.doesNotMatch(migration, /delete from public\.(pets|photos|albums|pet_family_members)/i);
  assert.match(migration, /subscriptions: own select/);
  assert.match(migration, /Users can view photos for accessible pets|can_access_pet/);
});
