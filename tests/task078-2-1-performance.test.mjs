import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { storedGenerationInputs, loadStoredGenerationInputs } from "../lib/album-generation/stored-inputs.ts";
import { GENERATION_PHASES, generationPerformance } from "../lib/album-generation/performance.ts";
import { sourceFingerprint } from "../lib/photo-analysis/fingerprint.ts";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "../lib/photo-analysis/constants.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../lib/photo-intelligence/config.ts";
import { buildSceneGroups } from "../lib/photo-grouping/group.ts";
import { selectBestShot } from "../lib/best-shot/select.ts";
import { planEditorialAlbum, buildEditorialDraft } from "../lib/album-draft/editorial.ts";
import { parseStoredTechnical } from "../lib/photo-analysis/stored.ts";

function fixture(count) {
  const photos = Array.from({ length: count }, (_, index) => ({
    id: `photo-${index}`,
    pet_id: `pet-${index % 2}`,
    storage_path: `owner/pet/photo-${index}.jpg`,
    content_hash: null,
    updated_at: "2026-10-09T00:00:00Z",
    taken_at: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
    created_at: "2026-10-09T00:00:00Z",
  }));
  const technical = { technicalQuality: 90, parts: { blur: 90, sharpness: 92, exposure: 90, contrast: 90, noise: 90, resolution: 90 }, signals: { width: 1200, height: 1600, readable: true, pixelsKnown: true, meanLuma: 0.5, lumaStd: 0.2, laplacianVar: 0.08, neighborDiff: 0.1 }, flags: [] };
  const rows = photos.flatMap((photo) => [
    {
      photo_id: photo.id,
      analysis_type: PHOTO_INTELLIGENCE_SEMANTIC,
      analysis_version: PHOTO_INTELLIGENCE_VERSION,
      source_fingerprint: sourceFingerprint(photo),
      result_status: "success",
      result: {
        expressionScore: 90,
        uniquenessScore: 90,
        memoryValueScore: 90,
        confidence: 0.95,
        scene: "home",
        petActivity: "playing",
        moment: "portrait",
        season: "summer",
        expressionTags: [],
        memoryTags: [],
        petPresent: true,
        peoplePresent: false,
        eyesVisible: true,
        reason: "fixture",
        technical,
      },
    },
    {
      photo_id: photo.id,
      analysis_type: SUBJECT_GEOMETRY,
      analysis_version: SUBJECT_GEOMETRY_VERSION,
      source_fingerprint: sourceFingerprint(photo),
      result_status: "success",
      result: {
        width: 1200,
        height: 1600,
        orientation: "portrait",
        focalPoint: { x: 0.5, y: 0.4 },
        pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }],
        analysisConfidence: { petDetection: 0.95 },
      },
    },
  ]);
  return { photos, rows, technical };
}

test("stored input validates versions/fingerprints, supports legacy and terminal fallback without image I/O", () => {
  const { photos, rows } = fixture(36);
  const ready = storedGenerationInputs(photos, rows);
  assert.equal(ready.grouping.length, 36);
  assert.equal(ready.missingIntelligenceCount, 0);
  assert.equal(ready.missingGeometryCount, 0);
  assert.equal(ready.legacyTechnicalFallbackCount, 0);
  assert.equal(ready.sharpness.get(photos[35].id), 92);
  rows[0].source_fingerprint = "stale";
  rows[3].analysis_version = "old";
  const stale = storedGenerationInputs(photos, rows);
  assert.equal(stale.missingIntelligenceCount, 1);
  assert.equal(stale.missingGeometryCount, 1);
  assert.equal(stale.missingSemanticCount, 1);
  assert.equal(stale.staleFingerprintCount, 1);
  assert.equal(stale.staleVersionCount, 1);
  rows[0].source_fingerprint = sourceFingerprint(photos[0]);
  rows[0].result_status = "fallback";
  rows[0].result = { reason: "vision_failed" };
  const fallback = storedGenerationInputs(photos, rows);
  assert.equal(fallback.missingIntelligenceCount, 0);
  assert.equal(fallback.legacyTechnicalFallbackCount, 1);
  assert.ok(fallback.grouping[0].intelligence.warnings.includes("VISION_ANALYSIS_FAILED"));
});

test("analysis metadata uses 200-photo batches with no storage or API dependency and safe query failure", async () => {
  const { photos, rows } = fixture(451);
  const sizes = [];
  const client = {
    from(name) {
      assert.equal(name, "photo_analysis_results");
      let selectedIds = [];
      return {
        select() {
          return this;
        },
        in(field, values) {
          if (field === "photo_id") {
            selectedIds = values;
            sizes.push(values.length);
            return this;
          }
          return Promise.resolve({ error: null, data: rows.filter((row) => selectedIds.includes(row.photo_id)) });
        },
      };
    },
  };
  const result = await loadStoredGenerationInputs(client, photos);
  assert.deepEqual(sizes, [200, 200, 51]);
  assert.equal(result.metadataQueryCount, 3);
  assert.equal(result.grouping.length, 451);
  const failing = {
    from() {
      return {
        select() {
          return this;
        },
        in(field) {
          return field === "photo_id" ? this : Promise.resolve({ error: { message: "private error" }, data: null });
        },
      };
    },
  };
  await assert.rejects(loadStoredGenerationInputs(failing, photos), /^Error: stored_analysis_unavailable$/);
});

