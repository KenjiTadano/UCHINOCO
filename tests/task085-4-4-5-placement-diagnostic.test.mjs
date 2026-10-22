import test from "node:test";
import assert from "node:assert/strict";
import { newPlacementTrace, placementMeasuredFetch } from "../lib/placement-diagnostic-core.ts";

test("placement diagnostic forwards authenticated requests and response unchanged", async () => {
  const trace = newPlacementTrace("sin1");
  const input = new Request("https://synthetic.invalid/auth/v1/user");
  const init = { headers: { authorization: "SYNTHETIC_PRIVATE_SENTINEL" } };
  const response = new Response("SYNTHETIC_PRIVATE_SENTINEL");
  const wrapped = placementMeasuredFetch(trace, "https://synthetic.invalid", async (actualInput, actualInit) => {
    assert.equal(actualInput, input); assert.equal(actualInit, init); return response;
  });
  assert.equal(await wrapped(input, init), response);
  assert.equal(trace.auth.count, 1);
  assert.equal(JSON.stringify(trace).includes("SYNTHETIC_PRIVATE_SENTINEL"), false);
  assert.equal(JSON.stringify(trace).includes("synthetic.invalid"), false);
});
test("placement diagnostic counts independent categories without accepting another origin", async () => {
  const trace = newPlacementTrace("iad1");
  const wrapped = placementMeasuredFetch(trace, "https://synthetic.invalid", async () => new Response());
  await Promise.all([wrapped("https://synthetic.invalid/rest/v1/photos?private=1"), wrapped("https://synthetic.invalid/storage/v1/object/private"), wrapped("https://other.invalid/auth/v1/user")]);
  assert.equal(trace.auth.count, 0); assert.equal(trace.db.count, 1); assert.equal(trace.storage.count, 1);
});
test("placement diagnostic preserves failures without serializing errors or private input", async () => {
  const trace = newPlacementTrace("sin1"); const error = new Error("SYNTHETIC_PRIVATE_SENTINEL");
  const wrapped = placementMeasuredFetch(trace, "https://synthetic.invalid", async () => { throw error; });
  await assert.rejects(wrapped("https://synthetic.invalid/storage/v1/private?token=synthetic"), e => e === error);
  assert.equal(trace.storage.count, 1); assert.equal(JSON.stringify(trace).includes("token"), false);
});
test("placement counters are isolated and region is bounded", () => {
  const a = newPlacementTrace("sin1"); const b = newPlacementTrace("iad1"); a.db.count++;
  assert.equal(b.db.count, 0); assert.equal(newPlacementTrace("sin1 PRIVATE").runtimeRegion, "unknown");
});
