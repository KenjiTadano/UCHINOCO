import { createClient } from "@supabase/supabase-js";
import { buildSpreadDraft } from "../lib/album-draft/draft.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { planEditorialAlbum, buildEditorialDraft, EditorialGenerationError } from "../lib/album-draft/editorial.ts";
import { planEditorialAlbumWithSubset, identifyUnsafeSpreadRemovals, scorePhotoQualityAndSuitability, searchSafePhotoSubset, safeSubsetScope, safeSubsetBaseTokens, previousSafeSubset, snapshotSafeSubset, MAX_SUBSET_SEARCH_ATTEMPTS, loadPreviousSafeSubset } from "../lib/album-draft/selection.ts";

function candidate(id, rank, score, technical = 90) {
  return {
    photoId: id,
    rank,
    role: "primary",
    scores: {
      overall: score,
      technical,
      photoIntelligence: 80,
      expression: 80,
      petVisibility: 80,
      composition: 80,
      memoryValue: 80,
      relativeUniqueness: 80,
      sharpness: 80,
      duplicationPenalty: 0,
      sceneRepresentativeness: 80,
    },
  };
}

function photo(id, index, score, petId = "pet-0") {
  return {
    photoId: id,
    petId,
    groupId: `scene-${Math.floor(index / 2)}`,
    timeline: new Date(Date.UTC(2026, 7, index + 1, 10, 0, 0)).toISOString(),
    candidate: candidate(id, 1, score),
    confidence: 90,
    scene: "living_room",
    activity: "resting",
  };
}

function layoutPhoto(p, analysisOverride) {
  return {
    photoId: p.photoId,
    petId: p.petId,
    timeline: p.timeline,
    groupId: p.groupId,
    scene: p.scene,
    activity: p.activity,
    imageUrl: "https://example.com/orig",
    previewUrl: "https://example.com/prev",
    bestShot: { candidate: p.candidate, confidence: 90 },
    analysis: {
      width: 1200,
      height: 1600,
      orientation: "portrait",
      focalPoint: { x: 0.5, y: 0.4 },
      pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }],
      analysisConfidence: { petDetection: 0.95 },
      ...analysisOverride,
    },
  };
}

test("scorePhotoQualityAndSuitability penalizes source clipping and unsafe layoutSuitability", () => {
  const p = photo("p-1", 1, 90);
  const safeAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [{ bbox: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, confidence: 0.9 }],
    analysisConfidence: { petDetection: 0.9 },
  };
  const clippedAnalysis = {
    width: 1000,
    height: 1000,
    orientation: "square",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [{ bbox: { x: 0.001, y: 0.001, width: 0.5, height: 0.5 }, confidence: 0.9 }],
    analysisConfidence: { petDetection: 0.9 },
  };

  const mapSafe = new Map([["p-1", safeAnalysis]]);
  const mapClipped = new Map([["p-1", clippedAnalysis]]);

  const scoreSafe = scorePhotoQualityAndSuitability(p, mapSafe);
  const scoreClipped = scorePhotoQualityAndSuitability(p, mapClipped);

  assert.ok(scoreSafe > scoreClipped, "Safe photo must score higher than clipped photo");
  assert.equal(scoreSafe - scoreClipped, 35, "Clipped photo receives a 35-point penalty");
});

test("identifyUnsafeSpreadRemovals identifies lowest suitability photo in a multi-photo spread", () => {
  const p1 = photo("p-good", 1, 95);
  const p2 = photo("p-bad", 2, 70);
  const story = {
    id: "story-1",
    sceneIds: ["s1"],
    photoIds: [p1.photoId, p2.photoId],
    primaryPhotoIds: [p1.photoId],
    secondaryPhotoIds: [p2.photoId],
    startedAt: p1.timeline,
    endedAt: p2.timeline,
    storyType: "sequence",
    coherenceScore: 90,
    importance: 90,
    recommendedDensity: "medium",
    warnings: [],
    analysisVersion: "1.0",
  };

  const photoMap = new Map([
    [p1.photoId, p1],
    [p2.photoId, p2],
  ]);
  const removable = identifyUnsafeSpreadRemovals(story, photoMap);
  assert.equal(removable.length, 2);
  assert.equal(removable[0].photoId, "p-bad", "Lowest score photo must be first removal candidate");
});