test("technical snapshots reject malformed parts, flags and signals", () => {
  const { technical } = fixture(1);
  assert.deepEqual(parseStoredTechnical(technical), technical);
  assert.equal(parseStoredTechnical({ ...technical, parts: { sharpness: 92 } }), null);
  assert.equal(parseStoredTechnical({ ...technical, flags: ["unknown"] }), null);
  assert.equal(parseStoredTechnical({ ...technical, technicalQuality: Infinity }), null);
});

test("all sixteen phases have safe duration/count records, aborted phases close once and persistence has margin", () => {
  let clock = 0;
  const records = [];
  const timing = generationPerformance(
    (record) => records.push(record),
    () => clock,
  );
  timing.counts({ eligiblePhotoCount: 28, selectedSourcePhotoCount: 24, existingIntelligenceCount: 24, missingIntelligenceCount: 4, cropAnalysisRequiredCount: 4, layoutPlanningSpreadCount: 24, metadataQueryCount: 1, legacyTechnicalFallbackCount: 0, failedAnalysisCount: 4, eligibleReady: 24, requiredEligible: 24, excludedFailedCount: 4, proceededWithFailedExcluded: true, queueQueryCount: 1, queueStatusAvailable: true });
  const spreadDiagnostics = Array.from({ length: 12 }, (_, spreadIndex) => ({
    spreadIndex,
    photoCount: spreadIndex % 3 + 1,
    outcome: spreadIndex === 3 ? "recovered" : spreadIndex < 5 ? "unrecovered" : "not_needed",
    initialCandidateCount: 6,
    strictCandidateCount: spreadIndex === 3 ? 1 : 0,
    fallbackCandidateCount: spreadIndex === 3 ? 3 : 2,
    safeFallbackCandidateCount: spreadIndex < 5 ? 3 : 0,
    reassignmentCandidateCount: spreadIndex < 5 ? 1 : 0,
    replacementCandidateCount: spreadIndex < 5 ? 1 : 0,
      recoveryReached: spreadIndex === 3 ? "safe_fallback" : spreadIndex < 5 ? "density_fallback" : "initial",
      recoveryStagesReached: spreadIndex === 3 ? ["initial", "template_fallback", "safe_fallback"] : spreadIndex < 5 ? ["initial", "template_fallback", "safe_fallback", "role_reassignment", "best_shot_replacement", "density_fallback", "adjacent_reflow"] : ["initial"],
    replacementAvailable: spreadIndex < 5,
    failureReasonCounts: spreadIndex < 5 ? { cropUnsafe: 4, sourceSubjectAlreadyClipped: spreadIndex % 2 } : {},
  }));
  timing.layoutRecovery({ spreadCount: 12, initialUnsafeSpreadCount: 5, templateFallbackAttemptCount: 10, templateFallbackCount: 1, safeFallbackAttemptCount: 15, photoReassignmentAttemptCount: 3, photoReassignmentCount: 1, bestShotReplacementAttemptCount: 2, bestShotReplacementCount: 1, densityFallbackAttemptCount: 1, densityFallbackCount: 1, adjacentReflowAttemptCount: 1, adjacentReflowCount: 1, safeFallbackUsedCount: 1, unrecoveredCount: 4, failureReasonCounts: { cropUnsafe: 12, sourceSubjectAlreadyClipped: 3, noReplacementCandidate: 2 }, spreadDiagnostics });
  const capacityLog = records[0];
  assert.equal(capacityLog.eligibleReady, 24);
  assert.equal(capacityLog.requiredEligible, 24);
  assert.equal(capacityLog.excludedFailedCount, 4);
  assert.equal(capacityLog.proceededWithFailedExcluded, true);
  assert.equal(Object.keys(capacityLog).some((key) => /photo.?id|email|caption/i.test(key)), false);
  const recoveryLog = records[1];
  assert.equal(recoveryLog.event, "layout_recovery");
  assert.equal(recoveryLog.initialUnsafeSpreadCount, 5);
  assert.equal(recoveryLog.templateFallbackAttemptCount, 10);
  assert.equal(recoveryLog.templateFallbackCount, 1);
  assert.equal(recoveryLog.safeFallbackUsedCount, 1);
  assert.equal(recoveryLog.safeFallbackAttemptCount, 15);
  assert.equal(recoveryLog.spreadDiagnostics[3].recoveryReached, "safe_fallback");
  assert.deepEqual(recoveryLog.spreadDiagnostics[3].recoveryStagesReached, ["initial", "template_fallback", "safe_fallback"]);
  assert.equal(recoveryLog.spreadDiagnostics.length, 12);
  assert.equal(recoveryLog.spreadDiagnostics.filter((spread) => spread.outcome === "unrecovered").length, 4);
  assert.equal(Object.keys(recoveryLog.spreadDiagnostics[0]).some((key) => /photo.?id|user.?id|album.?id/i.test(key)), false);
  assert.equal(recoveryLog.unrecoveredCount, 4);
  assert.equal(Object.keys(recoveryLog).some((key) => /photo.?id|email|caption/i.test(key)), false);
  for (const phase of GENERATION_PHASES) {
    timing.start(phase, 36);
    clock += 10;
    timing.end(phase, 36);
  }
  clock = 80_000;
  assert.equal(timing.budgetExceeded(), true);
  timing.start("09_layout_planning", 24);
  timing.finish("analysis_pending");
  timing.finish("failed");
  assert.equal(records.filter((record) => record.event === "finished").length, 1);
  assert.equal(records.filter((record) => record.event === "completed").length, 16);
  assert.equal(records.at(-2).event, "aborted");
  assert.ok(records.every((record) => !Object.keys(record).some((key) => /caption|url|secret|image|email/i.test(key))));
});

