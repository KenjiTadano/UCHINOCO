import assert from "node:assert/strict";
import test from "node:test";
import { albumReadiness, albumIntentMatchesSetup, summarizeAlbumPreparation, validAlbumIntent, intentFormData, nextAlbumIntentStep, shouldAutoResumeAlbum, boundedAlbumRecovery, ALBUM_INTENT_TTL_MS } from "../lib/album-readiness.ts";
import { albumCapacities, albumCapacityState, initialAlbumPageCount, recommendAlbumPageCount, requiredEligiblePhotos } from "../lib/album-capacity.ts";
import { readFile } from "node:fs/promises";

const intent = { id: "00000000-0000-4000-8000-000000000001", petId: "pet", petIds: ["pet"], period: "3months", periodFrom: "", periodTo: "", pageCount: 48, requestedAt: "2026-10-09T12:00:00Z", phase: "preparing" };
test("eligible threshold controls readiness even while other source photos failed", () => {
  const ready = albumReadiness({ total: 28, ready: 24, pending: 0, eligible: 24, pages: 48 });
  assert.equal(ready.state, "ready");
  assert.equal(ready.failed, undefined);
  assert.equal(ready.eligibleReady, 24);
  const pending = albumReadiness({ total: 24, ready: 20, pending: 4, eligible: 20, pages: 48 });
  assert.equal(pending.state, "preparing");
  assert.equal(pending.pending, 4);
  const shortage = albumReadiness({ total: 24, ready: 20, pending: 0, eligible: 20, pages: 48 });
  assert.equal(shortage.state, "shortage");
  assert.equal(shortage.missingPhotos, 4);
  assert.equal(albumCapacityState(24, 24, 4), "ready");
  assert.equal(albumCapacityState(20, 24, 4), "preparing");
  assert.equal(albumCapacityState(20, 24, 0), "shortage");
});
test("server readiness uses ranked quality-eligible candidates without waiting for all sources", async () => {
  const source = await readFile("app/(app)/pets/[petId]/album/new/readiness-actions.ts", "utf8");
  assert.match(source, /const eligibleReady = new Set\(rankStoredAlbumInputs\(inputs, photos, setup\.petIds\)/);
  assert.match(source, /ready, pending: preparation\.pending, pages: setup\.pageCount, eligible: eligibleReady/);
  assert.match(source, /requiredEligiblePhotos\(setup\.pageCount\)/);
  assert.doesNotMatch(source, /ready === photos\.length/);
});
test("capacity thresholds and recommendation share one exact page-count model", () => {
  assert.deepEqual([24, 48, 72].map((pages) => requiredEligiblePhotos(pages)), [12, 24, 36]);
  assert.equal(recommendAlbumPageCount(11), null);
  assert.equal(recommendAlbumPageCount(12), 24);
  assert.equal(recommendAlbumPageCount(23), 24);
  assert.equal(recommendAlbumPageCount(24), 48);
  assert.equal(recommendAlbumPageCount(35), 48);
  assert.equal(recommendAlbumPageCount(36), 72);
  assert.equal(recommendAlbumPageCount(40), 72);
  assert.deepEqual(albumCapacities(40).map((capacity) => capacity.available), [true, true, true]);
  assert.equal(initialAlbumPageCount(48, 72, false), 72);
  assert.equal(initialAlbumPageCount(48, 72, true), 48);
  assert.equal(initialAlbumPageCount(48, null, false), 48);
});
test("photo shortage includes exact deficit and smaller-page recovery", () => {
  const shortage = albumReadiness({ total: 17, ready: 10, pending: 0, eligible: 10, pages: 48 });
  assert.equal(shortage.state, "shortage");
  assert.equal(shortage.missingPhotos, 14);
  assert.equal(shortage.suggestedPages, null);
  assert.equal(albumReadiness({ total: 36, ready: 36, pending: 0, eligible: 17, pages: 48 }).state, "shortage");
  const pageFallback = albumReadiness({ total: 28, ready: 28, pending: 0, eligible: 28, pages: 72 });
  assert.equal(pageFallback.missingPhotos, 8);
  assert.equal(pageFallback.suggestedPages, 48);
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
  const ready = albumReadiness({ total: 36, ready: 36, pending: 0, eligible: 36, pages: 48 });
  assert.equal(nextAlbumIntentStep(current, ready, false), "generate");
  assert.equal(nextAlbumIntentStep(current, ready, true), "wait");
  assert.equal(nextAlbumIntentStep(current, { ...ready, state: "preparing" }, false), "wait");
});
test("ready transition auto-resumes valid creation intents exactly at eligible capacity", () => {
  const current = { ...intent, requestedAt: new Date().toISOString(), pageCount: 24 };
  const ready = albumReadiness({ total: 28, ready: 24, pending: 0, eligible: 24, pages: 24 });
  const eligible = { intentPresent: true, intentValid: true, readiness: ready, generationRunning: false };
  assert.equal(ready.required, 12);
  assert.equal(shouldAutoResumeAlbum(eligible), true);
  assert.equal(shouldAutoResumeAlbum({ ...eligible, generationRunning: true }), false);
  assert.equal(shouldAutoResumeAlbum({ ...eligible, intentPresent: false }), false);
  assert.equal(shouldAutoResumeAlbum({ ...eligible, intentValid: false }), false);
  assert.equal(shouldAutoResumeAlbum({ ...eligible, readiness: { ...ready, eligibleReady: 11 } }), false);
  assert.equal(current.phase, "preparing");
});
test("auto-resume rejects stale settings and accepts the restored frozen setup", () => {
  const current = { ...intent, requestedAt: new Date().toISOString() };
  const setup = { petId: "pet", petIds: ["pet"], period: "3months", pageCount: 48, periodFrom: "", periodTo: "" };
  assert.equal(albumIntentMatchesSetup(current, setup), true);
  assert.equal(albumIntentMatchesSetup(current, { ...setup, pageCount: 24 }), false);
  assert.equal(albumIntentMatchesSetup(current, { ...setup, period: "6months" }), false);
  assert.equal(albumIntentMatchesSetup(current, { ...setup, petIds: ["other"] }), false);
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
  assert.match(preflight, /isTerminalAnalysisFailure/);
  assert.match(preflight, /queueStatusAvailable = false;\s*break/);
  assert.match(preflight, /console\.info\("albumPreparation", preparation\)/);
  assert.match(preflight, /summarizeAlbumPreparation/);
  assert.match(action, /id: intentId/);
  assert.match(action, /generation_intent_key/);
  assert.match(action, /albumError\?\.code === "23505"/);
  assert.match(action, /metadata\?\.generation_intent_key === intentKey && cover/);
  assert.match(action, /status: "complete", previewHref:/);
  assert.match(action, /status:.*"in_progress"/);
  assert.match(action, /requestedAt,/);
  assert.match(action, /albumCapacityState\(eligibleReady, requiredEligible, pendingSourceCount\)/);
  assert.match(action, /excludedFailedCount/);
  assert.match(action, /proceededWithFailedExcluded/);
  assert.match(action, /console\.info\("albumAutoResume", input\)/);
  assert.match(action, /autoResumeTriggered = formData\.get\("autoResumeTriggered"\)/);
  assert.match(action, /duplicateSuppressed: status === "in_progress"/);
  assert.match(action, /generationCompleted: true/);
  const autoResumeLogger = action.match(/function logAlbumAutoResume\(input: \{[\s\S]*?\}\) \{\s*console\.info\("albumAutoResume", input\);\s*\}/)?.[0] ?? "";
  assert.ok(autoResumeLogger);
  assert.doesNotMatch(autoResumeLogger, /albumId|photoId|userId/);
  assert.doesNotMatch(action, /if \(inputs\.missingIntelligenceCount \|\| inputs\.missingGeometryCount\)/);
  assert.doesNotMatch(action, /同期|analyzeSmartCropPhoto|OpenAI|\.download\(/);
  assert.doesNotMatch(action, /ホームで整理が終わってから/);
});

test("client reload, cancelled intent, blocked double-submit and all recoveries have actionable/mobile UI", async () => {
  const client = await readFile("app/(app)/pets/[petId]/album/new/album-create-form.tsx", "utf8");
  const recovery = await readFile("app/(app)/pets/[petId]/album/new/recovery-state.tsx", "utf8");
  assert.match(client, /sessionStorage\.setItem/);
  assert.match(client, /sessionStorage\.removeItem/);
  assert.match(client, /state.status === "complete"/);
  assert.match(client, /router\.replace\(state\.previewHref\)/);
  assert.match(client, /state.status === "in_progress" \? 60_000/);
  assert.match(client, /setTimeout\(\(\) => beginGeneration\(intent\), delay\)/);
  assert.match(client, /rememberForPhotoAdd/);
  assert.match(client, /selectSmallerPages/);
  assert.match(client, /observeReadyIntent\(intent, readiness\)/);
  assert.match(client, /shouldAutoResumeAlbum/);
  assert.match(client, /albumIntentMatchesSetup/);
  assert.match(client, /form\.set\("autoResumeTriggered"/);
  assert.match(client, /console\.info\("albumAutoResume"/);
  assert.match(client, /intent\?\.phase === "generating" \|\| intent && readiness\?\.state === "ready"/);
  assert.doesNotMatch(client, /resumeIntent\(intent\)/);
  assert.match(client, /if \(executing.current \|\| pending \|\| intent\) return/);
  assert.match(client, /validAlbumIntent/);
  assert.match(client, /observeReadyIntent\(intent, readiness\)/);
  assert.match(client, /ALBUM_PREPARE_MAX_POLLS/);
  assert.match(client, /写真を追加/);
  assert.match(client, /suggestedPages/);
  assert.match(client, /ALBUM_PAGE_COUNTS\.map/);
  assert.match(client, /initialAlbumPageCount/);
  assert.match(client, /manualPageSelection\.current = true/);
  assert.doesNotMatch(client, /pageCount \/ 2/);
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
