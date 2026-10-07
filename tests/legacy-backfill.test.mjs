import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  classifyLegacyPhoto,
  emptyLegacyAuditCounts,
  addLegacyAuditCount,
  normalizeBackfillBatchSize,
  nextBackfillCursor,
  recoverOverallScore,
  recoverOverallScoreFromStoredAnalysis,
} from "../lib/legacy-backfill.ts";

const photo = {
  id: "00000000-0000-4000-8000-000000000001",
  storage_path: "owner/pet/2026/01/photo.jpg",
  thumbnail_path: null,
  taken_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  content_hash: null,
};

const axes = { technicalQuality: 70, petVisibility: 80, expression: 75, composition: 65, uniqueness: 60, memoryValue: 85 };

test("media missing detection and existing media skip", () => {
  const missing = classifyLegacyPhoto({ photo, analyses: [], previewExists: false });
  assert.equal(missing.media, "thumbnail_and_preview_missing");
  const ready = classifyLegacyPhoto({ photo: { ...photo, thumbnail_path: "owner/pet/2026/01/photo.webp" }, analyses: [], previewExists: true });
  assert.equal(ready.media, "ready");
});

test("overall score is recoverable only from all canonical axes", () => {
  assert.equal(typeof recoverOverallScore(axes), "number");
  assert.equal(recoverOverallScore({ ...axes, composition: undefined }), null);
  assert.equal(recoverOverallScore({ expressionScore: 80, uniquenessScore: 70, memoryValueScore: 90 }), null);
});

test("geometry recovery never invents a center crop", () => {
  const unknown = classifyLegacyPhoto({ photo, analyses: [], previewExists: false });
  assert.equal(unknown.geometry, "external_analysis_required");
  assert.equal(unknown.recoveredOverallScore, null);
});

test("stored semantic and geometry can recover score without Vision", () => {
  const semantic = {
    expressionScore: 80, uniquenessScore: 70, memoryValueScore: 90, confidence: 0.9,
    scene: "home", petActivity: "sleeping", moment: "calm", season: "unknown",
    expressionTags: [], memoryTags: [], petPresent: true, peoplePresent: false, eyesVisible: true, reason: "resting",
  };
  const geometry = { width: 1, height: 1, pets: [], focalPoint: { x: 0.5, y: 0.5 }, orientation: "square" };
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nLkAAAAASUVORK5CYII=", "base64"));
  assert.equal(typeof recoverOverallScoreFromStoredAnalysis({ photoId: photo.id, semantic, geometry, imageBytes: png, mimeType: "image/png" }), "number");
  assert.equal(recoverOverallScoreFromStoredAnalysis({ photoId: photo.id, semantic, geometry: null, imageBytes: png, mimeType: "image/png" }), null);
});

test("batch is bounded, resumable and deterministic", () => {
  assert.equal(normalizeBackfillBatchSize(undefined), 5);
  assert.equal(normalizeBackfillBatchSize(999), 10);
  assert.deepEqual(nextBackfillCursor([{ created_at: photo.created_at, id: photo.id }]), { createdAt: photo.created_at, id: photo.id });
});

test("aggregate counts contain no resource identifiers", () => {
  const counts = addLegacyAuditCount(emptyLegacyAuditCounts(), classifyLegacyPhoto({ photo, analyses: [], previewExists: false }));
  assert.deepEqual(counts, {
    eligible: 1,
    thumbnailMissing: 1,
    previewMissing: 1,
    mediaMissing: 1,
    noAnalysis: 1,
    overallScoreMissing: 0,
    oldSemanticVersion: 0,
    subjectGeometryMissing: 1,
    metadataLegacy: 1,
    analysisIncomplete: 1,
    scoreRecoverable: 0,
    geometryRecoverable: 0,
    needsExternalAnalysis: 1,
    ready: 0,
  });
  assert.ok(!JSON.stringify(counts).includes(photo.id));
});

test("audit defaults to dry-run, has an explicit apply gate, and never mutates albums/print", async () => {
  const source = await readFile("./scripts/task073-legacy-audit.mjs", "utf8");
  assert.ok(!source.includes("OPENAI"));
  assert.ok(!source.includes(".insert("));
  assert.ok(source.includes('process.argv.includes("--apply-analysis")'));
  assert.ok(source.indexOf("if (applyAnalysis") < source.indexOf('.update({ result: nextResult })'));
  assert.ok(!source.includes('from("albums")'));
  assert.ok(!source.includes('from("orders")'));
});