const scope = safeSubsetScope({ petIds: ["pet-0"], pageCount: 24, period: "fixture" });
function geometryFor(photos, clippedIds = []) {
  return new Map(photos.map((p) => [p.photoId, layoutPhoto(p, clippedIds.includes(p.photoId) ? { pets: [{ bbox: { x: 0, y: 0, width: 0.5, height: 0.5 }, confidence: 0.95 }] } : {}).analysis]));
}
function evaluatePlan(plan, geometry) {
  return buildEditorialDraft(plan.spreads, plan.selected.map((p) => layoutPhoto(p, geometry.get(p.photoId))), Object.fromEntries(plan.spreads.map((s) => [s.id, "Caption"])), undefined, {}, {}, 12, geometry.size, {}, undefined, plan.preservedLayouts);
}
async function generation(photos, geometry, snapshot, budgetExceeded = () => false) {
  const plan = planEditorialAlbum(photos, 24);
  let initialError;
  try {
    return { editorial: evaluatePlan(plan, geometry), diagnostics: null };
  } catch (error) {
    assert.ok(error instanceof EditorialGenerationError);
    initialError = error;
  }
  const tokens = safeSubsetBaseTokens(photos, geometry);
  const result = await searchSafePhotoSubset({ photos, geometry, pageCount: 24, unsafeStories: initialError.currentStories.filter((_, i) => initialError.unrecoveredSpreadIndices.includes(i)), initialUnrecoveredCount: initialError.recoveryStats.unrecoveredCount, currentSelectedCount: initialError.selectedPhotoIds?.length ?? plan.selected.length, previous: previousSafeSubset(snapshot, scope, tokens, 24), budgetExceeded, evaluate: async (candidate) => evaluatePlan(candidate, geometry) });
  return { ...result, initialError };
}

test("Case A: real 23 -> raw unsafe 24 -> automatic safe subset, without explicit exclusions", async () => {
  const base = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 10)));
  const before = await generation(base, geometryFor(base));
  assert.equal(before.editorial.recovery.unrecoveredCount, 0);
  const snapshot = snapshotSafeSubset(scope, safeSubsetBaseTokens(base, geometryFor(base)), before.editorial, base);
  const pool = [...base, photo("new-clipped", -1, 99)];
  const geometry = geometryFor(pool, ["new-clipped"]);
  assert.throws(() => evaluatePlan(planEditorialAlbum(pool, 24), geometry), (e) => e instanceof EditorialGenerationError && e.unrecoveredSpreadIndices.length > 0);
  const after = await generation(pool, geometry, snapshot);
  assert.equal(after.editorial.recovery.unrecoveredCount, 0);
  assert.ok(!after.editorial.selectedPhotoIds.includes("new-clipped"));
  assert.equal(after.diagnostics.eligiblePhotoCount, 24);
  assert.equal(after.diagnostics.selectedPhotoCount, after.editorial.selectedPhotoIds.length);
  assert.equal(after.diagnostics.unusedPhotoCount, 24 - after.editorial.selectedPhotoIds.length);
  assert.ok(after.diagnostics.subsetAttemptCount <= MAX_SUBSET_SEARCH_ATTEMPTS);
  assert.equal(after.diagnostics.finalUnrecoveredCount, 0);
  assert.ok(after.diagnostics.subsetDurationMs >= 0);
  console.info("task081SubsetBenchmark", { candidateCount: after.diagnostics.subsetCandidateCount, attemptCount: after.diagnostics.subsetAttemptCount, durationMs: after.diagnostics.subsetDurationMs });
});

