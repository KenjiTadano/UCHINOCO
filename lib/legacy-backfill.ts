import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";
import { computeOverallScore } from "./photo-intelligence/score.ts";
import { buildPhotoIntelligence } from "./photo-intelligence/score.ts";
import { measureTechnicalQuality } from "./photo-intelligence/technical.ts";
import type { ScoreAxes } from "./photo-intelligence/types.ts";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "./photo-analysis/constants.ts";
import { sourceFingerprint, type PhotoSource } from "./photo-analysis/fingerprint.ts";
import { parseStoredGeometry, parseStoredSemantic } from "./photo-analysis/stored.ts";

export const LEGACY_BACKFILL_BATCH_SIZE = 5;
export const LEGACY_BACKFILL_MAX_BATCH_SIZE = 10;

export type LegacyPhotoRow = PhotoSource & {
  id: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
};

export type LegacyAnalysisRow = {
  photo_id: string;
  analysis_type: string;
  analysis_version: string;
  source_fingerprint: string;
  result_status: string;
  result: unknown;
};

export type LegacyBackfillClassification = {
  media: "ready" | "thumbnail_missing" | "preview_missing" | "thumbnail_and_preview_missing";
  semantic: "current" | "recoverable_score" | "legacy_compatible" | "external_analysis_required";
  geometry: "current" | "legacy_compatible" | "external_analysis_required";
  metadata: "ready" | "taken_at_fallback" | "source_fingerprint_missing";
  recoveredOverallScore: number | null;
  audit: {
    hasAnyAnalysis: boolean;
    hasCurrentSemanticRow: boolean;
    hasCurrentGeometryRow: boolean;
    overallScoreMissing: boolean;
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function score(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

/** Recalculate only when all six canonical axes are actually stored. */
export function recoverOverallScore(result: unknown): number | null {
  const value = record(result);
  if (!value) return null;
  const axes: ScoreAxes = {
    technicalQuality: score(value.technicalQuality) ?? Number.NaN,
    petVisibility: score(value.petVisibility) ?? Number.NaN,
    expression: score(value.expression) ?? Number.NaN,
    composition: score(value.composition) ?? Number.NaN,
    uniqueness: score(value.uniqueness) ?? Number.NaN,
    memoryValue: score(value.memoryValue) ?? Number.NaN,
  };
  if (Object.values(axes).some((axis) => !Number.isFinite(axis))) return null;
  return computeOverallScore(axes);
}

/** Deterministic recovery from stored semantic + geometry and original bytes.
 * This performs no Vision call and never invents geometry. */
export function recoverOverallScoreFromStoredAnalysis(input: {
  photoId: string;
  semantic: unknown;
  geometry: unknown;
  imageBytes: Uint8Array;
  mimeType: string;
}): number | null {
  const semantic = parseStoredSemantic(input.semantic);
  const geometry = parseStoredGeometry(input.geometry);
  if (!semantic || !geometry || !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) return null;
  const technical = measureTechnicalQuality(input.imageBytes, input.mimeType);
  if (!technical.signals.readable) return null;
  return buildPhotoIntelligence({
    photoId: input.photoId,
    analysis: geometry,
    technical,
    vision: semantic,
    visionFailed: false,
  }).overallScore;
}

function newest(rows: LegacyAnalysisRow[], type: string) {
  return rows.find((row) => row.analysis_type === type && row.result_status === "success") ?? null;
}

export function classifyLegacyPhoto(input: {
  photo: LegacyPhotoRow;
  analyses: LegacyAnalysisRow[];
  previewExists: boolean;
}): LegacyBackfillClassification {
  const { photo, analyses, previewExists } = input;
  const fingerprint = sourceFingerprint(photo);
  const semanticRows = analyses.filter((row) => row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC);
  const geometryRows = analyses.filter((row) => row.analysis_type === SUBJECT_GEOMETRY);
  const currentSemantic = semanticRows.find((row) =>
    row.analysis_version === PHOTO_INTELLIGENCE_VERSION &&
    row.source_fingerprint === fingerprint &&
    row.result_status === "success",
  );
  const currentGeometry = geometryRows.find((row) =>
    row.analysis_version === SUBJECT_GEOMETRY_VERSION &&
    row.source_fingerprint === fingerprint &&
    row.result_status === "success",
  );

  const semanticResult = currentSemantic?.result ?? newest(semanticRows, PHOTO_INTELLIGENCE_SEMANTIC)?.result;
  const storedOverallScore = score(record(semanticResult)?.overallScore);
  const recoveredOverallScore = storedOverallScore === null
    ? recoverOverallScore(semanticResult)
    : null;

  let semantic: LegacyBackfillClassification["semantic"];
  if (currentSemantic && parseStoredSemantic(currentSemantic.result) && storedOverallScore !== null) semantic = "current";
  else if (currentSemantic && recoveredOverallScore !== null) semantic = "recoverable_score";
  else if (newest(semanticRows, PHOTO_INTELLIGENCE_SEMANTIC) && parseStoredSemantic(semanticResult)) semantic = "legacy_compatible";
  else semantic = "external_analysis_required";

  let geometry: LegacyBackfillClassification["geometry"];
  if (currentGeometry && parseStoredGeometry(currentGeometry.result)) geometry = "current";
  else if (parseStoredGeometry(newest(geometryRows, SUBJECT_GEOMETRY)?.result)) geometry = "legacy_compatible";
  else geometry = "external_analysis_required";

  const missingThumbnail = photo.thumbnail_path === null;
  const media = missingThumbnail && !previewExists
    ? "thumbnail_and_preview_missing"
    : missingThumbnail
      ? "thumbnail_missing"
      : !previewExists
        ? "preview_missing"
        : "ready";

  const hasUsableFingerprint = [...semanticRows, ...geometryRows].some((row) => row.source_fingerprint === fingerprint);
  return {
    media,
    semantic,
    geometry,
    metadata: !hasUsableFingerprint && analyses.length > 0
      ? "source_fingerprint_missing"
      : photo.taken_at === null
        ? "taken_at_fallback"
        : "ready",
    recoveredOverallScore,
    audit: {
      hasAnyAnalysis: analyses.length > 0,
      hasCurrentSemanticRow: Boolean(currentSemantic),
      hasCurrentGeometryRow: Boolean(currentGeometry),
      overallScoreMissing: Boolean(currentSemantic) && storedOverallScore === null,
    },
  };
}

export type BackfillCursor = { createdAt: string; id: string };

export function normalizeBackfillBatchSize(value: number | undefined) {
  if (!Number.isInteger(value) || !value) return LEGACY_BACKFILL_BATCH_SIZE;
  return Math.min(LEGACY_BACKFILL_MAX_BATCH_SIZE, Math.max(1, value));
}

export function nextBackfillCursor(rows: Array<{ created_at: string; id: string }>): BackfillCursor | null {
  const last = rows.at(-1);
  return last ? { createdAt: last.created_at, id: last.id } : null;
}

export function emptyLegacyAuditCounts() {
  return {
    eligible: 0,
    thumbnailMissing: 0,
    previewMissing: 0,
    mediaMissing: 0,
    noAnalysis: 0,
    overallScoreMissing: 0,
    oldSemanticVersion: 0,
    subjectGeometryMissing: 0,
    metadataLegacy: 0,
    analysisIncomplete: 0,
    scoreRecoverable: 0,
    geometryRecoverable: 0,
    needsExternalAnalysis: 0,
    ready: 0,
  };
}

export function addLegacyAuditCount(
  counts: ReturnType<typeof emptyLegacyAuditCounts>,
  item: LegacyBackfillClassification,
) {
  counts.eligible += 1;
  if (item.media === "thumbnail_missing" || item.media === "thumbnail_and_preview_missing") counts.thumbnailMissing += 1;
  if (item.media === "preview_missing" || item.media === "thumbnail_and_preview_missing") counts.previewMissing += 1;
  if (item.media !== "ready") counts.mediaMissing += 1;
  if (!item.audit.hasAnyAnalysis) counts.noAnalysis += 1;
  if (item.audit.overallScoreMissing) counts.overallScoreMissing += 1;
  if (!item.audit.hasCurrentSemanticRow && item.audit.hasAnyAnalysis) counts.oldSemanticVersion += 1;
  if (!item.audit.hasCurrentGeometryRow) counts.subjectGeometryMissing += 1;
  if (item.metadata !== "ready") counts.metadataLegacy += 1;
  if (item.semantic !== "current" || item.geometry !== "current") counts.analysisIncomplete += 1;
  if (item.semantic === "recoverable_score") counts.scoreRecoverable += 1;
  if (item.geometry === "legacy_compatible") counts.geometryRecoverable += 1;
  if (item.semantic === "external_analysis_required" || item.geometry === "external_analysis_required") {
    counts.needsExternalAnalysis += 1;
  }
  if (item.media === "ready" && item.semantic === "current" && item.geometry === "current") counts.ready += 1;
  return counts;
}
