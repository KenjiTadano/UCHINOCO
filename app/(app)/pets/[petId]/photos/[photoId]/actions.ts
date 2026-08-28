"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AnalyzePhotoState = {
  success: boolean;
  message: string | null;
};

const PROMPT_VERSION = "photo-analysis-v1";
const DEFAULT_VISION_MODEL = "gpt-4o";
const MAX_AI_IMAGE_SIZE = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ACTIVITIES = new Set([
  "散歩",
  "睡眠",
  "食事",
  "遊び",
  "お出かけ",
  "抱っこ",
  "その他",
]);
const SCENES = new Set([
  "室内",
  "公園",
  "道路",
  "海",
  "山",
  "カフェ",
  "車内",
  "その他",
]);
const EMOTIONS = new Set(["リラックス", "楽しそう", "眠そう", "不明"]);

type PhotoAnalysis = {
  description: string;
  tags: string[];
  activity: string;
  scene: string;
  emotion: string;
  contains_pet: boolean;
};

const PHOTO_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: {
      type: "string",
      description: "写真から確認できる内容の簡潔な日本語説明",
    },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    activity: {
      type: "string",
      enum: Array.from(ACTIVITIES),
    },
    scene: {
      type: "string",
      enum: Array.from(SCENES),
    },
    emotion: {
      type: "string",
      enum: Array.from(EMOTIONS),
    },
    contains_pet: { type: "boolean" },
  },
  required: [
    "description",
    "tags",
    "activity",
    "scene",
    "emotion",
    "contains_pet",
  ],
} as const;

const ANALYSIS_PROMPT = `
この写真を、ペットの思い出アルバム用に日本語で分析してください。
写真に写っている事実だけを簡潔に説明し、判断できない情報は作らないでください。
動物の感情は表情や姿勢から明確に推測できる場合だけ候補を選び、それ以外は「不明」にしてください。
健康状態、病気、品種、個体識別を断定しないでください。
タグは検索しやすい短い日本語を最大10件にしてください。
`.trim();