test("36 stored photos / all two pets / 48P complete bounded CPU planning without Vision", (context) => {
  const { photos, rows } = fixture(36);
  const durations = {};
  let start = performance.now();
  const inputs = storedGenerationInputs(photos, rows);
  durations.analysis = performance.now() - start;
  start = performance.now();
  const groups = ["pet-0", "pet-1"].flatMap((petId) => buildSceneGroups(inputs.grouping.filter((photo) => photos.find((row) => row.id === photo.photoId).pet_id === petId)));
  durations.grouping = performance.now() - start;
  start = performance.now();
  const ranked = groups.flatMap((group) => {
    const selection = selectBestShot(
      { id: group.id, scene: group.scene, activity: group.activity, tags: group.tags, groupConfidence: group.groupConfidence, warnings: group.warnings, visualSimilarity: {} },
      group.members.map((member) => ({ photoId: member.photoId, intelligence: inputs.grouping.find((photo) => photo.photoId === member.photoId).intelligence, relativeUniqueness: member.relativeUniqueness, sharpness: inputs.sharpness.get(member.photoId) })),
    );
    return selection.ranking.map((candidate) => ({ photoId: candidate.photoId, petId: photos.find((photo) => photo.id === candidate.photoId).pet_id, groupId: group.id, timeline: group.startedAt, candidate, confidence: selection.confidence }));
  });
  durations.bestShot = performance.now() - start;
  start = performance.now();
  const plan = planEditorialAlbum(ranked, 48);
  const text = Object.fromEntries(plan.spreads.filter((story) => story.photoIds.length === 1).map((story) => [story.id, "2026年8月"]));
  let rhythmStart;
  const draft = buildEditorialDraft(
    plan.spreads,
    plan.selected.map((photo) => ({ photoId: photo.photoId, analysis: inputs.geometry.get(photo.photoId), imageUrl: "fixture", previewUrl: "fixture", bestShot: { candidate: photo.candidate, confidence: photo.confidence }, captionAvailable: true })),
    text,
    (event) => {
      if (event === "started") rhythmStart = performance.now();
      else durations.rhythm = performance.now() - rhythmStart;
    },
  );
  durations.layoutIncludingRhythm = performance.now() - start;
  assert.equal(draft.spreads.length, 24);
  assert.ok(!draft.audit.issues.some((issue) => issue.blocking));
  assert.ok(draft.performance.cropReusedCount > 0);
  assert.ok(draft.performance.cropItemCount > 0);
  context.diagnostic(JSON.stringify({ fixture: "synthetic_36_photos_48P", durationsMs: durations, ...draft.performance }));
});

test("creation has no synchronous analysis/Vision and keeps ownership, metadata, preview and 120s limit", async () => {
  const action = await readFile("app/(app)/pets/[petId]/album/new/actions.ts", "utf8");
  assert.doesNotMatch(action, /analyzeSmartCropPhoto|selectPetBestShots|OpenAI|\.download\(/);
  assert.match(action, /loadStoredGenerationInputs/);
  assert.match(action, /\.eq\("uploader_user_id", user.id\)/);
  assert.match(action, /\.eq\("owner_user_id", user.id\)/);
  assert.ok(action.indexOf("inputs.missingIntelligenceCount || inputs.missingGeometryCount") < action.indexOf("// Insert album"));
  for (const key of ["requested_body_pages", "selected_pet_ids", "rhythm_audit", "generation_photo_ids"]) assert.ok(action.includes(key));
  assert.match(action, /\?view=preview/);
  const page = await readFile("app/(app)/pets/[petId]/album/new/page.tsx", "utf8");
  assert.match(page, /maxDuration = 120/);
});
