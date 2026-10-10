import type { SupabaseClient } from "@supabase/supabase-js";
import { sourceFingerprint } from "../photo-analysis/fingerprint.ts";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "../photo-analysis/constants.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../photo-intelligence/config.ts";
import { parseStoredGeometry, parseStoredSemantic, parseStoredTechnical } from "../photo-analysis/stored.ts";
import { buildPhotoIntelligence } from "../photo-intelligence/score.ts";
import type { TechnicalQualityResult } from "../photo-intelligence/types.ts";
import type { SmartCropPhotoAnalysis } from "../smart-crop/types.ts";
import type { GroupingPhoto } from "../photo-grouping/types.ts";
import { descriptorCacheKey, getDescriptorCache } from "../photo-grouping/descriptor-cache.ts";
import { PHOTO_GROUPING_VERSION } from "../photo-grouping/config.ts";
import { getPhotoIntelligenceCache } from "../photo-intelligence/cache.ts";
import { intelligenceMemoryKey } from "../photo-analysis/keys.ts";

export type GenerationSourcePhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  updated_at: string;
  content_hash: string | null;
  taken_at: string | null;
  created_at: string;
};
type AnalysisRow = {
  photo_id: string;
  analysis_type: string;
  analysis_version: string;
  source_fingerprint: string;
  result_status: string;
  result: unknown;
  created_at?: string;
};

export function storedGenerationInputs(photos: GenerationSourcePhoto[], rows: AnalysisRow[]) {
  const byId = new Map<string, AnalysisRow[]>();
  for (const row of rows) byId.set(row.photo_id, [...(byId.get(row.photo_id) ?? []), row]);
  const geometry = new Map<string, SmartCropPhotoAnalysis>();
  const sharpness = new Map<string, number>();
  const grouping: GroupingPhoto[] = [];
  const preparationByPhoto = new Map<string, { ready: boolean; failed: boolean; staleVersion: boolean; staleFingerprint: boolean; missingSemantic: boolean; missingGeometry: boolean; lastProgressAt: string | null }>();
  let existingIntelligenceCount = 0;
  let missingSemanticCount = 0;
  let missingGeometryCount = 0;
  let staleVersionCount = 0;
  let staleFingerprintCount = 0;
  let legacyTechnicalFallbackCount = 0;
  let failedAnalysisCount = 0;
  for (const photo of photos) {
    const photoRows = byId.get(photo.id) ?? [];
    const fingerprint = sourceFingerprint(photo);
    const current = photoRows.filter((row) => row.source_fingerprint === fingerprint);
    const hasSemantic = current.some((row) => row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION && ["success", "fallback"].includes(row.result_status));
    const hasGeometry = current.some((row) => row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION && ["success", "fallback"].includes(row.result_status));
    const staleVersion = (!hasSemantic && photoRows.some((row) => row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.source_fingerprint === fingerprint && row.analysis_version !== PHOTO_INTELLIGENCE_VERSION)) || (!hasGeometry && photoRows.some((row) => row.analysis_type === SUBJECT_GEOMETRY && row.source_fingerprint === fingerprint && row.analysis_version !== SUBJECT_GEOMETRY_VERSION));
    const staleFingerprint = (!hasSemantic && photoRows.some((row) => row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION && row.source_fingerprint !== fingerprint)) || (!hasGeometry && photoRows.some((row) => row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION && row.source_fingerprint !== fingerprint));
    const failed = current.some((row) => row.result_status === "failed" && ((row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION) || (row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION)));
    if (staleVersion) staleVersionCount++;
    if (staleFingerprint) staleFingerprintCount++;
    if (failed) failedAnalysisCount++;
    const semanticRow = current.find((row) => row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION && ["success", "fallback"].includes(row.result_status));
    const geometryRow = current.find((row) => row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION && ["success", "fallback"].includes(row.result_status));
    const vision = parseStoredSemantic(semanticRow?.result);
    const saved = semanticRow?.result as { technical?: unknown; reason?: string } | undefined;
    const fallbackReady = semanticRow?.result_status === "fallback" && ["vision_failed", "vision_skipped"].includes(saved?.reason ?? "");
    const analysis = parseStoredGeometry(geometryRow?.result);
    if (vision || fallbackReady) existingIntelligenceCount++;
    if (!vision && !fallbackReady) missingSemanticCount++;
    if (analysis) geometry.set(photo.id, analysis);
    else missingGeometryCount++;
    const lastProgressAt = photoRows.reduce<string | null>((latest, row) => row.created_at && (!latest || row.created_at > latest) ? row.created_at : latest, null);
    preparationByPhoto.set(photo.id, {
      ready: Boolean((vision || fallbackReady) && analysis),
      failed,
      staleVersion: Boolean(staleVersion),
      staleFingerprint: Boolean(staleFingerprint),
      missingSemantic: !vision && !fallbackReady,
      missingGeometry: !analysis,
      lastProgressAt,
    });
    if ((!vision && !fallbackReady) || !analysis) continue;
    const technical = parseStoredTechnical(saved?.technical);
    const cached = getPhotoIntelligenceCache(intelligenceMemoryKey(photo));
    if (!technical && !cached) legacyTechnicalFallbackCount++;
    sharpness.set(photo.id, cached?.parts.sharpness ?? technical?.parts.sharpness ?? 62);
    const conservative: TechnicalQualityResult = {
      technicalQuality: 62,
      parts: { blur: 62, sharpness: 62, exposure: 62, contrast: 62, noise: 62, resolution: 62 },
      signals: { width: analysis.width, height: analysis.height, readable: true, pixelsKnown: false, meanLuma: 0, lumaStd: 0, laplacianVar: 0, neighborDiff: 0 },
      flags: [],
    };
    const intelligence = cached?.intelligence ?? buildPhotoIntelligence({ photoId: photo.id, analysis, technical: technical ?? conservative, vision, visionFailed: fallbackReady });
    grouping.push({ photoId: photo.id, capturedAt: photo.taken_at ?? photo.created_at, width: analysis.width, height: analysis.height, intelligence, analysis, visual: getDescriptorCache(descriptorCacheKey(photo.id, photo.storage_path, PHOTO_GROUPING_VERSION)) ?? null });
  }
  return { grouping, geometry, sharpness, preparationByPhoto, existingIntelligenceCount, missingIntelligenceCount: photos.length - existingIntelligenceCount, missingSemanticCount, missingGeometryCount, staleVersionCount, staleFingerprintCount, legacyTechnicalFallbackCount, failedAnalysisCount };
}

export async function loadStoredGenerationInputs(client: SupabaseClient, photos: GenerationSourcePhoto[]) {
  const rows: AnalysisRow[] = [];
  let metadataQueryCount = 0;
  for (let offset = 0; offset < photos.length; offset += 200) {
    const result = await client
      .from("photo_analysis_results")
      .select("photo_id,analysis_type,analysis_version,source_fingerprint,result_status,result,created_at")
      .in(
        "photo_id",
        photos.slice(offset, offset + 200).map((photo) => photo.id),
      )
      .in("analysis_type", [PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY]);
    metadataQueryCount++;
    if (result.error) throw new Error("stored_analysis_unavailable");
    rows.push(...((result.data ?? []) as AnalysisRow[]));
  }
  return { ...storedGenerationInputs(photos, rows), metadataQueryCount };
}
