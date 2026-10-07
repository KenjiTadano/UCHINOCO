"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getPhotoIntelligenceCache, photoIntelligenceCacheKey, setPhotoIntelligenceCache } from "@/lib/photo-intelligence/cache";
import { PHOTO_INTELLIGENCE_VERSION } from "@/lib/photo-intelligence/config";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "@/lib/photo-analysis/constants";
import { sourceFingerprint } from "@/lib/photo-analysis/fingerprint";
import { analysisReadPlan, reusableAnalysis } from "@/lib/photo-analysis/policy";
import { readAnalysis, saveAnalysis } from "@/lib/photo-analysis/repository";
import { parseStoredGeometry, parseStoredSemantic } from "@/lib/photo-analysis/stored";
import { noteAnalysisTrace, noteVisionCall } from "@/lib/photo-analysis/trace";
import type { Json } from "@/lib/supabase/database.types";
import type { ResultStatus } from "@/lib/photo-analysis/constants";
import { buildPhotoIntelligence } from "@/lib/photo-intelligence/score";
import { measureTechnicalQuality } from "@/lib/photo-intelligence/technical";
import type { PhotoIntelligence, PhotoIntelligenceVision, TechnicalParts, TechnicalSignals } from "@/lib/photo-intelligence/types";
import { parsePhotoIntelligenceVision, PHOTO_INTELLIGENCE_VISION_PROMPT, PHOTO_INTELLIGENCE_VISION_SCHEMA } from "@/lib/photo-intelligence/vision-parse";
import { geometryMemoryKey } from "@/lib/photo-analysis/keys";
import { getSmartCropCache } from "@/lib/smart-crop/cache";
import type { SmartCropPhotoAnalysis } from "@/lib/smart-crop/types";
import { analyzeSmartCropPhoto } from "../smart-crop/actions";
import { createCachedSignedImageUrls, createPhotoPreviewUrls, ORIGINAL_PHOTO_BUCKET, PHOTO_IMAGE_BUCKET } from "@/lib/photo-image-delivery";

const DEFAULT_VISION_MODEL = "gpt-4o";
const MAX_AI_IMAGE_SIZE = 5 * 1024 * 1024;
const SUCCESS_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PhotoIntelligenceAnalyzeResult = {
  ok: boolean;
  message: string | null;
  photoId: string | null;
  petId: string | null;
  storagePath: string | null;
  imageUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  intelligence: PhotoIntelligence | null;
  parts: TechnicalParts | null;
  signals: Pick<TechnicalSignals, "width" | "height" | "pixelsKnown" | "meanLuma" | "lumaStd" | "laplacianVar"> | null;
  fromCache: boolean;
  cropFromCache: boolean;
  visionCalled: boolean;
  visionFailed: boolean;
  cacheSource: "memory" | "db" | "ai" | null;
};

function emptyResult(message: string): PhotoIntelligenceAnalyzeResult {
  return {
    ok: false,
    message,
    photoId: null,
    petId: null,
    storagePath: null,
    imageUrl: null,
    previewUrl: null,
    thumbnailUrl: null,
    intelligence: null,
    parts: null,
    signals: null,
    fromCache: false,
    cropFromCache: false,
    visionCalled: false,
    visionFailed: false,
    cacheSource: null,
  };
}

function semanticJson(vision: PhotoIntelligenceVision, overallScore: number): Json {
  // Keep the validated semantic payload reusable while exposing the derived,
  // deterministic score to UCHINOCO NOW without another Vision request.
  return JSON.parse(JSON.stringify({ ...vision, overallScore })) as Json;
}

function hasExpectedImageSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function centerAnalysis(width: number, height: number): SmartCropPhotoAnalysis {
  const ratio = height > 0 ? width / height : 1;
  return {
    width,
    height,
    pets: [],
    focalPoint: { x: 0.5, y: 0.5 },
    orientation: ratio > 1.08 ? "landscape" : ratio < 0.92 ? "portrait" : "square",
    warning: "被写体解析を利用できなかったため、中央基準です。",
    analysisConfidence: { petDetection: 0 },
  };
}

function signalSnapshot(signals: TechnicalSignals) {
  return {
    width: signals.width,
    height: signals.height,
    pixelsKnown: signals.pixelsKnown,
    meanLuma: signals.meanLuma,
    lumaStd: signals.lumaStd,
    laplacianVar: signals.laplacianVar,
  };
}

