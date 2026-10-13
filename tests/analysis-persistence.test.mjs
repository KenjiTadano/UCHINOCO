import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { generationSignature } from "../lib/album-generation/signature.ts";
import { resolveAlbumPeriod } from "../lib/album-candidates/period.ts";
import { selectAlbumCandidates } from "../lib/album-candidates/select.ts";
import { buildAlbumDraft } from "../lib/album-draft/draft.ts";
import { buildAlbumStory } from "../lib/album-story/group.ts";
import { selectBestShot } from "../lib/best-shot/select.ts";
import { buildSceneGroups } from "../lib/photo-grouping/group.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../lib/photo-intelligence/config.ts";
import { analysisReadPlan, decideAnalysisWrite, reusableAnalysis } from "../lib/photo-analysis/policy.ts";
import { sourceFingerprint } from "../lib/photo-analysis/fingerprint.ts";
import { SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "../lib/photo-analysis/constants.ts";
import { buildSmartCropFrameResults } from "../lib/smart-crop/compute.ts";
import { analyzePhotoLayoutSuitability, parsePhotoLayoutSuitability, PHOTO_LAYOUT_SUITABILITY_VERSION } from "../lib/smart-layout/suitability.ts";
import { saveAnalysis } from "../lib/photo-analysis/repository.ts";

const migration = await readFile("./supabase/migrations/20260928100000_photo_analysis_results.sql", "utf8");
const draftMigration = await readFile("./supabase/migrations/20260927120000_album_draft_persistence.sql", "utf8");

const photo = {
  storage_path: "pets/waka/2023-07.jpg",
  updated_at: "2023-07-02T03:00:00.000Z",
  content_hash: "a".repeat(64),
};

test("1. analysis identity is unique per photo, type, version, and fingerprint", () => {
  assert.match(migration, /create table public\.photo_analysis_results/);
  assert.match(
    migration,
    /create unique index photo_analysis_results_identity_idx[\s\S]*photo_id, analysis_type, analysis_version, source_fingerprint/,
  );
  assert.match(migration, /on conflict \(photo_id, analysis_type, analysis_version, source_fingerprint\) do nothing/);
});

test("2. memory hit does not need the database or the model", () => {
  assert.equal(analysisReadPlan({ force: false, memoryHit: true, dbHit: true }), "memory");
  assert.equal(analysisReadPlan({ force: false, memoryHit: true, dbHit: false }), "memory");
});

test("3. database hit is used after a memory miss", () => {
  assert.equal(analysisReadPlan({ force: false, memoryHit: false, dbHit: true }), "db");
});

test("4. a different analysis version is not reused", () => {
  const stored = {
    analysisVersion: "photo-intelligence-v1",
    sourceFingerprint: sourceFingerprint(photo),
    resultStatus: "success",
    result: { scene: "home" },
  };
  assert.equal(reusableAnalysis(stored, { analysisVersion: "photo-intelligence-v2", sourceFingerprint: stored.sourceFingerprint }), null);
  assert.equal(analysisReadPlan({ force: false, memoryHit: false, dbHit: false }), "ai");
});

test("5. a different source fingerprint is not reused", () => {
  const fingerprint = sourceFingerprint(photo);
  const changed = sourceFingerprint({ ...photo, content_hash: "b".repeat(64) });
  assert.notEqual(fingerprint, changed);
  assert.equal(
    reusableAnalysis(
      { analysisVersion: PHOTO_INTELLIGENCE_VERSION, sourceFingerprint: fingerprint, resultStatus: "success", result: {} },
      { analysisVersion: PHOTO_INTELLIGENCE_VERSION, sourceFingerprint: changed },
    ),
    null,
  );
});

test("6. a success row is immutable", () => {
  assert.deepEqual(decideAnalysisWrite({ resultStatus: "success" }, "success"), {
    action: "keep",
    reason: "success_immutable",
  });
  assert.match(migration, /success_immutable/);
  assert.match(migration, /result_status <> 'success'/);
});

test("7. a failed result does not overwrite success", () => {
  assert.deepEqual(decideAnalysisWrite({ resultStatus: "success" }, "failed"), {
    action: "keep",
    reason: "success_immutable",
  });
  assert.deepEqual(decideAnalysisWrite({ resultStatus: "success" }, "fallback"), {
    action: "keep",
    reason: "success_immutable",
  });
  assert.match(migration, /p_result_status <> 'success'/);
});

test("8. duplicate inserts collapse on the unique identity", () => {
  assert.match(migration, /on conflict \(photo_id, analysis_type, analysis_version, source_fingerprint\) do nothing/);
  assert.deepEqual(decideAnalysisWrite(null, "success"), { action: "insert" });
  assert.deepEqual(decideAnalysisWrite({ resultStatus: "fallback" }, "success"), { action: "replace_non_success" });
});

test("9. the owner can select analysis for their own photos", () => {
  assert.match(migration, /for select/);
  assert.match(migration, /public\.pets\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /grant select on table public\.photo_analysis_results to authenticated/);
});

test("10. another user's analysis is not selectable", () => {
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /for select[\s\S]{0,400}using \(true\)/);
});

