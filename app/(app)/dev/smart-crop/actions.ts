"use server";

import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  getSmartCropCache,
  setSmartCropCache,
  smartCropCacheKey,
} from "@/lib/smart-crop/cache";
import { SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "@/lib/photo-analysis/constants";
import { sourceFingerprint } from "@/lib/photo-analysis/fingerprint";
import { analysisReadPlan, reusableAnalysis } from "@/lib/photo-analysis/policy";
import { readAnalysis, saveAnalysis } from "@/lib/photo-analysis/repository";
import { parseStoredGeometry } from "@/lib/photo-analysis/stored";
import { noteAnalysisTrace, noteVisionCall } from "@/lib/photo-analysis/trace";
import type { Json } from "@/lib/supabase/database.types";
import type { ResultStatus } from "@/lib/photo-analysis/constants";
import { buildSmartCropFrameResults } from "@/lib/smart-crop/compute";
import { rankFramesFromCropResults } from "@/lib/smart-crop/frame-match";
import { readImageDimensions } from "@/lib/smart-crop/image-size";
import type {
  FrameMatchRanking,
  SmartCropFrameResult,
  SmartCropPhotoAnalysis,
} from "@/lib/smart-crop/types";
import {
  parseSmartCropVisionOutput,
  SMART_CROP_VISION_PROMPT,
  SMART_CROP_VISION_SCHEMA,
} from "@/lib/smart-crop/vision-parse";

const DEFAULT_VISION_MODEL = "gpt-4o";
const MAX_AI_IMAGE_SIZE = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type SmartCropAnalyzeResult = {
  ok: boolean;
  message: string | null;
  warning: string | null;
  photoId: string | null;
  petId: string | null;
  /** Full original (Vision / analysis). */
  imageUrl: string | null;
  /** Prefer thumbnail for UI preview (falls back to imageUrl). */
  previewUrl: string | null;
  analysis: SmartCropPhotoAnalysis | null;
  frames: SmartCropFrameResult[];
  /** Task049 — Photo × Frame Matching ranking */
  frameMatch: FrameMatchRanking | null;
  fromCache: boolean;
  cacheSource: "memory" | "db" | "ai" | null;
};

function emptyResult(message: string): SmartCropAnalyzeResult {
  return {
    ok: false,
    message,
    warning: null,
    photoId: null,
    petId: null,
    imageUrl: null,
    previewUrl: null,
    analysis: null,
    frames: [],
    frameMatch: null,
    fromCache: false,
    cacheSource: null,
  };
}

function geometryStatus(analysis: SmartCropPhotoAnalysis): ResultStatus {
  const warning = analysis.warning ?? "";
  if (
    warning.startsWith("OPENAI_API_KEY") ||
    warning.startsWith("解析結果を解釈") ||
    warning.startsWith("解析に失敗")
  ) {
    return "fallback";
  }
  return "success";
}

function asJson(value: SmartCropPhotoAnalysis): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
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
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function buildFrameResults(
  analysis: SmartCropPhotoAnalysis,
): SmartCropFrameResult[] {
  return buildSmartCropFrameResults(analysis);
}

function buildMatch(
  analysis: SmartCropPhotoAnalysis,
  frames: SmartCropFrameResult[],
): FrameMatchRanking {
  return rankFramesFromCropResults(analysis, frames);
}

function withFramesAndMatch(analysis: SmartCropPhotoAnalysis): {
  frames: SmartCropFrameResult[];
  frameMatch: FrameMatchRanking;
} {
  const frames = buildFrameResults(analysis);
  return { frames, frameMatch: buildMatch(analysis, frames) };
}

function centerFallbackAnalysis(
  width: number,
  height: number,
  warning: string,
): SmartCropPhotoAnalysis {
  const ratio = height > 0 ? width / height : 1;
  return {
    width,
    height,
    pets: [],
    focalPoint: { x: 0.5, y: 0.5 },
    orientation:
      ratio > 1.08 ? "landscape" : ratio < 0.92 ? "portrait" : "square",
    warning,
  };
}

/**
 * Task048 — on-demand Smart Crop analysis (not the durable photo_ai_analyses queue).
 */
export async function analyzeSmartCropPhoto(
  petId: string,
  photoId: string,
  options?: { forceReanalyze?: boolean },
): Promise<SmartCropAnalyzeResult> {
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(photoId)) {
    return emptyResult("不正なIDです。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return emptyResult("ログインが必要です。");
  }

  const [petResult, photoResult] = await Promise.all([
    supabase
      .from("pets")
      .select("id, owner_user_id")
      .eq("id", petId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, updated_at, content_hash")
      .eq("id", photoId)
      .eq("pet_id", petId)
      .eq("uploader_user_id", user.id)
      .maybeSingle(),
  ]);

  const pet = petResult.data;
  const photo = photoResult.data;
  if (
    petResult.error ||
    photoResult.error ||
    !pet ||
    !photo ||
    pet.owner_user_id !== user.id ||
    photo.uploader_user_id !== user.id
  ) {
    return emptyResult("写真を読み込めませんでした。");
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("pet-photos")
    .createSignedUrl(photo.storage_path, 3600);
  if (signError || !signed?.signedUrl) {
    return emptyResult("写真URLの発行に失敗しました。");
  }

  let previewUrl = signed.signedUrl;
  if (photo.thumbnail_path) {
    const { data: thumb } = await supabase.storage
      .from("pet-photo-thumbnails")
      .createSignedUrl(photo.thumbnail_path, 3600);
    if (thumb?.signedUrl) previewUrl = thumb.signedUrl;
  }

  const fingerprint = sourceFingerprint(photo);
  const cacheKey = smartCropCacheKey(photo.id, photo.storage_path, fingerprint, SUBJECT_GEOMETRY_VERSION);
  const force = options?.forceReanalyze === true;
  const cached = force ? null : getSmartCropCache(cacheKey);
  if (analysisReadPlan({ force, memoryHit: Boolean(cached), dbHit: false }) === "memory" && cached) {
      noteAnalysisTrace({
        photoId: photo.id,
        analysisType: SUBJECT_GEOMETRY,
        version: SUBJECT_GEOMETRY_VERSION,
        fingerprint,
        cacheSource: "memory",
        status: geometryStatus(cached),
        visionCalled: false,
        createdAt: null,
      });
      const matched = withFramesAndMatch(cached);
      return {
        ok: true,
        message: null,
        warning: cached.warning ?? null,
        photoId: photo.id,
        petId: pet.id,
        imageUrl: signed.signedUrl,
        previewUrl,
        analysis: cached,
        frames: matched.frames,
        frameMatch: matched.frameMatch,
        fromCache: true,
        cacheSource: "memory",
      };
  }

  const stored = force
    ? null
    : await readAnalysis(supabase, photo.id, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION, fingerprint);
  const reusable = reusableAnalysis(
    stored
      ? {
          analysisVersion: stored.analysisVersion,
          sourceFingerprint: stored.sourceFingerprint,
          resultStatus: stored.resultStatus,
          result: stored.result,
        }
      : null,
    { analysisVersion: SUBJECT_GEOMETRY_VERSION, sourceFingerprint: fingerprint },
  );
  const storedGeometry = reusable ? parseStoredGeometry(reusable.result) : null;
  if (analysisReadPlan({ force, memoryHit: false, dbHit: Boolean(storedGeometry) }) === "db" && stored && storedGeometry) {
    setSmartCropCache(cacheKey, storedGeometry);
    noteAnalysisTrace({
      photoId: photo.id,
      analysisType: SUBJECT_GEOMETRY,
      version: SUBJECT_GEOMETRY_VERSION,
      fingerprint,
      cacheSource: "db",
      status: "success",
      visionCalled: false,
      createdAt: stored.createdAt,
    });
    const { frames, frameMatch } = withFramesAndMatch(storedGeometry);
    return {
      ok: true,
      message: null,
      warning: storedGeometry.warning ?? null,
      photoId: photo.id,
      petId: pet.id,
      imageUrl: signed.signedUrl,
      previewUrl,
      analysis: storedGeometry,
      frames,
      frameMatch,
      fromCache: true,
      cacheSource: "db",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model =
    process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

  const { data: blob, error: downloadError } = await supabase.storage
    .from("pet-photos")
    .download(photo.storage_path);
  if (downloadError || !blob || blob.size <= 0) {
    return emptyResult("写真をダウンロードできませんでした。");
  }
  if (!ALLOWED_MIME.has(blob.type)) {
    return emptyResult("この画像形式は対応していません。");
  }
  if (blob.size > MAX_AI_IMAGE_SIZE) {
    return emptyResult("AI解析できる画像サイズは5MBまでです。");
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

  const dims =
    readImageDimensions(imageBytes, blob.type) ?? { width: 1000, height: 1000 };

  const ownedPhotoId = photo.id;
  const ownedPetId = pet.id;
  const imageUrl = signed.signedUrl;

  async function finishAi(
    analysis: SmartCropPhotoAnalysis,
    visionCalled: boolean,
    persistMemory: boolean,
  ): Promise<SmartCropAnalyzeResult> {
    const status = geometryStatus(analysis);
    const saved = await saveAnalysis(supabase, {
      photoId: ownedPhotoId,
      analysisType: SUBJECT_GEOMETRY,
      analysisVersion: SUBJECT_GEOMETRY_VERSION,
      sourceFingerprint: fingerprint,
      resultStatus: status,
      result: asJson(analysis),
      existingStatus: stored?.resultStatus ?? null,
    });
    if (persistMemory && !(force && saved.reason === "success_immutable")) {
      setSmartCropCache(cacheKey, analysis);
    }
    noteAnalysisTrace({
      photoId: ownedPhotoId,
      analysisType: SUBJECT_GEOMETRY,
      version: SUBJECT_GEOMETRY_VERSION,
      fingerprint,
      cacheSource: "ai",
      status,
      visionCalled,
      createdAt: null,
    });
    return {
      ok: true,
      message: null,
      warning: analysis.warning ?? null,
      photoId: ownedPhotoId,
      petId: ownedPetId,
      imageUrl,
      previewUrl,
      analysis,
      ...withFramesAndMatch(analysis),
      fromCache: false,
      cacheSource: "ai",
    };
  }

  if (!apiKey) {
    const analysis = centerFallbackAnalysis(
      dims.width,
      dims.height,
      "OPENAI_API_KEY が未設定のため、中央基準で表示しています。",
    );
    return finishAi(analysis, false, true);
  }

  try {
    const openai = new OpenAI({
      apiKey,
      timeout: 60_000,
      maxRetries: 0,
    });
    noteVisionCall();
    // Prefer signed URL over huge base64 (multi-MB originals).
    const response = await openai.responses.create({
      model,
      store: false,
      max_output_tokens: 900,
      instructions: SMART_CROP_VISION_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Detect pets, faces (include ears), and focalPoint for Smart Crop. Coordinates normalized 0–1.",
            },
            {
              type: "input_image",
              image_url: signed.signedUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "uchinoco_smart_crop_analysis",
          description: "Pet subject boxes for Smart Crop",
          strict: true,
          schema: SMART_CROP_VISION_SCHEMA,
        },
      },
    });

    let analysis = parseSmartCropVisionOutput(
      response.output_text,
      dims.width,
      dims.height,
    );

    if (!analysis) {
      console.error("Smart Crop parse failed", {
        outputPreview: (response.output_text ?? "").slice(0, 400),
      });
      analysis = centerFallbackAnalysis(
        dims.width,
        dims.height,
        "解析結果を解釈できませんでした。中央基準で表示しています。",
      );
      return finishAi(analysis, true, false);
    }
    if (analysis.pets.length === 0) {
      analysis = {
        ...analysis,
        warning: "ペットを十分に検出できませんでした。中央基準で表示しています。",
      };
    }
    return finishAi(analysis, true, true);
  } catch (error) {
    console.error("Smart Crop analysis failed", {
      status: error instanceof OpenAI.APIError ? error.status : null,
      message: error instanceof Error ? error.message : String(error),
    });
    const analysis = centerFallbackAnalysis(
      dims.width,
      dims.height,
      "解析に失敗しました。中央基準で表示しています。",
    );
    return finishAi(analysis, true, false);
  }
}
