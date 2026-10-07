import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PHOTO_INTAKE_CONFIG,
  albumCandidateTransition,
  derivePhotoIntakeState,
  shouldContinueIntake,
} from "../lib/photo-intake.ts";
import { selectUchinocoNowHero } from "../lib/uchinoco-now.ts";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("intake state is derived without a new database column", () => {
  assert.equal(derivePhotoIntakeState({ photoPersisted: true, mediaReady: true, queueStatus: "pending", intelligenceReady: false, albumEligible: false }), "ANALYSIS_PENDING");
  assert.equal(derivePhotoIntakeState({ photoPersisted: true, mediaReady: true, queueStatus: "completed", intelligenceReady: true, albumEligible: false }), "ANALYZED");
  assert.equal(derivePhotoIntakeState({ photoPersisted: true, mediaReady: true, queueStatus: "completed", intelligenceReady: true, albumEligible: true }), "ALBUM_ELIGIBLE");
  assert.equal(derivePhotoIntakeState({ photoPersisted: true, mediaReady: true, queueStatus: "failed", intelligenceReady: false, albumEligible: false }), "FAILED_ANALYSIS");
});

test("candidate readiness only crosses at the configured threshold", () => {
  const threshold = PHOTO_INTAKE_CONFIG.minimumAlbumPhotos;
  assert.equal(albumCandidateTransition(threshold - 2, threshold - 1).becameReady, false);
  assert.equal(albumCandidateTransition(threshold - 1, threshold).becameReady, true);
  assert.equal(albumCandidateTransition(threshold, threshold + 4).becameReady, false);
});

test("runner has a bounded work window instead of an unlimited Vision loop", () => {
  assert.equal(shouldContinueIntake(0, true), true);
  assert.equal(shouldContinueIntake(PHOTO_INTAKE_CONFIG.maxWorkItemsPerVisit, true), false);
  assert.equal(shouldContinueIntake(0, false), false);
  assert.ok(PHOTO_INTAKE_CONFIG.workWindowMs >= 60_000);
});

test("single and batch upload keep original, thumbnail and preview direct-to-storage", async () => {
  const upload = await source("app/(app)/pets/[petId]/photos/actions.ts");
  const form = await source("app/(app)/pets/[petId]/photos/new/photo-upload-form.tsx");
  assert.match(upload, /MAX_FILES = 10/);
  assert.match(upload, /thumbnailPath/);
  assert.match(upload, /previewPath/);
  assert.match(form, /uploadToSignedUrl/);
  assert.match(form, /Promise\.all/);
  assert.doesNotMatch(form, /FormData\(\).*append\([^)]*file/);
});

test("content hash rejects duplicate photos before media upload", async () => {
  const upload = await source("app/(app)/pets/[petId]/photos/actions.ts");
  assert.match(upload, /\.in\(\s*"content_hash"/);
  assert.match(upload, /existingHashes/);
  assert.match(upload, /insertError\.code === "23505"/);
});

test("persisted photo survives queue and provider failure", async () => {
  const upload = await source("app/(app)/pets/[petId]/photos/actions.ts");
  const route = await source("app/api/photo-analysis/route.ts");
  const insertAt = upload.indexOf('.from("photos")\n      .insert');
  const queueAt = upload.indexOf('.from("photo_ai_analyses").upsert');
  assert.ok(insertAt >= 0 && queueAt > insertAt);
  assert.match(upload, /Queue failure must never undo that success/);
  assert.match(route, /analysisFailed/);
  assert.match(route, /ready: false, stopped: true, waitMs: 0/);
});

test("Photo Intelligence work reuses current version and source fingerprint", async () => {
  const finder = await source("lib/photo-intake-server.ts");
  const intelligence = await source("app/(app)/dev/photo-intelligence/actions.ts");
  assert.match(finder, /PHOTO_INTELLIGENCE_VERSION/);
  assert.match(finder, /sourceFingerprint/);
  assert.match(finder, /result_status/);
  assert.match(finder, /pets\.owner_user_id/);
  assert.match(finder, /uploader_user_id/);
  assert.match(intelligence, /semanticJson\(vision, intelligence\.overallScore\)/);
});

test("semantic and intelligence stages alternate but remain server-selected", async () => {
  const route = await source("app/api/photo-analysis/route.ts");
  const runner = await source("app/(app)/_components/ai-analysis-runner.tsx");
  assert.match(route, /preferred === "intelligence"/);
  assert.match(route, /findPhotoIntelligenceWork/);
  assert.match(route, /analyzePhotoIntelligence/);
  assert.match(runner, /lastStage\.current === "semantic" \? "intelligence" : "semantic"/);
});

test("retry and concurrency reuse the existing claim fence", async () => {
  const action = await source("app/(app)/pets/[petId]/photos/[photoId]/actions.ts");
  assert.match(action, /canClaimAnalysis/);
  assert.match(action, /MAX_ANALYSIS_ATTEMPTS/);
  assert.match(action, /\.eq\("attempts", existing\.attempts\)/);
  assert.match(action, /\.eq\("updated_at", existing\.updated_at\)/);
});

test("batch refresh updates NOW and candidate state once without creating an album", async () => {
  const upload = await source("app/(app)/pets/[petId]/photos/actions.ts");
  const route = await source("app/api/photo-analysis/route.ts");
  assert.equal((upload.match(/albumCandidateTransition\(/g) ?? []).length, 1);
  assert.match(upload, /revalidatePath\("\/home"\)/);
  assert.match(route, /revalidatePath\(`\/pets\/\$\{work\.photo\.pet_id\}\/album`\)/);
  assert.doesNotMatch(upload, /\.from\("albums"\)\.(insert|update)/);
  assert.doesNotMatch(route, /\.from\("albums"\)\.(insert|update)/);
});

test("edited, accepted and ordered albums are never overwritten by intake", async () => {
  const files = await Promise.all([
    source("app/(app)/pets/[petId]/photos/actions.ts"),
    source("app/api/photo-analysis/route.ts"),
    source("lib/photo-intake-server.ts"),
  ]);
  const combined = files.join("\n");
  assert.doesNotMatch(combined, /album_draft_versions.*(insert|update)/s);
  assert.doesNotMatch(combined, /album_photos.*(insert|update)/s);
  assert.doesNotMatch(combined, /print_snapshots.*(insert|update)/s);
});

test("candidate-ready NOW context invites review instead of forced creation", () => {
  const pet = { id: "pet-a", name: "むぎ" };
  const hero = selectUchinocoNowHero({
    selectedPet: pet,
    pets: [pet],
    anniversary: null,
    readyAlbum: null,
    passiveCandidate: { petId: pet.id, title: "むぎの10月の思い出", photoCount: 12, href: "/album/candidate" },
    albumProgress: null,
    familyActivity: null,
    todayBestShot: null,
    todayLatestPhoto: null,
    fallbackPhoto: null,
    onThisDay: null,
    capturePromptAvailable: true,
    addPhotoHref: "/photos/new",
    memoriesHref: "/memories",
  });
  assert.match(hero?.title ?? "", /できています/);
  assert.equal(hero?.cta.label, "アルバムを見る");
  assert.doesNotMatch(hero?.title ?? "", /完成/);
});