test("Case B: automatic selection retains good new photo and leaves existing low suitability unused", async () => {
  const base = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, i === 0 ? 30 : 80 + (i % 10)));
  const before = await generation(base, geometryFor(base, ["p-0"]));
  assert.equal(before.editorial.recovery.unrecoveredCount, 0);
  const pool = [...base, photo("new-hero", 24, 99)];
  const after = await generation(pool, geometryFor(pool, ["p-0"]));
  assert.ok(after.diagnostics, "automatic subset path must execute");
  assert.equal(after.editorial.recovery.unrecoveredCount, 0);
  assert.ok(after.editorial.selectedPhotoIds.includes("new-hero"));
  assert.ok(!after.editorial.selectedPhotoIds.includes("p-0"));
});

test("generation/subset path is deterministic across repeated and concurrent calls", async () => {
  const pool = [...Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 10))), photo("new-clipped", -1, 99)];
  const geometry = geometryFor(pool, ["new-clipped"]);
  const summarize = (r) => ({ ids: r.editorial.selectedPhotoIds, stories: r.editorial.stories, selected: r.diagnostics.selectedPhotoCount, unused: r.diagnostics.unusedPhotoCount, attempts: r.diagnostics.subsetAttemptCount, unrecovered: r.editorial.recovery.unrecoveredCount });
  const a = await generation(pool, geometry);
  const b = await generation(pool, geometry);
  const concurrent = await Promise.all([generation(pool, geometry), generation(pool, geometry)]);
  assert.deepEqual(summarize(a), summarize(b));
  for (const r of concurrent) assert.deepEqual(summarize(a), summarize(r));
});

test("previous safe plan has a reserved bounded attempt when ordinary replanning fails", async () => {
  const base = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 10)));
  const prior = await generation(base, geometryFor(base));
  const snapshot = snapshotSafeSubset(scope, safeSubsetBaseTokens(base, geometryFor(base)), prior.editorial, base);
  const pool = [...base, photo("new", 24, 99)];
  const geometry = geometryFor(pool);
  const previous = previousSafeSubset(snapshot, scope, safeSubsetBaseTokens(pool, geometry), 24);
  assert.ok(previous);
  let attempts = 0;
  const result = await searchSafePhotoSubset({ photos: pool, geometry, pageCount: 24, unsafeStories: planEditorialAlbum(pool, 24).spreads, initialUnrecoveredCount: 1, currentSelectedCount: 24, previous, budgetExceeded: () => false, evaluate: async (plan) => {
    attempts++;
    if (!plan.preservedLayouts) throw new EditorialGenerationError("ordinary candidates fail");
    return evaluatePlan(plan, geometry);
  } });
  assert.equal(attempts, 4);
  assert.equal(result.diagnostics.fallbackToPreviousSafeSubsetCount, 1);
  assert.deepEqual(result.editorial.selectedPhotoIds, prior.editorial.selectedPhotoIds);
  assert.equal(result.editorial.recovery.unrecoveredCount, 0);
  const changed = geometryFor(pool); changed.get("p-0").width = 999;
  assert.equal(previousSafeSubset(snapshot, scope, safeSubsetBaseTokens(pool, changed), 24), null);
  assert.equal(previousSafeSubset(snapshot, "other-settings", safeSubsetBaseTokens(pool, geometry), 24), null);
  assert.equal(previousSafeSubset(snapshot, scope, safeSubsetBaseTokens(base, geometryFor(base)), 24), null);
});

test("budget exhaustion stops subset evaluation and retains failure diagnostics", async () => {
  const pool = [...Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80)), photo("bad", -1, 99)];
  const result = await generation(pool, geometryFor(pool, ["bad"]), null, () => true);
  assert.equal(result.editorial, null);
  assert.equal(result.diagnostics.subsetAttemptCount, 0);
  assert.ok(result.diagnostics.finalUnrecoveredCount > 0);
});

