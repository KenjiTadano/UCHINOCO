import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ANALYTICS_MINIMUM_SAMPLE,
  PRODUCT_ANALYTICS_EVENT_TYPES,
  analyticsRangeStart,
  buildProductionKpis,
  hasForbiddenAnalyticsPayload,
} from "../lib/product-analytics.ts";

const raw = {
  active_users: 20, free_active_users: 15, plus_active_users: 5,
  album_generated: 20, album_viewed: 16, album_accepted: 12, direct_accepted: 8,
  average_edit_distance: 1.5, layout_kept: 18, layout_total: 20, crop_kept: 19,
  crop_total: 20, photo_swap_accepted: 3, text_edited_accepted: 2,
  decoration_applied_accepted: 4, print_preview: 9, checkout_started: 6,
  payment_success: 4, print_order_created: 4, fulfillment_ready: 3,
  upgrade_viewed: 10, upgrade_started: 5, subscription_activated: 2,
  search_opened: 20, search_result_opened: 12, search_empty: 4,
  family_invite_sent: 10, family_invite_accepted: 6, family_photo_added: 8,
  family_activity_viewed: 5,
};

test("formal KPI definitions preserve Direct Accept, Edit Distance, and completion", () => {
  const kpi = buildProductionKpis(raw);
  assert.equal(kpi.album.directAccept.value, 0.4);
  assert.equal(kpi.album.averageEditDistance.value, 1.5);
  assert.equal(kpi.album.completionViewed.value, 0.8);
  assert.equal(kpi.album.completionAccepted.value, 0.6);
});

test("print and FREE to PLUS funnels use adjacent real stages", () => {
  const kpi = buildProductionKpis(raw);
  assert.equal(kpi.print.preview.value, 9 / 12);
  assert.equal(kpi.print.checkout.value, 6 / 9);
  assert.equal(kpi.print.payment.value, 4 / 6);
  assert.equal(kpi.monetization.activation.value, 2 / 5);
});

test("search and family value omit query/member contents", () => {
  const kpi = buildProductionKpis(raw);
  assert.equal(kpi.search.resultOpen.value, 0.6);
  assert.equal(kpi.search.empty.value, 0.2);
  assert.equal(kpi.family.inviteAccept.value, 0.6);
  assert.equal(hasForbiddenAnalyticsPayload({ search_query: "公園" }), true);
  assert.equal(hasForbiddenAnalyticsPayload({ nested: { email: "private@example.com" } }), true);
  assert.equal(hasForbiddenAnalyticsPayload({ photo_count: 3 }), false);
});

test("sample size below ten is explicitly insufficient", () => {
  const kpi = buildProductionKpis({ album_generated: ANALYTICS_MINIMUM_SAMPLE - 1, direct_accepted: 9 });
  assert.equal(kpi.album.directAccept.sufficient, false);
});

test("7d and 30d windows are deterministic and all time is unbounded", () => {
  const now = new Date("2026-10-07T00:00:00.000Z");
  assert.equal(analyticsRangeStart("7d", now), "2026-09-30T00:00:00.000Z");
  assert.equal(analyticsRangeStart("30d", now), "2026-09-07T00:00:00.000Z");
  assert.equal(analyticsRangeStart("all", now), null);
});

test("taxonomy is stable snake_case and contains required product events", () => {
  assert.ok(PRODUCT_ANALYTICS_EVENT_TYPES.every((value) => /^[a-z]+(?:_[a-z]+)*$/.test(value)));
  for (const value of ["payment_success", "subscription_activated", "search_empty", "family_invite_accepted"]) {
    assert.ok(PRODUCT_ANALYTICS_EVENT_TYPES.includes(value));
  }
});

test("migration enforces append-only RLS, dedupe, privacy, and service-only aggregation", async () => {
  const sql = await readFile("./supabase/migrations/20261007160000_production_analytics_kpis.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /unique index product_analytics_events_dedupe_idx/);
  assert.match(sql, /revoke all on public\.product_analytics_events/);
  assert.match(sql, /grant insert on public\.product_analytics_events to authenticated/);
  assert.match(sql, /event_data_allowlist/);
  assert.match(sql, /grant execute on function public\.get_production_kpis\(timestamptz\) to service_role/);
  assert.doesNotMatch(sql, /'print_shipped'|'print_delivered'/);
});

test("important webhook events use dedupe keys and analytics never fails the webhook", async () => {
  const source = await readFile("./app/api/stripe/webhook/route.ts", "utf8");
  assert.match(source, /subscription_activated/);
  assert.match(source, /payment_success/);
  assert.match(source, /analyticsEventKey/);
  assert.match(source, /await recordProductAnalyticsEvent/);
  const helper = await readFile("./lib/product-analytics-server.ts", "utf8");
  assert.match(helper, /error\.code === "23505"/);
  assert.match(helper, /catch \{/);
});

test("search query text and private media data are never written", async () => {
  const source = await readFile("./app/(app)/search/_components/search-screen.tsx", "utf8");
  assert.match(source, /eventType: "search_opened"/);
  assert.match(source, /eventType: "search_empty"/);
  assert.doesNotMatch(source, /eventData:\s*\{[^}]*query/s);
  const helper = await readFile("./lib/product-analytics-server.ts", "utf8");
  assert.doesNotMatch(helper, /signedUrl|storagePath|caption/);
});

test("internal metrics route denies production users outside the server allowlist", async () => {
  const source = await readFile("./app/(app)/dev/metrics/page.tsx", "utf8");
  assert.match(source, /UCHINOCO_INTERNAL_USER_IDS/);
  assert.match(source, /process\.env\.NODE_ENV === "production" && !allowed\.has\(user\.id\)\) notFound\(\)/);
  assert.match(source, /createAdminClient/);
});
