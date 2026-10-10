import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canClaimAnalysis, hasScheduledAnalysisRetry } from "../lib/photo-analysis-policy.ts";

const queue = readFileSync(new URL("../lib/photo-analysis-queue.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/photo-analysis/route.ts", import.meta.url), "utf8");

test("queue lookup does not use a comma-nested PostgREST or() filter", () => {
  assert.equal(queue.includes("error_code.not.in"), false);
  assert.match(queue, /canClaimAnalysis/);
  assert.match(queue, /status\.eq\.pending,status\.eq\.failed,status\.eq\.processing/);
});

test("photo-analysis GET does not answer 503 when the queue cannot be read", () => {
  assert.equal(route.includes(", 503"), false);
  assert.match(route, /ready: false, stopped: true, waitMs: 0/);
  assert.match(route, /return \{ work: null, waitMs \}/);
  assert.match(route, /waitMs: next\.waitMs/);
});

test("a failed analysis is not claimed again until the retry delay", () => {
  const now = Date.parse("2026-09-28T00:10:00.000Z");
  const recent = {
    status: "failed",
    attempts: 1,
    updated_at: "2026-09-28T00:09:30.000Z",
    error_code: null,
  };
  assert.equal(canClaimAnalysis(recent, now), false);
  assert.equal(canClaimAnalysis({
    ...recent,
    updated_at: "2026-09-28T00:08:00.000Z",
  }, now), true);
  assert.equal(canClaimAnalysis({
    status: "failed",
    attempts: 1,
    updated_at: "2026-09-28T00:00:00.000Z",
    error_code: "storage_missing",
  }, now), false);
});

test("only recoverable failed or processing work keeps the runner waiting", () => {
  assert.equal(hasScheduledAnalysisRetry({ status: "failed", attempts: 1 }), true);
  assert.equal(hasScheduledAnalysisRetry({ status: "processing", attempts: 2 }), true);
  assert.equal(hasScheduledAnalysisRetry({ status: "failed", attempts: 3 }), false);
  assert.equal(hasScheduledAnalysisRetry({ status: "failed", attempts: 1, error_code: "storage_missing" }), false);
  assert.equal(hasScheduledAnalysisRetry({ status: "completed", attempts: 1 }), false);
});