test("planEditorialAlbumWithSubset is deterministic with identical inputs", () => {
  const pool = Array.from({ length: 28 }, (_, i) => photo(`p-${i}`, i, 80 + (i % 15)));
  const excluded = new Set(["p-2", "p-7"]);

  const res1 = planEditorialAlbumWithSubset(pool, 24, excluded);
  const res2 = planEditorialAlbumWithSubset(pool, 24, excluded);

  assert.deepEqual(
    res1.selected.map((p) => p.photoId),
    res2.selected.map((p) => p.photoId),
  );
  assert.deepEqual(
    res1.spreads.map((s) => s.photoIds),
    res2.spreads.map((s) => s.photoIds),
  );
});


test("failed replacement histories are isolated across A/B and reentrant draft builds", () => {
  const owner = photo("owner-a", 0, 90), replacement = photo("replacement-a", 1, 85), other = photo("owner-b", 2, 90);
  const storyFor = (p) => ({ ...planEditorialAlbum(Array.from({ length: 12 }, (_, i) => photo(`seed-${i}`, i, 80)), 24).spreads[0], id: "editorial-isolation", photoIds: [p.photoId], primaryPhotoIds: [p.photoId], secondaryPhotoIds: [], sceneIds: [p.groupId], startedAt: p.timeline, endedAt: p.timeline });
  const reject = (story, photos, context, ids, work) => ({ ...buildSpreadDraft(story, photos, context, ids, work), status: "unusable", warnings: ["UNUSABLE_FRAME"] });
  const run = (p, extras = [], evaluate = reject) => {
    try {
      buildEditorialDraft([storyFor(p)], [layoutPhoto(p), ...extras.map((p) => layoutPhoto(p))], { "editorial-isolation": "Caption" }, undefined, extras.length ? { "editorial-isolation": extras.map((p) => p.photoId) } : {}, {}, 1, 1 + extras.length, {}, evaluate);
      assert.fail("forced evaluator must fail");
    } catch (error) {
      assert.ok(error instanceof EditorialGenerationError);
      return error.recoveryStats.spreadDiagnostics[0];
    }
  };
  const baselineB = run(other);
  let interleaved = false;
  const a = run(owner, [replacement], (...args) => {
    if (!interleaved && args[0].photoIds.includes(replacement.photoId) && args[3]?.[0]?.includes("NO_CROP")) {
      interleaved = true;
      assert.deepEqual(run(other).noCropRejectReasons, baselineB.noCropRejectReasons);
    }
    return reject(...args);
  });
  assert.ok(a.replacementCandidateEvaluatedCount > 0, "A must record an actually failed replacement");
  assert.ok(interleaved, "B must execute while A's replacement history is populated");
  const afterB = run(other);
  assert.equal(afterB.noCropCandidateCount, baselineB.noCropCandidateCount);
  assert.deepEqual(afterB.noCropRejectReasons, baselineB.noCropRejectReasons);
  run(owner, [replacement]);
  assert.equal(run(other).noCropCandidateCount, baselineB.noCropCandidateCount);
});


test("snapshot lookup uses owner/settings scope and bounded JSONB containment query", async () => {
  const base = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80));
  const prior = await generation(base, geometryFor(base));
  const snapshot = snapshotSafeSubset(scope, safeSubsetBaseTokens(base, geometryFor(base)), prior.editorial, base);
  const pool = [...base, photo("added", 24, 99)];
  let request;
  const client = createClient("https://example.invalid", "test-key", { auth: { persistSession: false }, global: { fetch: async (url) => {
    request = new URL(url);
    return new Response(JSON.stringify([{ generation_metadata: { safe_subset: snapshot } }]), { status: 200, headers: { "Content-Type": "application/json" } });
  } } });
  const tokens = safeSubsetBaseTokens(pool, geometryFor(pool));
  const result = await loadPreviousSafeSubset(client, "owner", scope, tokens, 24);
  assert.equal(result.error, null);
  assert.ok(result.previous);
  assert.equal(request.searchParams.get("albums.owner_user_id"), "eq.owner");
  assert.equal(request.searchParams.get("generation_metadata->safe_subset->>scope"), `eq.${scope}`);
  assert.equal(request.searchParams.get("generation_metadata->safe_subset->>baseCount"), "eq.23");
  assert.equal(request.searchParams.get("generation_metadata->safe_subset->baseTokens"), `cd.${JSON.stringify(tokens)}`);
  assert.equal(request.searchParams.get("limit"), "1");
  assert.ok(request.searchParams.get("select").includes("albums!inner"));
});

