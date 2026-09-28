import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bindOrderToSnapshot,
  decideFinalize,
  orderFingerprintAfterDraftEdit,
  orderedPrintSource,
  reusePendingOrder,
  snapshotUpdateAllowed,
  warningsAllowOrder,
  webhookKeepsBinding,
} from "../lib/album-order/finalize.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const album = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const draft = "44444444-4444-4444-8444-444444444444";

function snapshot(overrides = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    albumId: album,
    ownerId: actor,
    draftVersionId: draft,
    fingerprint: "fp-current",
    finalizedAt: null,
    pdfPath: "drafts/book.pdf",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    actorId: actor,
    albumId: album,
    albumStatus: "draft",
    hasActiveDraft: true,
    saveState: "saved",
    blocking: false,
    currentFingerprint: "fp-current",
    currentDraftVersionId: draft,
    snapshot: snapshot(),
    ...overrides,
  };
}

test("finalize accepts the latest matching snapshot", () => {
  assert.deepEqual(decideFinalize(input()), { ok: true, code: "OK" });
});

test("stale snapshot is rejected", () => {
  const decision = decideFinalize(input({ currentFingerprint: "fp-edited" }));
  assert.equal(decision.code, "STALE");
});

test("blocking quality rejects the order", () => {
  assert.equal(decideFinalize(input({ blocking: true })).code, "BLOCKING");
});

test("warnings still allow the order", () => {
  assert.equal(warningsAllowOrder(["LOW_DPI", "EMPTY_OPPOSITE_PAGE", "SPARSE_SPREAD"]), true);
  assert.equal(decideFinalize(input({ blocking: false })).ok, true);
});

test("order binding stores the snapshot fingerprint and ignores the client price", () => {
  const bound = bindOrderToSnapshot({
    actorId: actor,
    albumId: album,
    snapshot: snapshot({ finalizedAt: "2026-09-28T00:00:00Z" }),
    serverPrice: 2980,
    clientPrice: 1,
  });
  assert.equal(bound.ok, true);
  if (!bound.ok) return;
  assert.equal(bound.binding.printSnapshotId, snapshot().id);
  assert.equal(bound.binding.printFingerprint, "fp-current");
  assert.equal(bound.binding.price, 2980);
});

test("cross-owner snapshot cannot be finalized or bound", () => {
  assert.equal(decideFinalize(input({ snapshot: snapshot({ ownerId: other }) })).code, "OWNER");
  const bound = bindOrderToSnapshot({
    actorId: actor,
    albumId: album,
    snapshot: snapshot({ ownerId: other, albumId: other, finalizedAt: "2026-09-28T00:00:00Z" }),
    serverPrice: 2980,
    clientPrice: null,
  });
  assert.equal(bound.ok, false);
});

test("snapshot content stays immutable after finalize", () => {
  assert.equal(snapshotUpdateAllowed(null, "content"), false);
  assert.equal(snapshotUpdateAllowed("2026-09-28T00:00:00Z", "pdf"), false);
  assert.equal(snapshotUpdateAllowed(null, "pdf"), true);
  assert.equal(snapshotUpdateAllowed(null, "finalize"), true);
  assert.equal(snapshotUpdateAllowed("2026-09-28T00:00:00Z", "finalize"), false);
});

test("draft edit after finalize keeps the order fingerprint", () => {
  assert.equal(orderFingerprintAfterDraftEdit("fp-current", "fp-edited"), "fp-current");
});

test("checkout retry reuses the pending order for the same snapshot", () => {
  assert.equal(reusePendingOrder({ printSnapshotId: snapshot().id, status: "pending" }, snapshot().id), "reuse");
  assert.equal(reusePendingOrder({ printSnapshotId: "other", status: "pending" }, snapshot().id), "replace");
  assert.equal(reusePendingOrder(null, snapshot().id), "create");
});

test("webhook accepts the stored binding and ignores a mismatched metadata snapshot", () => {
  assert.equal(webhookKeepsBinding({
    orderAlbumId: album,
    orderSnapshotId: snapshot().id,
    orderFingerprint: "fp-current",
    storedSnapshotAlbumId: album,
    storedFingerprint: "fp-current",
    metadataSnapshotId: snapshot().id,
    successUrlClaimsPaid: false,
  }), true);
  assert.equal(webhookKeepsBinding({
    orderAlbumId: album,
    orderSnapshotId: snapshot().id,
    orderFingerprint: "fp-current",
    storedSnapshotAlbumId: album,
    storedFingerprint: "fp-current",
    metadataSnapshotId: "66666666-6666-4666-8666-666666666666",
    successUrlClaimsPaid: false,
  }), false);
});

test("webhook retry stays on the same binding", () => {
  const first = webhookKeepsBinding({
    orderAlbumId: album,
    orderSnapshotId: snapshot().id,
    orderFingerprint: "fp-current",
    storedSnapshotAlbumId: album,
    storedFingerprint: "fp-current",
    metadataSnapshotId: null,
    successUrlClaimsPaid: false,
  });
  assert.equal(first, true);
});

test("ordered albums stay locked by the existing guard", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260927120000_album_draft_persistence.sql", import.meta.url), "utf8");
  assert.match(sql, /v_status = 'ordered'/);
});

test("print job for a bound order uses the final snapshot", () => {
  assert.equal(orderedPrintSource({ printSnapshotId: snapshot().id }), "final-print-snapshot");
  assert.equal(orderedPrintSource({ printSnapshotId: null }), "order-photos");
  const pipeline = readFile(new URL("../lib/print/pipeline/prepare-print-job.ts", import.meta.url), "utf8");
  return pipeline.then((src) => {
    assert.match(src, /final-print-snapshot/);
    assert.match(src, /from\("order_photos"\)/);
    assert.doesNotMatch(src, /from\("album_photos"\)/);
  });
});

test("paid photo delete stays denied by the order_photos guard", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260918140000_order_snapshot_print_jobs.sql", import.meta.url), "utf8");
  assert.match(sql, /order_photos/);
  const next = await readFile(new URL("../supabase/migrations/20260928220000_finalize_print_order.sql", import.meta.url), "utf8");
  assert.match(next, /insert into public.order_photos/);
  assert.match(next, /snapshot->'spreads'/);
});

test("success URL cannot mark an order paid", async () => {
  const page = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx", import.meta.url), "utf8");
  const webhook = await readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page, /mark_order_paid/);
  assert.match(webhook, /mark_order_paid/);
  assert.equal(webhookKeepsBinding({
    orderAlbumId: album,
    orderSnapshotId: snapshot().id,
    orderFingerprint: "fp-current",
    storedSnapshotAlbumId: album,
    storedFingerprint: "fp-current",
    metadataSnapshotId: null,
    successUrlClaimsPaid: true,
  }), false);
});

test("checkout calculates price on the server", async () => {
  const src = await readFile(new URL("../app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts", import.meta.url), "utf8");
  assert.match(src, /calcPrice\(product, pages\)/);
  assert.doesNotMatch(src, /formData\.get\("price"\)/);
  assert.doesNotMatch(src, /formData\.get\("subtotal"\)/);
});

test("unsaved and missing snapshots cannot be finalized", () => {
  assert.equal(decideFinalize(input({ saveState: "saving" })).code, "UNSAVED");
  assert.equal(decideFinalize(input({ saveState: "error" })).code, "SAVE_ERROR");
  assert.equal(decideFinalize(input({ snapshot: null })).code, "MISSING_SNAPSHOT");
});
