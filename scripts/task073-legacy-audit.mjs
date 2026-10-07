#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  addLegacyAuditCount,
  classifyLegacyPhoto,
  emptyLegacyAuditCounts,
  normalizeBackfillBatchSize,
  recoverOverallScoreFromStoredAnalysis,
} from "../lib/legacy-backfill.ts";
import { photoPreviewPath } from "../lib/photo-image-delivery.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "../lib/photo-intelligence/config.ts";
import { SUBJECT_GEOMETRY_VERSION } from "../lib/photo-analysis/constants.ts";
import { sourceFingerprint } from "../lib/photo-analysis/fingerprint.ts";

function loadEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));
}

const env = loadEnv(await readFile(".env.local", "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Task073 audit requires server-only Supabase credentials");

const batchSize = normalizeBackfillBatchSize(Number(process.argv.find((arg) => arg.startsWith("--batch="))?.split("=")[1]));
const applyAnalysis = process.argv.includes("--apply-analysis");
const maxItems = Math.min(10, Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--max-items="))?.split("=")[1]) || 5));
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const counts = emptyLegacyAuditCounts();
let updated = 0;
let failed = 0;
let cursor = null;

while (true) {
  let photoQuery = supabase.from("photos")
    .select("id,storage_path,thumbnail_path,taken_at,created_at,updated_at,content_hash")
    .order("created_at", { ascending: true }).order("id", { ascending: true })
    .limit(batchSize);
  if (cursor) {
    const createdAt = `"${cursor.createdAt}"`;
    photoQuery = photoQuery.or(`created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${cursor.id})`);
  }
  const { data: photos, error } = await photoQuery;
  if (error) throw new Error(`photo audit failed: ${error.code || "query_failed"} ${error.message || "unknown"}`);
  if (!photos?.length) break;

  const ids = photos.map((photo) => photo.id);
  const { data: analyses, error: analysisError } = await supabase.from("photo_analysis_results")
    .select("id,photo_id,analysis_type,analysis_version,source_fingerprint,result_status,result")
    .in("photo_id", ids).order("created_at", { ascending: false });
  if (analysisError) throw new Error(`analysis audit failed: ${analysisError.code ?? "query_failed"}`);

  for (const photo of photos) {
    const previewPath = photoPreviewPath(photo.storage_path);
    const preview = await supabase.storage.from("pet-photo-thumbnails").info(previewPath);
    const previewExists = !preview.error && Boolean(preview.data) && Number(preview.data.size) > 0;
    const classification = classifyLegacyPhoto({
      photo,
      analyses: (analyses ?? []).filter((row) => row.photo_id === photo.id),
      previewExists,
    });
    addLegacyAuditCount(counts, classification);

    if (applyAnalysis && updated + failed < maxItems && classification.audit.overallScoreMissing) {
      const fingerprint = sourceFingerprint(photo);
      const semantic = (analyses ?? []).find((row) => row.photo_id === photo.id && row.analysis_type === "photo_intelligence_semantic" && row.analysis_version === PHOTO_INTELLIGENCE_VERSION && row.source_fingerprint === fingerprint && row.result_status === "success");
      const geometry = (analyses ?? []).find((row) => row.photo_id === photo.id && row.analysis_type === "subject_geometry" && row.analysis_version === SUBJECT_GEOMETRY_VERSION && row.source_fingerprint === fingerprint && row.result_status === "success");
      try {
        if (!semantic || !geometry) throw new Error("stored_analysis_incomplete");
        const original = await supabase.storage.from("pet-photos").download(photo.storage_path);
        if (original.error || !original.data || original.data.size <= 0) throw new Error("original_unavailable");
        const imageBytes = new Uint8Array(await original.data.arrayBuffer());
        const overallScore = recoverOverallScoreFromStoredAnalysis({ photoId: photo.id, semantic: semantic.result, geometry: geometry.result, imageBytes, mimeType: original.data.type });
        if (overallScore === null) throw new Error("score_not_recoverable");
        const nextResult = { ...semantic.result, overallScore };
        const saved = await supabase.from("photo_analysis_results").update({ result: nextResult })
          .eq("id", semantic.id).eq("photo_id", photo.id).eq("analysis_version", PHOTO_INTELLIGENCE_VERSION)
          .eq("source_fingerprint", fingerprint).eq("result_status", "success")
          .select("id").maybeSingle();
        if (saved.error || !saved.data) throw new Error("guarded_update_failed");
        updated += 1;
      } catch {
        failed += 1;
      }
    }
  }
  const lastPhoto = photos.at(-1);
  cursor = lastPhoto ? { createdAt: lastPhoto.created_at, id: lastPhoto.id } : cursor;
  if (photos.length < batchSize) break;
}

// Aggregate output only: never print photo/user IDs, paths, captions, or signed URLs.
console.log(JSON.stringify({ mode: applyAnalysis ? "analysis-backfill" : "dry-run", batchSize, maxItems, updated, failed, counts }, null, 2));