test("previous safe evaluation context survives group/score reranking after addition", async () => {
  const base = Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80));
  const prior = await generation(base, geometryFor(base));
  const snapshot = snapshotSafeSubset(scope, safeSubsetBaseTokens(base, geometryFor(base)), prior.editorial, base);
  const pool = [...base.map((p) => ({ ...p, groupId: "regrouped", confidence: 40, candidate: { ...p.candidate, rank: 99, scores: { ...p.candidate.scores, overall: 40, relativeUniqueness: 30 } } })), photo("added", 24, 99)];
  const previous = previousSafeSubset(snapshot, scope, safeSubsetBaseTokens(pool, geometryFor(pool)), 24);
  assert.ok(previous);
  assert.equal(previous.selectedPhotos[0].groupId, base.find((p) => p.photoId === previous.selectedPhotos[0].photoId).groupId);
  const result = await searchSafePhotoSubset({ photos: pool, geometry: geometryFor(pool), pageCount: 24, unsafeStories: [], initialUnrecoveredCount: 1, currentSelectedCount: 24, previous, budgetExceeded: () => false, evaluate: async (plan) => evaluatePlan(plan, geometryFor(pool)) });
  assert.equal(result.diagnostics.fallbackToPreviousSafeSubsetCount, 1);
  assert.equal(result.diagnostics.subsetAttemptCount, 1);
  assert.deepEqual(result.editorial.stories, prior.editorial.stories);
  assert.deepEqual(result.editorial.selectedPhotoIds, prior.editorial.selectedPhotoIds);
  assert.deepEqual(result.editorial.spreads.map((s) => s.layoutId), prior.editorial.spreads.map((s) => s.layoutId));
});

test("subset diagnostics emit on success, exhausted search and non-layout error without IDs", async () => {
  const pool = [...Array.from({ length: 23 }, (_, i) => photo(`p-${i}`, i, 80)), photo("bad", -1, 99)];
  const geometry = geometryFor(pool, ["bad"]);
  let error;
  try { evaluatePlan(planEditorialAlbum(pool, 24), geometry); } catch (e) { error = e; }
  assert.ok(error instanceof EditorialGenerationError);
  const args = { photos: pool, geometry, pageCount: 24, unsafeStories: error.currentStories.filter((_, i) => error.unrecoveredSpreadIndices.includes(i)), initialUnrecoveredCount: error.recoveryStats.unrecoveredCount, currentSelectedCount: error.currentPhotoIds.length, previous: null, budgetExceeded: () => false };
  for (const mode of ["success", "exhausted", "network"]) {
    const emitted = [];
    const evaluate = async (plan) => {
      if (mode === "network") throw new Error("asset retrieval failed");
      if (mode === "exhausted") throw new EditorialGenerationError("layout failed", [0], { unrecoveredCount: 1 });
      return evaluatePlan(plan, geometry);
    };
    const task = searchSafePhotoSubset({ ...args, evaluate, onDiagnostics: (d) => emitted.push({ ...d }) });
    if (mode === "network") await assert.rejects(task, /asset retrieval failed/); else await task;
    assert.equal(emitted.length, 1);
    assert.ok(emitted[0].subsetAttemptCount > 0);
    for (const key of ["eligiblePhotoCount", "selectedPhotoCount", "unusedPhotoCount", "subsetAttemptCount", "subsetSuccessCount", "initialUnrecoveredCount", "finalUnrecoveredCount"]) assert.equal(typeof emitted[0][key], "number");
    assert.ok(Object.values(emitted[0]).every((value) => typeof value === "number"));
    assert.equal(emitted[0].finalUnrecoveredCount, mode === "success" ? 0 : 1);
  }
});