test("11. the client cannot update analysis rows", () => {
  assert.doesNotMatch(migration, /for update/);
  assert.doesNotMatch(migration, /for insert/);
  assert.doesNotMatch(migration, /for delete/);
  assert.match(migration, /revoke all on table public\.photo_analysis_results from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant insert|grant update|grant delete/);
});

test("12. saving analysis does not rewrite draft AI state", () => {
  assert.match(draftMigration, /AI Stateは変更できません/);
  assert.doesNotMatch(migration, /album_draft_/);
  assert.doesNotMatch(migration, /ai_layout_id|ai_photo_id|ai_crop_/);
});

test("13. grouping through layout stay the same for a fixed analysis fixture", () => {
  const period = resolveAlbumPeriod({ type: "monthly", year: 2023, month: 7 });
  const hist = Array.from({ length: 64 }, (_, index) => (index === 0 ? 1 : 0));
  const analysis = {
    width: 1200,
    height: 800,
    pets: [{ bbox: { x: 0.2, y: 0.25, width: 0.35, height: 0.4 }, confidence: 0.86 }],
    focalPoint: { x: 0.38, y: 0.42 },
    orientation: "landscape",
  };
  const photos = ["p-a", "p-b"].map((photoId, index) => ({
    photoId,
    capturedAt: `2023-07-02T0${index}:10:00.000Z`,
    width: 1200,
    height: 800,
    intelligence: {
      photoId,
      technicalQuality: 74,
      petVisibility: 82,
      expression: 77,
      composition: 64,
      uniqueness: 58,
      memoryValue: 73,
      overallScore: 72,
      confidence: 0.84,
      tags: ["playing", "home"],
      reasons: ["fixture"],
      warnings: [],
      analysisVersion: PHOTO_INTELLIGENCE_VERSION,
      status: "ok",
    },
    analysis,
    visual: { dHash: "0".repeat(16), aHash: "0".repeat(16), colorHist: hist, backgroundHist: hist },
  }));
  const groups = [buildSceneGroups(photos), buildSceneGroups(photos)];
  assert.deepEqual(groups[0], groups[1]);

  const group = groups[0][0];
  const shotPhotos = photos.map((item) => ({
    photoId: item.photoId,
    relativeUniqueness: 40,
    sharpness: 70,
    intelligence: {
      overallScore: item.intelligence.overallScore,
      expression: item.intelligence.expression,
      petVisibility: item.intelligence.petVisibility,
      technicalQuality: item.intelligence.technicalQuality,
      composition: item.intelligence.composition,
      memoryValue: item.intelligence.memoryValue,
      confidence: item.intelligence.confidence,
      tags: item.intelligence.tags,
      warnings: item.intelligence.warnings,
      status: item.intelligence.status,
    },
  }));
  const shotInput = {
    id: group.id,
    scene: group.scene,
    activity: group.activity,
    tags: group.tags,
    groupConfidence: group.groupConfidence,
    warnings: group.warnings,
    visualSimilarity: { "p-a|p-b": 90 },
    geometrySimilarity: { "p-a|p-b": 80 },
  };
  const shots = [selectBestShot(shotInput, shotPhotos), selectBestShot(shotInput, shotPhotos)];
  assert.deepEqual(shots[0], shots[1]);

  const scene = {
    groupId: group.id,
    startedAt: group.startedAt,
    endedAt: group.endedAt,
    scene: group.scene,
    activity: group.activity,
    tags: group.tags,
    groupConfidence: group.groupConfidence,
    warnings: [],
    selectionConfidence: shots[0].confidence,
    memberCount: photos.length,
    primary: {
      photoId: shots[0].primaryPhotoId,
      bestShot: 80,
      memoryValue: 73,
      expression: 77,
      petVisibility: 82,
      relativeUniqueness: 40,
      sceneRepresentativeness: 70,
      composition: 64,
      framing: "medium",
      placement: "center",
      orientation: "landscape",
    },
  };
  const request = { scenes: [scene], period, availablePhotoCount: 2, periodPhotoCount: 2 };
  const selected = [selectAlbumCandidates(request), selectAlbumCandidates(request)];
  assert.deepEqual(selected[0], selected[1]);

  const storyScenes = selected[0].selectedScenes.map((item) => ({
    groupId: item.groupId,
    startedAt: item.startedAt,
    scene: item.scene,
    activity: item.activity,
    tags: item.tags,
    sceneScore: item.sceneScore,
    mustKeep: item.mustKeep,
    bestShot: 80,
    memoryValue: 73,
    primaryPhotoId: item.primaryPhotoId,
    secondaryPhotoId: item.secondaryPhotoId,
  }));
  const stories = [buildAlbumStory({ period, scenes: storyScenes }), buildAlbumStory({ period, scenes: storyScenes })];
  assert.deepEqual(stories[0], stories[1]);

  const layoutPhotos = stories[0].spreads.flatMap((spread) =>
    spread.photoIds.map((photoId) => ({
      photoId,
      imageUrl: "https://example.test/original.jpg",
      previewUrl: "https://example.test/preview.jpg",
      analysis,
      storyRole: spread.secondaryPhotoIds.includes(photoId) ? "secondary" : "primary",
    })),
  );
  const drafts = [
    buildAlbumDraft({ period, spreads: stories[0].spreads, photos: layoutPhotos }),
    buildAlbumDraft({ period, spreads: stories[0].spreads, photos: layoutPhotos }),
  ];
  assert.deepEqual(drafts[0], drafts[1]);

  const crops = [buildSmartCropFrameResults(analysis), buildSmartCropFrameResults(analysis)];
  assert.deepEqual(crops[0], crops[1]);

  const signatureOf = (draft) =>
    generationSignature({
      period,
      groupIds: groups[0].map((item) => item.id),
      selectedSceneIds: selected[0].selectedScenes.map((item) => item.groupId),
      selectedPhotoIds: selected[0].selectedPhotoIds,
      roles: [{ groupId: group.id, primaryPhotoId: shots[0].primaryPhotoId, secondaryPhotoId: shots[0].secondaryPhotoId ?? null }],
      storySpreadIds: stories[0].spreads.map((spread) => spread.id),
      layoutIds: draft.spreads.map((spread) => spread.layoutId),
      frames: draft.spreads.flatMap((spread) =>
        spread.assignments.map((item) => ({
          storySpreadId: spread.storySpreadId,
          layoutId: spread.layoutId,
          frameId: item.frameId,
          photoId: item.photoId,
          role: item.role,
          crop: item.crop,
        })),
      ),
    });
  const signature = signatureOf(drafts[0]);
  assert.equal(signature, signatureOf(drafts[1]));
  assert.match(signature, /"crop"/);
  assert.match(signature, SUBJECT_GEOMETRY_VERSION === "subject-geometry-v1" ? /2023-07/ : /2023-07/);
});

