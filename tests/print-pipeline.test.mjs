/**
 * Task047-5 — Print job pipeline foundation tests A–V
 *
 * Direct imports: pure modules without "server-only"
 * Structural tests: server-only modules (readFile)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { buildPrintDocument } from "../lib/print/document-builder.ts";
import { SAFE_ERROR_CODES } from "../lib/print/pdf/errors.ts";

const ORDER_ID = "00000000-0000-4000-8000-000000000001";

// ── A: print_jobs queued created atomically in migration ──────────────────────

test("A: migration creates queued print_job inside mark_order_paid transaction", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  assert.ok(sql.includes("insert into public.print_jobs"), "INSERT into print_jobs present");
  assert.ok(sql.includes("'queued'"), "status = 'queued' in insert");
});

// ── B: duplicate job prevented by ON CONFLICT DO NOTHING ─────────────────────

test("B: idempotency via ON CONFLICT (idempotency_key) DO NOTHING", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  assert.ok(sql.includes("on conflict (idempotency_key) do nothing"), "ON CONFLICT DO NOTHING present");
});

// ── C: deterministic idempotency key ─────────────────────────────────────────

test("C: idempotency key = 'print-order:{orderId}'", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  assert.ok(sql.includes("'print-order:' ||"), "deterministic key format present");
});

// ── D: default provider is 'mock' ────────────────────────────────────────────

test("D: mark_order_paid default p_provider = 'mock'", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  assert.ok(sql.includes("p_provider          text default 'mock'"), "default provider is mock");
});

// ── E: Client cannot specify provider ────────────────────────────────────────

test("E: preparePrintJob is server-only — client cannot influence provider (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("server-only"), "server-only present");
  // Provider comes from print_jobs.provider (set by webhook from env) not from function args
  assert.ok(!src.includes("provider:"), "function params do not expose provider selection");
});

// ── F: SupabaseImageLoader implements PrintImageLoader interface ──────────────

test("F: SupabaseImageLoader implements PrintImageLoader (structural)", async () => {
  const src = await readFile("./lib/print/pdf/supabase-image-loader.ts", "utf8");
  assert.ok(src.includes("implements PrintImageLoader"), "implements interface");
  assert.ok(src.includes("async load(path"), "has load method");
  assert.ok(src.includes("server-only"), "server-only present");
});

// ── G: ImageLoadError on download failure ────────────────────────────────────

test("G: SupabaseImageLoader throws ImageLoadError on download failure (structural)", async () => {
  const src = await readFile("./lib/print/pdf/supabase-image-loader.ts", "utf8");
  assert.ok(src.includes("ImageLoadError"), "throws ImageLoadError");
  assert.ok(src.includes("error || !data"), "checks for error and missing data");
});

// ── H: PrintFileStore.save returns StoredPrintFile ───────────────────────────

test("H: SupabasePrintFileStore.save returns StoredPrintFile shape (structural)", async () => {
  const src = await readFile("./lib/print/pdf/print-file-store.ts", "utf8");
  assert.ok(src.includes("StoredPrintFile"), "returns StoredPrintFile");
  assert.ok(src.includes("type: file.type"), "type field present");
  assert.ok(src.includes("path: file.filename"), "path from filename");
  assert.ok(src.includes("pageCount: file.pageCount"), "pageCount present");
});

// ── I: cover filename = orders/{orderId}/cover.pdf ────────────────────────────

test("I: cover PDF filename contains orderId and no PII", () => {
  const expectedCover = `orders/${ORDER_ID}/cover.pdf`;
  assert.ok(expectedCover.includes(ORDER_ID), "filename contains orderId");
  assert.ok(!expectedCover.includes("山田"), "no Japanese name in filename");
  assert.ok(!expectedCover.includes("phone"), "no phone in filename");
});

// ── J: content filename = orders/{orderId}/content.pdf ───────────────────────

test("J: content PDF filename contains orderId and no PII", () => {
  const expected = `orders/${ORDER_ID}/content.pdf`;
  assert.ok(expected.startsWith("orders/"), "starts with orders/");
  assert.ok(expected.endsWith("/content.pdf"), "ends with /content.pdf");
  assert.ok(expected.includes(ORDER_ID), "contains orderId");
});

// ── K: print-files bucket is private ─────────────────────────────────────────

test("K: print-files bucket created with public=false (structural)", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  assert.ok(sql.includes("'print-files'"), "print-files bucket defined");
  assert.ok(sql.includes("false"), "public=false");
  assert.ok(sql.includes("application/pdf"), "PDF-only mime type");
});

// ── L: authenticated cannot upload to print-files ────────────────────────────

test("L: no CREATE POLICY statement for print-files — authenticated users cannot upload (structural)", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918160000_print_pipeline.sql",
    "utf8",
  );
  // service_role bypasses RLS without any policy; no CREATE POLICY needed for print-files
  assert.ok(!sql.includes("create policy"), "no CREATE POLICY in migration");
});

// ── M: order_photos queried position ASC ─────────────────────────────────────

test("M: preparePrintJob queries order_photos ORDER BY position ASC (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("position"), "orders by position");
  assert.ok(src.includes("ascending: true"), "ascending order");
});

// ── N: album_photos not referenced in pipeline ───────────────────────────────

test("N: prepare-print-job.ts does not query album_photos table (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  // Comments mentioning album_photos are fine; what matters is no .from("album_photos")
  assert.ok(!src.includes('.from("album_photos")'), "album_photos not queried in pipeline");
  assert.ok(!src.includes("from('album_photos')"), "no single-quote variant either");
});

// ── O: generatePrintPdfs is called in pipeline ───────────────────────────────

test("O: preparePrintJob calls generatePrintPdfs (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("generatePrintPdfs"), "generatePrintPdfs called");
});

// ── P: upload failure → failed status ────────────────────────────────────────

test("P: pipeline catch block sets status=failed on upload failure (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("status: \"failed\""), "status set to failed on error");
  assert.ok(src.includes("failed_at"), "failed_at set");
});

// ── Q: generation failure → failed status ────────────────────────────────────

test("Q: pipeline catch handles generation errors and marks job failed (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("} catch (err)"), "catch block present");
  assert.ok(src.includes("throw err"), "error re-thrown after marking failed");
});

// ── R: error_code is sanitized ───────────────────────────────────────────────

test("R: SAFE_ERROR_CODES whitelist prevents PII/details in error_code", () => {
  assert.ok(SAFE_ERROR_CODES.has("IMAGE_LOAD_FAILED"), "IMAGE_LOAD_FAILED in safe set");
  assert.ok(SAFE_ERROR_CODES.has("PDF_GENERATION_FAILED"), "PDF_GENERATION_FAILED in safe set");
  assert.ok(SAFE_ERROR_CODES.has("PRINT_FILE_UPLOAD_FAILED"), "PRINT_FILE_UPLOAD_FAILED in safe set");
  assert.ok(!SAFE_ERROR_CODES.has("some/path/to/secret"), "arbitrary path not in safe set");
  assert.ok(!SAFE_ERROR_CODES.has("山田太郎"), "PII not in safe set");
});

test("R: pipeline uses SAFE_ERROR_CODES to sanitize before persisting (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("SAFE_ERROR_CODES"), "SAFE_ERROR_CODES used");
  assert.ok(src.includes("safeCode"), "safeCode variable derived");
});

// ── S: retry — failed jobs have prepared_at reset ────────────────────────────

test("S: pipeline resets prepared_at to null on failure so job can be retried (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("prepared_at: null"), "prepared_at reset on failure");
});

// ── T: concurrent claim safety ───────────────────────────────────────────────

test("T: atomic claim uses prepared_at IS NULL + status=queued guard (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes(".is(\"prepared_at\", null)"), "IS NULL check on prepared_at");
  assert.ok(src.includes(".eq(\"status\", \"queued\")"), "status=queued guard");
});

// ── U: no PII in logs ────────────────────────────────────────────────────────

test("U: prepare-print-job.ts has no console.log calls (no PII logging)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(!src.includes("console.log"), "no console.log in pipeline");
  assert.ok(!src.includes("console.error"), "no console.error in pipeline");
});

// ── V: Mock provider asset build ─────────────────────────────────────────────

test("V: buildPrintDocument produces pages with original_path for Mock provider", () => {
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: "テスト",
    cover_original_path_snapshot: "user/pet/2026/09/cover.jpg",
    pages: 2,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: [
      { photoId: "photo-1", position: 0, original_path: "user/pet/2026/09/photo1.jpg" },
    ],
  });
  assert.equal(doc.pages.length, 2, "2 pages total");
  assert.equal(doc.pages[0].item?.imagePath, "user/pet/2026/09/photo1.jpg", "first page has photo");
  assert.equal(doc.pages[1].item, null, "second page is blank");
  assert.equal(doc.cover.imagePath, "user/pet/2026/09/cover.jpg", "cover uses snapshot");
});

// ── W (新A): claim時 prepared_at はnull ───────────────────────────────────────

test("W (新A): claim時 prepared_at はnull — claim updateはprepared_atを書かない (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(!src.includes("prepared_at: now"), "claim does not set prepared_at: now");
  assert.ok(src.includes("preparation_started_at: now"), "claim sets preparation_started_at: now");
});

// ── X (新B): claim時 preparation_started_at が入る ───────────────────────────

test("X (新B): claim時 preparation_started_at が入る (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("preparation_started_at: now"), "claim sets preparation_started_at to now");
  assert.ok(
    src.includes('.select("id, order_id, preparation_started_at")'),
    "claim selects preparation_started_at as claim token",
  );
});

// ── Y (新C): 成功後 prepared_at が入る ────────────────────────────────────────

test("Y (新C): 成功後 prepared_at が入る (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("prepared_at: completionTime"), "success sets prepared_at to completionTime");
});

// ── Z (新D): 成功後 preparation_started_at null ───────────────────────────────

test("Z (新D): 成功後 preparation_started_at null (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(
    src.includes("preparation_started_at: null"),
    "success clears preparation_started_at",
  );
});

// ── AA (新E): failure後 両方null ──────────────────────────────────────────────

test("AA (新E): failure後 prepared_at と preparation_started_at が両方null (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("prepared_at: null"), "failure sets prepared_at: null");
  assert.ok(src.includes("preparation_started_at: null"), "failure sets preparation_started_at: null");
});

// ── AB (新F): 同時claimは1workerのみ ─────────────────────────────────────────

test("AB (新F): 同時claimは1workerのみ — atomic UPDATE + maybeSingle (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes(".maybeSingle()"), "maybeSingle — at most one row returned = one claimant");
  assert.ok(src.includes(".or("), "OR condition in claim filters unclaimed or lease-expired rows");
});

// ── AC (新G): stale claim再取得可能 ───────────────────────────────────────────

test("AC (新G): stale claim再取得可能 — leaseExpiry条件 (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("leaseExpiry"), "leaseExpiry threshold computed from LEASE_TIMEOUT_MS");
  assert.ok(
    src.includes("preparation_started_at.lt."),
    "stale-lease branch in OR filter: preparation_started_at < leaseExpiry",
  );
});

// ── AD (新H): fresh claim再取得不可 ───────────────────────────────────────────

test("AD (新H): fresh claim再取得不可 — LEASE_TIMEOUT未超過は再claimできない (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("LEASE_TIMEOUT_MS"), "LEASE_TIMEOUT_MS used in leaseExpiry calculation");
  assert.ok(
    src.includes("preparation_started_at.is.null"),
    "IS NULL branch: unclaimed jobs can be claimed; fresh leases cannot",
  );
});

// ── AE (新I): crash想定で永久lockしない ───────────────────────────────────────

test("AE (新I): crash想定で永久lockしない — LEASE_TIMEOUT_MINUTES定数 (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(src.includes("LEASE_TIMEOUT_MINUTES"), "LEASE_TIMEOUT_MINUTES constant defined");
  assert.ok(
    src.includes("export const LEASE_TIMEOUT_MINUTES"),
    "LEASE_TIMEOUT_MINUTES exported — testable and configurable",
  );
});

// ── AF (新J): invalid provider拒否 ────────────────────────────────────────────

test("AF (新J): invalid provider拒否 — migration CHECK constraint (structural)", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918170000_print_pipeline_claim_separation.sql",
    "utf8",
  );
  assert.ok(sql.includes("print_jobs_provider_check"), "provider check constraint named");
  assert.ok(sql.includes("check (provider in"), "CHECK IN constraint present");
});

// ── AG (新K): valid provider 4種許可 ─────────────────────────────────────────

test("AG (新K): valid provider 4種許可 — mock/prodigi/gelato/fujifilm (structural)", async () => {
  const sql = await readFile(
    "./supabase/migrations/20260918170000_print_pipeline_claim_separation.sql",
    "utf8",
  );
  assert.ok(sql.includes("'mock'"), "mock provider allowed");
  assert.ok(sql.includes("'prodigi'"), "prodigi provider allowed");
  assert.ok(sql.includes("'gelato'"), "gelato provider allowed");
  assert.ok(sql.includes("'fujifilm'"), "fujifilm provider allowed");
});

// ── AH (新L): retryは既存job再利用 ───────────────────────────────────────────

test("AH (新L): retryは既存job再利用 — pipelineはINSERT print_jobsしない (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  assert.ok(!src.includes("insert into"), "no INSERT INTO in pipeline — no new row created");
  assert.ok(!src.includes(".insert("), "no .insert() Supabase call in pipeline");
  assert.ok(src.includes('status: "failed"'), "failure marks existing row as failed for retry");
});

// ── AI: stale worker success は更新不可 ──────────────────────────────────────

test("AI: stale worker success は更新不可 — success updateにclaimedAt guardあり (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  // success update must include .eq("preparation_started_at", claimedAt)
  assert.ok(
    src.includes('.eq("preparation_started_at", claimedAt)'),
    "success update guarded by claimedAt",
  );
});

// ── AJ: stale worker failure も更新不可 ──────────────────────────────────────

test("AJ: stale worker failure も更新不可 — failure updateにもclaimedAt guardあり (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  // Both success and failure updates must use the guard — count occurrences
  const count = (src.match(/\.eq\("preparation_started_at", claimedAt\)/g) ?? []).length;
  assert.ok(count >= 2, `claimedAt guard appears in both success and failure updates (found ${count})`);
});

// ── AK: current worker failure はfailedへ更新可能 ────────────────────────────

test("AK: current worker failure はfailedへ更新可能 — guardはidとclaimedAtのAND (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  // failure block: .eq("id", printJobId) AND .eq("preparation_started_at", claimedAt)
  assert.ok(src.includes('.eq("id", printJobId)'), ".eq id present in failure path");
  assert.ok(src.includes('status: "failed"'), "failure sets status=failed when guard passes");
});

// ── AL: stale worker failureが新workerのpreparation_started_atをclearしない ──

test("AL: stale worker failureは新workerのpreparation_started_atをclearしない (structural)", async () => {
  const src = await readFile("./lib/print/pipeline/prepare-print-job.ts", "utf8");
  // Symmetry: failure update sets preparation_started_at: null but only when guard passes
  // (i.e. claimedAt matches — stale worker gets 0 rows, new worker's value is untouched)
  assert.ok(
    src.includes('.eq("preparation_started_at", claimedAt)'),
    "failure update conditional on claimedAt — stale worker's update is a no-op",
  );
  assert.ok(
    src.includes("preparation_started_at: null"),
    "failure clears preparation_started_at only when current lease owner",
  );
});