/**
 * Task051 — on-demand keeper score.
 * Semantic Vision results are reused from memory, then the database, then the model.
 */
export async function analyzePhotoIntelligence(petId: string, photoId: string, force = false, options?: { storedOnly?: boolean; allowLargeImageDegrade?: boolean }): Promise<PhotoIntelligenceAnalyzeResult> {
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(photoId)) {
    return emptyResult("不正なIDです。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return emptyResult("ログインが必要です。");

  const [petResult, photoResult] = await Promise.all([
    supabase.from("pets").select("id, owner_user_id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle(),
    supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, updated_at, content_hash").eq("id", photoId).eq("pet_id", petId).eq("uploader_user_id", user.id).maybeSingle(),
  ]);

  const pet = petResult.data;
  const photo = photoResult.data;
  if (petResult.error || photoResult.error || !pet || !photo || pet.owner_user_id !== user.id || photo.uploader_user_id !== user.id) {
    return emptyResult("写真を読み込めませんでした。");
  }

  const signed = await createCachedSignedImageUrls(supabase, user.id, ORIGINAL_PHOTO_BUCKET, [photo.storage_path]);
  const originalUrl = signed.urls.get(photo.storage_path);
  if (!originalUrl) {
    return emptyResult("写真URLの発行に失敗しました。");
  }
  const aiInputUrl: string = originalUrl;

  const [thumbnailResult, previewUrls] = await Promise.all([photo.thumbnail_path ? createCachedSignedImageUrls(supabase, user.id, PHOTO_IMAGE_BUCKET, [photo.thumbnail_path]) : Promise.resolve({ urls: new Map<string, string>(), error: null }), createPhotoPreviewUrls(supabase, [photo], true, false, user.id)]);
  const thumbnailUrl = photo.thumbnail_path ? (thumbnailResult.urls.get(photo.thumbnail_path) ?? null) : null;
  const previewUrl = previewUrls.get(photo.id) ?? originalUrl;

  const fingerprint = sourceFingerprint(photo);
  const cacheKey = photoIntelligenceCacheKey(photo.id, photo.storage_path, PHOTO_INTELLIGENCE_VERSION, fingerprint);
  const cached = force ? null : getPhotoIntelligenceCache(cacheKey);
  if (analysisReadPlan({ force, memoryHit: Boolean(cached), dbHit: false }) === "memory" && cached) {
    const failed = cached.intelligence.warnings.includes("VISION_ANALYSIS_FAILED");
    noteAnalysisTrace({
      photoId: photo.id,
      analysisType: PHOTO_INTELLIGENCE_SEMANTIC,
      version: PHOTO_INTELLIGENCE_VERSION,
      fingerprint,
      cacheSource: "memory",
      status: failed ? "fallback" : "success",
      visionCalled: false,
      createdAt: null,
    });
    return {
      ok: true,
      message: null,
      photoId: photo.id,
      petId: pet.id,
      storagePath: photo.storage_path,
      imageUrl: originalUrl,
      previewUrl,
      thumbnailUrl,
      intelligence: cached.intelligence,
      parts: cached.parts,
      signals: cached.signals,
      fromCache: true,
      cropFromCache: Boolean(getSmartCropCache(geometryMemoryKey(photo))),
      visionCalled: false,
      visionFailed: failed,
      cacheSource: "memory",
    };
  }

  const stored = force ? null : await readAnalysis(supabase, photo.id, PHOTO_INTELLIGENCE_SEMANTIC, PHOTO_INTELLIGENCE_VERSION, fingerprint);
  const reusable = reusableAnalysis(
    stored
      ? {
          analysisVersion: stored.analysisVersion,
          sourceFingerprint: stored.sourceFingerprint,
          resultStatus: stored.resultStatus,
          result: stored.result,
        }
      : null,
    { analysisVersion: PHOTO_INTELLIGENCE_VERSION, sourceFingerprint: fingerprint },
  );
  const storedVision = reusable ? parseStoredSemantic(reusable.result) : null;
  if (options?.storedOnly && !storedVision) {
    return emptyResult("保存済みの撮れ高評価がありません。");
  }

  const { data: blob, error: downloadError } = await supabase.storage.from("pet-photos").download(photo.storage_path);
  if (downloadError || !blob || blob.size <= 0) {
    return emptyResult("写真をダウンロードできませんでした。");
  }
  if (!ALLOWED_MIME.has(blob.type)) {
    return emptyResult("この画像形式は対応していません。");
  }

  let imageBytes: Uint8Array;
  try {
    imageBytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return emptyResult("写真を読み込めませんでした。");
  }
  if (!hasExpectedImageSignature(blob.type, imageBytes.slice(0, 12))) {
    return emptyResult("画像の内容を確認できませんでした。");
  }

  const technical = measureTechnicalQuality(imageBytes, blob.type);
  const unusable = technical.flags.includes("BLACK_IMAGE") || technical.flags.includes("CORRUPT_IMAGE");

  const cachedCrop = getSmartCropCache(geometryMemoryKey(photo));
  let storedGeometry: SmartCropPhotoAnalysis | null = null;
  if (options?.storedOnly && !cachedCrop) {
    const geometry = await readAnalysis(supabase, photo.id, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION, fingerprint);
    const reusableGeometry = reusableAnalysis(
      geometry
        ? {
            analysisVersion: geometry.analysisVersion,
            sourceFingerprint: geometry.sourceFingerprint,
            resultStatus: geometry.resultStatus,
            result: geometry.result,
          }
        : null,
      {
        analysisVersion: SUBJECT_GEOMETRY_VERSION,
        sourceFingerprint: fingerprint,
      },
    );
    storedGeometry = reusableGeometry ? parseStoredGeometry(reusableGeometry.result) : null;
    if (!storedGeometry) {
      return emptyResult("保存済みの被写体解析がありません。");
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

  let visionCalled = false;
  let visionFailed = false;
  let vision: PhotoIntelligenceVision | null = null;

  async function requestVision(imageUrl: string): Promise<PhotoIntelligenceVision | null> {
    const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 });
    noteVisionCall();
    const response = await openai.responses.create({
      model,
      store: false,
      max_output_tokens: 700,
      instructions: PHOTO_INTELLIGENCE_VISION_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Score this pet photo for an album keeper evaluation. Return only the schema.",
            },
            {
              type: "input_image",
              // Original, not the 400px center-square thumbnail. That crop would bias expression and memory.
              image_url: imageUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "uchinoco_photo_intelligence",
          description: "Per-photo keeper scores and tags",
          strict: true,
          schema: PHOTO_INTELLIGENCE_VISION_SCHEMA,
        },
      },
    });
    const parsed = parsePhotoIntelligenceVision(response.output_text);
    if (!parsed) {
      console.error("Photo Intelligence parse failed", {
        outputPreview: (response.output_text ?? "").slice(0, 400),
      });
      return null;
    }
    return parsed;
  }

  async function loadVision(): Promise<PhotoIntelligenceVision | null> {
    if (unusable || !apiKey) {
      visionFailed = !unusable;
      return null;
    }
    visionCalled = true;
    try {
      const parsed = await requestVision(aiInputUrl);
      if (parsed) return parsed;
      visionFailed = true;
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const downloadTimeout = /unable to download|timeout/i.test(message);
      console.error("Photo Intelligence vision failed", {
        status: error instanceof OpenAI.APIError ? error.status : null,
        message,
      });
      if (downloadTimeout) {
        try {
          const parsed = await requestVision(aiInputUrl);
          if (parsed) return parsed;
        } catch (retryError) {
          console.error("Photo Intelligence vision retry failed", {
            message: retryError instanceof Error ? retryError.message : String(retryError),
          });
        }
      }
      visionFailed = true;
      return null;
    }
  }

  const cropPromise = cachedCrop
    ? Promise.resolve(cachedCrop)
    : options?.storedOnly
      ? Promise.resolve(storedGeometry)
      : analyzeSmartCropPhoto(petId, photoId, {
          forceReanalyze: force,
          allowLargeImageDegrade: options?.allowLargeImageDegrade,
        }).then((result) => result.analysis ?? centerAnalysis(technical.signals.width || 1000, technical.signals.height || 1000));

  if (blob.size > MAX_AI_IMAGE_SIZE && options?.allowLargeImageDegrade) {
    const cropAnalysis = await cropPromise;
    const analysis = cropAnalysis ?? centerAnalysis(technical.signals.width || 1000, technical.signals.height || 1000);
    const baseIntelligence = buildPhotoIntelligence({
      photoId: photo.id,
      analysis,
      technical,
      vision: null,
      visionFailed: false,
    });
    const intelligence = {
      ...baseIntelligence,
      warnings: [...baseIntelligence.warnings, "LARGE_IMAGE_SKIPPED"],
    };
    setPhotoIntelligenceCache(cacheKey, { intelligence, parts: technical.parts, signals: signalSnapshot(technical.signals) }, FAILURE_TTL_MS);
    return {
      ok: true,
      message: "画像が5MBを超えるため意味解析をスキップしました。",
      photoId: photo.id,
      petId: pet.id,
      storagePath: photo.storage_path,
      imageUrl: originalUrl,
      previewUrl,
      thumbnailUrl,
      intelligence,
      parts: technical.parts,
      signals: signalSnapshot(technical.signals),
      fromCache: false,
      cropFromCache: Boolean(cachedCrop),
      visionCalled: false,
      visionFailed: false,
      cacheSource: null,
    };
  }

  if (analysisReadPlan({ force, memoryHit: false, dbHit: Boolean(storedVision) }) === "db" && storedVision && stored) {
    const cropAnalysis = await cropPromise;
    if (!cropAnalysis) {
      return emptyResult("保存済みの被写体解析がありません。");
    }
    const analysis = cropAnalysis ?? centerAnalysis(technical.signals.width || 1000, technical.signals.height || 1000);
    const intelligence = buildPhotoIntelligence({
      photoId: photo.id,
      analysis,
      technical,
      vision: storedVision,
      visionFailed: false,
    });
    setPhotoIntelligenceCache(cacheKey, { intelligence, parts: technical.parts, signals: signalSnapshot(technical.signals) }, SUCCESS_TTL_MS);
    noteAnalysisTrace({
      photoId: photo.id,
      analysisType: PHOTO_INTELLIGENCE_SEMANTIC,
      version: PHOTO_INTELLIGENCE_VERSION,
      fingerprint,
      cacheSource: "db",
      status: "success",
      visionCalled: false,
      createdAt: stored.createdAt,
    });
    return {
      ok: true,
      message: null,
      photoId: photo.id,
      petId: pet.id,
      storagePath: photo.storage_path,
      imageUrl: originalUrl,
      previewUrl,
      thumbnailUrl,
      intelligence,
      parts: technical.parts,
      signals: signalSnapshot(technical.signals),
      fromCache: true,
      cropFromCache: Boolean(cachedCrop),
      visionCalled: false,
      visionFailed: false,
      cacheSource: "db",
    };
  }

  const [cropAnalysis, visionResult] = await Promise.all([cropPromise, loadVision()]);
  vision = visionResult;

  const analysis = cropAnalysis ?? centerAnalysis(technical.signals.width || 1000, technical.signals.height || 1000);

  const intelligence = buildPhotoIntelligence({
    photoId: photo.id,
    analysis,
    technical,
    vision,
    visionFailed,
  });

  const status: ResultStatus = vision ? "success" : "fallback";
  const saved = await saveAnalysis(supabase, {
    photoId: photo.id,
    analysisType: PHOTO_INTELLIGENCE_SEMANTIC,
    analysisVersion: PHOTO_INTELLIGENCE_VERSION,
    sourceFingerprint: fingerprint,
    resultStatus: status,
    result: vision ? semanticJson(vision, intelligence.overallScore) : { reason: visionFailed ? "vision_failed" : "vision_skipped" },
    existingStatus: stored?.resultStatus ?? null,
  });
  if (!(force && saved.reason === "success_immutable")) {
    setPhotoIntelligenceCache(
      cacheKey,
      {
        intelligence,
        parts: technical.parts,
        signals: signalSnapshot(technical.signals),
      },
      visionFailed ? FAILURE_TTL_MS : SUCCESS_TTL_MS,
    );
  }
  noteAnalysisTrace({
    photoId: photo.id,
    analysisType: PHOTO_INTELLIGENCE_SEMANTIC,
    version: PHOTO_INTELLIGENCE_VERSION,
    fingerprint,
    cacheSource: "ai",
    status,
    visionCalled,
    createdAt: null,
  });

  return {
    ok: true,
    message: null,
    photoId: photo.id,
    petId: pet.id,
    storagePath: photo.storage_path,
    imageUrl: originalUrl,
    previewUrl,
    thumbnailUrl,
    intelligence,
    parts: technical.parts,
    signals: signalSnapshot(technical.signals),
    fromCache: false,
    cropFromCache: Boolean(cachedCrop),
    visionCalled,
    visionFailed,
    cacheSource: "ai",
  };
}