test("an unchanged storage path, hash, and updated_at keep the same fingerprint", () => {
  assert.equal(sourceFingerprint(photo), sourceFingerprint({ ...photo }));
  assert.match(sourceFingerprint(photo), new RegExp(photo.storage_path));
  assert.match(sourceFingerprint(photo), new RegExp(photo.content_hash));
});

test("fallback stays reanalyzable and is not a success cache", () => {
  assert.equal(
    reusableAnalysis(
      {
        analysisVersion: PHOTO_INTELLIGENCE_VERSION,
        sourceFingerprint: sourceFingerprint(photo),
        resultStatus: "fallback",
        result: { reason: "vision_failed" },
      },
      { analysisVersion: PHOTO_INTELLIGENCE_VERSION, sourceFingerprint: sourceFingerprint(photo) },
    ),
    null,
  );
  assert.equal(
    reusableAnalysis(
      {
        analysisVersion: PHOTO_INTELLIGENCE_VERSION,
        sourceFingerprint: sourceFingerprint(photo),
        resultStatus: "failed",
        result: { reason: "vision_failed" },
      },
      { analysisVersion: PHOTO_INTELLIGENCE_VERSION, sourceFingerprint: sourceFingerprint(photo) },
    ),
    null,
  );
});

test("layout suitability is deterministic, separates source orientation from crop suitability, and rejects malformed results", () => {
  const analysis = {
    width: 1600,
    height: 900,
    orientation: "landscape",
    focalPoint: { x: 0.5, y: 0.5 },
    pets: [{ bbox: { x: 0.32, y: 0.22, width: 0.34, height: 0.58 }, face: { x: 0.39, y: 0.25, width: 0.2, height: 0.2 }, confidence: 0.95 }],
    analysisConfidence: { petDetection: 0.95 },
  };
  const first = analyzePhotoLayoutSuitability(analysis, "2026-10-13T00:00:00.000Z");
  const second = analyzePhotoLayoutSuitability(analysis, "2026-10-13T00:00:00.000Z");
  assert.deepEqual(first, second);
  assert.equal(first.version, PHOTO_LAYOUT_SUITABILITY_VERSION);
  assert.equal(first.sourceOrientation, "landscape");
  assert.ok(first.sourceAspectRatio > 1.7 && first.sourceAspectRatio < 1.8);
  for (const score of [first.portraitScore, first.landscapeScore, first.squareScore, first.heroScore, first.fullBleedScore]) assert.ok(score >= 0 && score <= 100);
  assert.equal(first.sourceSubjectClipped, false);
  assert.equal(first.subjectAnchor, "center");
  assert.ok(first.subjectSafeArea);
  assert.ok(first.subjectSafeArea.x >= 0 && first.subjectSafeArea.x + first.subjectSafeArea.width <= 1);
  assert.deepEqual(parsePhotoLayoutSuitability(first), first);
  assert.equal(parsePhotoLayoutSuitability({ ...first, version: 0 }), null);
  assert.equal(parsePhotoLayoutSuitability({ ...first, portraitScore: Infinity }), null);
  const clipped = analyzePhotoLayoutSuitability({ ...analysis, pets: [{ bbox: { x: 0, y: 0.2, width: 0.4, height: 0.4 }, confidence: 0.95 }] });
  assert.equal(clipped.sourceSubjectClipped, true);
  assert.equal(clipped.portraitCropSafe, false);
  assert.equal(clipped.landscapeCropSafe, false);
  assert.equal(clipped.squareCropSafe, false);
  assert.ok(clipped.subjectSafeArea);
  assert.equal(clipped.subjectAnchor, "left");
});