function analysisClient(client: Awaited<ReturnType<typeof createClient>>) {
  // Task 009 migration適用・型再生成までの限定的な型境界。
  return client as unknown as SupabaseClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAnalysis(value: string): PhotoAnalysis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const description =
    typeof parsed.description === "string" ? parsed.description.trim() : "";
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    : [];
  if (
    description.length === 0 ||
    description.length > 500 ||
    tags.length > 10 ||
    tags.some((tag) => tag.length === 0 || tag.length > 30) ||
    new Set(tags).size !== tags.length ||
    typeof parsed.activity !== "string" ||
    !ACTIVITIES.has(parsed.activity) ||
    typeof parsed.scene !== "string" ||
    !SCENES.has(parsed.scene) ||
    typeof parsed.emotion !== "string" ||
    !EMOTIONS.has(parsed.emotion) ||
    typeof parsed.contains_pet !== "boolean"
  ) {
    return null;
  }

  return {
    description,
    tags,
    activity: parsed.activity,
    scene: parsed.scene,
    emotion: parsed.emotion,
    contains_pet: parsed.contains_pet,
  };
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

function errorState(message: string): AnalyzePhotoState {
  return { success: false, message };
}

export async function analyzePhoto(
  petId: string,
  photoId: string,
  _previousState: AnalyzePhotoState,
  _formData: FormData,
): Promise<AnalyzePhotoState> {
  void _previousState;
  void _formData;

  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(photoId)) {
    return errorState("写真を確認できませんでした。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorState("ログイン状態を確認してください。");
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
      .select("id, pet_id, storage_path")
      .eq("id", photoId)
      .eq("pet_id", petId)
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
    photo.pet_id !== pet.id
  ) {
    return errorState("写真を確認できませんでした。");
  }

  const client = analysisClient(supabase);
  const { data: existing, error: existingError } = await client
    .from("photo_ai_analyses")
    .select("id, status")
    .eq("photo_id", photo.id)
    .maybeSingle();
  if (existingError) {
    return errorState("AI解析を開始できませんでした。");
  }
  if (existing?.status === "completed") {
    return errorState("この写真はすでにAI解析済みです。");
  }
  if (existing?.status === "processing") {
    return errorState("この写真はAI解析中です。");
  }

  let analysisId: string | null = null;
  if (existing) {
    const { data: claimed, error: claimError } = await client
      .from("photo_ai_analyses")
      .update({
        status: "processing",
        description: null,
        tags: [],
        activity: null,
        scene: null,
        emotion: null,
        contains_pet: null,
        model: null,
        prompt_version: PROMPT_VERSION,
        error_code: null,
        analyzed_at: null,
      })
      .eq("id", existing.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      return errorState("この写真は現在AI解析できません。");
    }
    analysisId = claimed.id;
  } else {
    const { data: created, error: createError } = await client
      .from("photo_ai_analyses")
      .insert({
        photo_id: photo.id,
        status: "processing",
        prompt_version: PROMPT_VERSION,
      })
      .select("id")
      .maybeSingle();
    if (createError || !created) {
      return errorState("この写真は現在AI解析できません。");
    }
    analysisId = created.id;
  }

  async function markFailed(errorCode: string) {
    await client
      .from("photo_ai_analyses")
      .update({ status: "failed", error_code: errorCode })
      .eq("id", analysisId)
      .eq("status", "processing");
    revalidatePath(`/pets/${petId}/photos/${photoId}`);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const configuredModel =
    process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  if (!apiKey) {
    await markFailed("configuration_missing");
    return errorState("AI解析の設定が完了していません。");
  }

  const { data: image, error: downloadError } = await supabase.storage
    .from("pet-photos")
    .download(photo.storage_path);
  if (downloadError || !image || image.size <= 0) {
    await markFailed("storage_download_failed");
    return errorState("写真を読み込めませんでした。");
  }
  if (!ALLOWED_MIME_TYPES.has(image.type)) {
    await markFailed("unsupported_image");
    return errorState("この画像形式はAI解析に対応していません。");
  }
  if (image.size > MAX_AI_IMAGE_SIZE) {
    await markFailed("image_too_large");
    return errorState("AI解析できる画像サイズは5MBまでです。");
  }

  let imageBytes: Uint8Array;
  try {
    imageBytes = new Uint8Array(await image.arrayBuffer());
  } catch {
    await markFailed("image_read_failed");
    return errorState("写真を読み込めませんでした。");
  }
  if (!hasExpectedImageSignature(image.type, imageBytes.slice(0, 12))) {
    await markFailed("invalid_image_content");
    return errorState("画像の内容を確認できませんでした。");
  }

  try {
    const openai = new OpenAI({
      apiKey,
      timeout: 45_000,
      maxRetries: 0,
    });
    const imageDataUrl = `data:${image.type};base64,${Buffer.from(imageBytes).toString("base64")}`;
    const response = await openai.responses.create({
      model: configuredModel,
      store: false,
      max_output_tokens: 600,
      instructions: ANALYSIS_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "この思い出写真を指定されたJSON Schemaに従って解析してください。",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "low",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "uchinoco_photo_analysis",
          description: "ペットの思い出写真から確認できる情報",
          strict: true,
          schema: PHOTO_ANALYSIS_SCHEMA,
        },
      },
    });
    const parsed = parseAnalysis(response.output_text);
    if (!parsed) {
      await markFailed("invalid_structured_output");
      return errorState("AI解析結果を確認できませんでした。再試行してください。");
    }

    const { data: completed, error: completeError } = await client
      .from("photo_ai_analyses")
      .update({
        status: "completed",
        description: parsed.description,
        tags: parsed.tags,
        activity: parsed.activity,
        scene: parsed.scene,
        emotion: parsed.emotion,
        contains_pet: parsed.contains_pet,
        model: response.model || configuredModel,
        prompt_version: PROMPT_VERSION,
        error_code: null,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (completeError || !completed) {
      await markFailed("database_update_failed");
      return errorState("AI解析結果を保存できませんでした。");
    }

    revalidatePath(`/pets/${petId}/photos/${photoId}`);
    return { success: true, message: "AI解析が完了しました。" };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API request failed", {
        status: error.status,
        code: error.code,
        type: error.type,
        ...(error.requestID ? { request_id: error.requestID } : {}),
      });
    }

    const errorCode =
      error instanceof Error && error.name.toLowerCase().includes("timeout")
        ? "openai_timeout"
        : "openai_request_failed";
    await markFailed(errorCode);
    return errorState("AI解析に失敗しました。時間をおいて再度お試しください。");
  }
}
