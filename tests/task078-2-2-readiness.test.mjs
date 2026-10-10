import assert from "node:assert/strict";
import test from "node:test";
import { albumReadiness, summarizeAlbumPreparation, validAlbumIntent, intentFormData, nextAlbumIntentStep, boundedAlbumRecovery, ALBUM_INTENT_TTL_MS } from "../lib/album-readiness.ts";
import { readFile } from "node:fs/promises";

const intent = { id: "00000000-0000-4000-8000-000000000001", petId: "pet", petIds: ["pet"], period: "3months", periodFrom: "", periodTo: "", pageCount: 48, requestedAt: "2026-10-09T12:00:00Z", phase: "preparing" };
test("ready, pending and failure states distinguish sufficient photos from preparation", () => {
  assert.equal(albumReadiness({ total: 36, ready: 36, failed: 0, pages: 48 }).state, "ready");
  const pending = albumReadiness({ total: 32, ready: 24, failed: 0, pages: 48 });
  assert.equal(pending.state, "preparing");
  assert.equal(pending.pending, 8);
  assert.equal(albumReadiness({ total: 32, ready: 24, failed: 1, pages: 48 }).state, "action_required");
});
test("photo shortage includes exact deficit and smaller-page recovery", () => {
  const shortage = albumReadiness({ total: 17, ready: 10, failed: 0, pages: 48 });
  assert.equal(shortage.state, "shortage");
  assert.equal(shortage.missingPhotos, 7);
  assert.equal(shortage.suggestedPages, 24);
  assert.equal(albumReadiness({ total: 36, ready: 36, eligible: 17, failed: 0, pages: 48 }).state, "shortage");
});
test("preparation diagnostics classify readiness, stale inputs, missing work and progress without identifiers", () => {
  const summary = summarizeAlbumPreparation({
    requestedAt: "2026-10-10T00:00:00.000Z",
    eligibleReady: 24,
    requiredEligible: 24,
    queueStatusAvailable: true,
    photos: [
      { ready: true, failed: false, staleVersion: false, staleFingerprint: false, missingSemantic: false, missingGeometry: false, queueMissing: false, lastProgressAt: "2026-10-10T00:00:02.000Z" },
      { ready: false, failed: false, staleVersion: true, staleFingerprint: false, missingSemantic: true, missingGeometry: true, queueMissing: false, lastProgressAt: "2026-10-09T23:59:00.000Z" },
      { ready: false, failed: true, staleVersion: false, staleFingerprint: true, missingSemantic: false, missingGeometry: true, queueMissing: true, lastProgressAt: "2026-10-10T00:00:03.000Z" },
    ],
  });
  assert.deepEqual(summary, {
    totalSource: 3,
    ready: 1,
    pending: 1,
    failed: 1,
    stale: 2,
    staleVersion: 1,
    staleFingerprint: 1,
    missingSemantic: 1,
    missingGeometry: 2,
    queueMissing: 1,
    eligibleReady: 24,
    requiredEligible: 24,
    runnerWorkCount: 2,
    lastProgressAt: "2026-10-10T00:00:03.000Z",
    queueStatusAvailable: true,
  });
  assert.equal(Object.keys(summary).some((key) => /photo.?id|email|caption/i.test(key)), false);
});
test("pending intent auto-resumes only when ready and is locked during execution", () => {
  const current = { ...intent, requestedAt: new Date().toISOString() };
  const ready = albumReadiness({ total: 36, ready: 36, failed: 0, pages: 48 });
  assert.equal(nextAlbumIntentStep(current, ready, false), "generate");
  assert.equal(nextAlbumIntentStep(current, ready, true), "wait");
  assert.equal(nextAlbumIntentStep(current, { ...ready, state: "preparing" }, false), "wait");
});

test("transient failures auto-retry, permanent failures stop after three tries", async () => {
  let tries = 0;
  const waits = [];
  const result = await boundedAlbumRecovery(
    async () => {
      if (++tries < 3) throw new Error("internal");
      return "ready";
    },
    async (attempt) => {
      waits.push(attempt);
    },
  );
  assert.equal(result, "ready");
  assert.equal(tries, 3);
  assert.deepEqual(waits, [1, 2]);
  tries = 0;
  await assert.rejects(
    boundedAlbumRecovery(
      async () => {
        tries++;
        throw new Error("private");
      },
      async () => {},
    ),
    /album_recovery_exhausted/,
  );
  assert.equal(tries, 3);
});