test("layout suitability is safely embedded on subject-geometry writes without another analysis row", async () => {
  let savedArgs;
  const client = {
    rpc(name, args) {
      assert.equal(name, "save_photo_analysis_result");
      savedArgs = args;
      return Promise.resolve({ data: { stored: true, reason: "inserted" }, error: null });
    },
  };
  const analysis = {
    width: 1200,
    height: 1600,
    orientation: "portrait",
    focalPoint: { x: 0.5, y: 0.4 },
    pets: [{ bbox: { x: 0.35, y: 0.28, width: 0.3, height: 0.36 }, face: { x: 0.42, y: 0.3, width: 0.16, height: 0.14 }, confidence: 0.95 }],
    analysisConfidence: { petDetection: 0.95 },
  };
  const result = await saveAnalysis(client, {
    photoId: "photo-layout-suitability",
    analysisType: SUBJECT_GEOMETRY,
    analysisVersion: SUBJECT_GEOMETRY_VERSION,
    sourceFingerprint: sourceFingerprint(photo),
    resultStatus: "success",
    result: analysis,
    existingStatus: null,
  });
  assert.equal(result.stored, true);
  assert.equal(savedArgs.p_analysis_type, SUBJECT_GEOMETRY);
  assert.equal(savedArgs.p_result.layoutSuitability.version, PHOTO_LAYOUT_SUITABILITY_VERSION);
  assert.equal(savedArgs.p_result.layoutSuitability.sourceOrientation, "portrait");
});
