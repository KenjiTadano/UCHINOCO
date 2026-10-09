import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBillingSubscriptionPresentation } from "../lib/billing-display.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("A: active PLUS without scheduled cancellation shows active and next renewal", () => {
  const presentation = getBillingSubscriptionPresentation({
    plan: "PLUS",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-11-09T00:00:00.000Z",
  });
  assert.equal(presentation.contractStatus, "有効");
  assert.equal(presentation.periodEndLabel, "次回更新日");
  assert.equal(presentation.cancellationNotice, null);
});

test("B: scheduled cancellation says canceled-scheduled and keeps PLUS through period end", () => {
  const presentation = getBillingSubscriptionPresentation({
    plan: "PLUS",
    status: "active",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-11-09T00:00:00.000Z",
  });
  assert.equal(presentation.contractStatus, "解約予定");
  assert.equal(presentation.periodEndLabel, "利用終了日");
  assert.equal(presentation.formattedPeriodEnd, "2026年11月9日");
  assert.equal(presentation.cancellationNotice, "この日まではPLUSをご利用いただけます");
  assert.notEqual(presentation.periodEndLabel, "次回更新日");
});

test("C: FREE plan presentation is unchanged by a stale cancellation flag", () => {
  const presentation = getBillingSubscriptionPresentation({
    plan: "FREE",
    status: "canceled",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-11-09T00:00:00.000Z",
  });
  assert.equal(presentation.plan, "FREE");
  assert.equal(presentation.contractStatus, null);
  assert.equal(presentation.periodEndLabel, null);
  assert.equal(presentation.cancellationNotice, null);
});

test("D: missing or invalid period end does not produce a date or a misleading notice", () => {
  for (const currentPeriodEnd of [null, "not-a-date"]) {
    const presentation = getBillingSubscriptionPresentation({
      plan: "PLUS",
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
    });
    assert.equal(presentation.contractStatus, "解約予定");
    assert.equal(presentation.periodEndLabel, null);
    assert.equal(presentation.formattedPeriodEnd, null);
    assert.equal(presentation.cancellationNotice, null);
  }
});

test("E: billing page keeps the Customer Portal action for scheduled cancellations", async () => {
  const page = await read("../app/settings/billing/page.tsx");
  assert.match(page, /cancel_at_period_end/);
  assert.match(page, /getBillingSubscriptionPresentation/);
  assert.match(page, /presentation\.contractStatus/);
  assert.match(page, /presentation\.periodEndLabel/);
  assert.match(page, /presentation\.cancellationNotice/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /<BillingPortalButton\s*\/>/);
});