test("ownership, frozen range, ID uniqueness and ready preflight are server enforced", async () => {
  const action = await readFile("app/(app)/pets/[petId]/album/new/actions.ts", "utf8");
  const preflight = await readFile("app/(app)/pets/[petId]/album/new/readiness-actions.ts", "utf8");
  assert.match(preflight, /auth\.getUser/);
  assert.match(preflight, /\.eq\("owner_user_id", user.id\)/);
  assert.match(preflight, /pets\?\.some\(\(?pet\)?\s*=>\s*pet\.id === petId\)/);
  assert.match(preflight, /offset \+= 200/);
  assert.match(preflight, /photo_ai_analyses/);
  assert.match(preflight, /queueStatusAvailable = false;\s*break/);
  assert.match(preflight, /console\.info\("albumPreparation", preparation\)/);
  assert.match(preflight, /summarizeAlbumPreparation/);
  assert.match(action, /id: intentId/);
  assert.match(action, /generation_intent_key/);
  assert.match(action, /albumError\?\.code === "23505"/);
  assert.match(action, /status:.*"in_progress"/);
  assert.match(action, /requestedAt,/);
  assert.doesNotMatch(action, /同期|analyzeSmartCropPhoto|OpenAI|\.download\(/);
  assert.doesNotMatch(action, /ホームで整理が終わってから/);
});

test("client reload, cancelled intent, blocked double-submit and all recoveries have actionable/mobile UI", async () => {
  const client = await readFile("app/(app)/pets/[petId]/album/new/album-create-form.tsx", "utf8");
  const recovery = await readFile("app/(app)/pets/[petId]/album/new/recovery-state.tsx", "utf8");
  assert.match(client, /sessionStorage\.setItem/);
  assert.match(client, /sessionStorage\.removeItem/);
  assert.match(client, /state.status === "complete"/);
  assert.match(client, /rememberForPhotoAdd/);
  assert.match(client, /selectSmallerPages/);
  assert.match(client, /if \(executing.current \|\| pending \|\| intent\) return/);
  assert.match(client, /validAlbumIntent/);
  assert.match(client, /resumeIntent\(intent\)/);
  assert.match(client, /ALBUM_PREPARE_MAX_POLLS/);
  assert.match(client, /写真を追加/);
  assert.match(client, /suggestedPages/);
  assert.match(client, /作成条件を変更/);
  assert.match(recovery, /role="status" aria-live="polite"/);
  assert.match(recovery, /min-h-11/);
  assert.match(recovery, /min-w-0/);
  assert.doesNotMatch(recovery, /Vision|Supabase|OpenAI|Database error/);
});

test("photo upload returns to the validated setup destination after successful save", async () => {
  const upload = await readFile("app/(app)/pets/[petId]/photos/new/photo-upload-form.tsx", "utf8");
  const page = await readFile("app/(app)/pets/[petId]/photos/new/page.tsx", "utf8");
  assert.match(page, /safeAppReturnPath\(query.returnTo\)/);
  assert.match(upload, /finalized.savedCount > 0 \? returnTo/);
  assert.match(upload, /destination.pathname/);
});
test("reload intent is bound to owner pets, route, TTL and allowed page budget", () => {
  const now = Date.parse(intent.requestedAt) + 60_000;
  assert.equal(validAlbumIntent(JSON.parse(JSON.stringify(intent)), "pet", ["pet"], now), true);
  assert.equal(validAlbumIntent(intent, "other", ["pet"], now), false);
  assert.equal(validAlbumIntent(intent, "pet", ["foreign"], now), false);
  assert.equal(validAlbumIntent(intent, "pet", ["pet"], now + ALBUM_INTENT_TTL_MS), false);
  assert.equal(validAlbumIntent({ ...intent, pageCount: 36 }, "pet", ["pet"], now), false);
  const data = intentFormData(intent);
  assert.equal(data.get("intentId"), intent.id);
  assert.deepEqual(data.getAll("petIds"), ["pet"]);
});
