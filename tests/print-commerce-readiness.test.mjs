import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("print commerce defaults to disabled and keeps production release gates", async () => {
  const source = await readFile("./lib/print/commerce-readiness.ts", "utf8");
  assert.match(source, /\|\| "disabled"/);
  assert.match(source, /PROVIDER_UNCONFIRMED/);
  assert.match(source, /PRODUCTION_PRICE_UNCONFIRMED/);
});

test("external submission is release-gated before provider invocation", async () => {
  const source = await readFile("./lib/print/print-job.ts", "utf8");
  const gate = source.indexOf("assertLivePrintReleaseReady");
  const create = source.indexOf("provider.createOrder");
  assert.ok(gate >= 0 && create > gate);
});

test("checkout is gated before Stripe session creation", async () => {
  const source = await readFile(
    "./app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts",
    "utf8",
  );
  const gate = source.indexOf("canCreatePrintCheckout");
  const stripeSession = source.indexOf("stripe.checkout.sessions.create");
  assert.ok(gate >= 0 && stripeSession > gate);
});

test("payment and fulfillment states are persisted separately", async () => {
  const sql = await readFile("./supabase/migrations/20261007150000_print_commerce_readiness.sql", "utf8");
  assert.match(sql, /fulfillment_status/);
  assert.match(sql, /provider_request_id text unique/);
  assert.match(sql, /mode in \('disabled', 'test', 'live'\)/);
  assert.match(sql, /provider_cost/);
});

test("A5 candidate does not claim unconfirmed production requirements", async () => {
  const spec = await readFile("./lib/album-print/print-spec.ts", "utf8");
  assert.match(spec, /trimWidthMm: 148/);
  assert.match(spec, /trimHeightMm: 210/);
  assert.match(spec, /pdfWidthMm: 154/);
  assert.match(spec, /pdfHeightMm: 216/);
  assert.match(spec, /provider: null/);
  assert.match(spec, /requiredPdfStandard: null/);
  assert.match(spec, /productionReady: false/);
});
