import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mapDecorationRow, mapTextRow } from "../album-polish/rows.ts";
import { assembleEditorSpread } from "./editor.ts";
import type { DraftFrameRow, DraftSpreadRow } from "./types.ts";
import type { PersistedDraftView, PersistenceResult } from "./view.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function fail(message: string): PersistenceResult {
  return { ok: false, message, writeStatus: null, view: null };
}

export function messageFromError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("注文済み")) return "このアルバムは注文済みのため変更できません。";
  if (message.includes("AI State")) return "AI初期値は変更できません。";
  if (message.includes("この写真は")) return "この写真はこのアルバムに使えません。";
  if (message.includes("文字数")) return "文字数が上限を超えています。";
  if (message.includes("プレーンテキスト")) return "テキストはプレーンテキストのみです。";
  if (message.includes("文字スタイル")) return "未対応の文字スタイルです。";
  if (message.includes("使えない位置")) return "このレイアウトには使えない位置です。";
  if (message.includes("装飾は見開き")) return "装飾は見開きあたり3つまでです。";
  if (message.includes("未対応の装飾")) return "未対応の装飾です。";
  if (message.includes("not found")) return "アルバムが見つかりません。";
  return message || "保存に失敗しました。";
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function mapSpread(row: Record<string, unknown>): DraftSpreadRow {
  return {
    id: String(row.id),
    draftVersionId: String(row.draft_version_id),
    storySpreadId: String(row.story_spread_id),
    position: num(row.position),
    storyType: String(row.story_type),
    recommendedDensity: String(row.recommended_density),
    importance: num(row.importance),
    coherence: num(row.coherence),
    aiLayoutId: String(row.ai_layout_id),
    userLayoutId: row.user_layout_id == null ? null : String(row.user_layout_id),
    warnings: asWarnings(row.warnings),
    revision: num(row.revision),
    clientSeq: num(row.client_seq),
  };
}

export function mapFrame(row: Record<string, unknown>): DraftFrameRow {
  return {
    id: String(row.id),
    draftSpreadId: String(row.draft_spread_id),
    frameId: String(row.frame_id),
    role: String(row.role),
    position: num(row.position),
    aiPhotoId: String(row.ai_photo_id),
    aiCropX: num(row.ai_crop_x),
    aiCropY: num(row.ai_crop_y),
    aiCropScale: num(row.ai_crop_scale),
    userPhotoId: row.user_photo_id == null ? null : String(row.user_photo_id),
    userCropX: nullableNum(row.user_crop_x),
    userCropY: nullableNum(row.user_crop_y),
    userCropScale: nullableNum(row.user_crop_scale),
    matchTier: row.match_tier == null ? null : String(row.match_tier),
    cropQuality: row.crop_quality == null ? null : num(row.crop_quality),
    warnings: asWarnings(row.warnings),
    revision: num(row.revision),
    clientSeq: num(row.client_seq),
  };
}

const ORIGINAL_URL_CACHE_MS = 10 * 60 * 1000;

type OriginalUrlCacheEntry = {
  storagePath: string;
  url: string;
  expiresAt: number;
};

const originalUrlCache = new Map<string, OriginalUrlCacheEntry>();

/** Original pet-photos URLs, reused per photo while the signature is still fresh. */
export async function signedUrls(supabase: Supabase, photoIds: string[], refresh = false) {
  const ids = [...new Set(photoIds)];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data: photos } = await supabase.from("photos").select("id, storage_path").in("id", ids);
  const now = Date.now();
  await Promise.all(
    (photos ?? []).map(async (photo) => {
      const cached = originalUrlCache.get(photo.id);
      if (!refresh && cached && cached.storagePath === photo.storage_path && cached.expiresAt > now) {
        map.set(photo.id, cached.url);
        return;
      }
      const signed = await supabase.storage.from("pet-photos").createSignedUrl(photo.storage_path, 3600);
      if (!signed.data?.signedUrl) return;
      originalUrlCache.set(photo.id, {
        storagePath: photo.storage_path,
        url: signed.data.signedUrl,
        expiresAt: now + ORIGINAL_URL_CACHE_MS,
      });
      map.set(photo.id, signed.data.signedUrl);
    }),
  );
  return map;
}

/** Active draft only. Does not create a version and does not run album generation. */
export async function readDraft(
  supabase: Supabase,
  albumId: string,
  options?: { refreshUrls?: boolean },
): Promise<PersistedDraftView | null> {
  const { data: version } = await supabase
    .from("album_draft_versions")
    .select("id, album_id, status, revision, generation_metadata")
    .eq("album_id", albumId)
    .eq("is_active", true)
    .maybeSingle();
  if (!version) return null;
  const { data: spreadRows } = await supabase
    .from("album_draft_spreads")
    .select("*")
    .eq("draft_version_id", version.id)
    .order("position", { ascending: true });
  const spreads = (spreadRows ?? []).map((row) => mapSpread(row as Record<string, unknown>));
  const spreadIds = spreads.map((spread) => spread.id);
  const { data: frameRows } = spreadIds.length
    ? await supabase.from("album_draft_frames").select("*").in("draft_spread_id", spreadIds)
    : { data: [] };
  const frames = (frameRows ?? []).map((row) => mapFrame(row as Record<string, unknown>));
  const { data: textRows } = spreadIds.length
    ? await supabase.from("album_draft_text_elements").select("*").in("draft_spread_id", spreadIds)
    : { data: [] };
  const { data: decorationRows } = spreadIds.length
    ? await supabase.from("album_draft_decorations").select("*").in("draft_spread_id", spreadIds)
    : { data: [] };
  const texts = (textRows ?? []).map((row) => mapTextRow(row as Record<string, unknown>));
  const decorations = (decorationRows ?? []).map((row) => mapDecorationRow(row as Record<string, unknown>));
  const urls = await signedUrls(
    supabase,
    frames.flatMap((frame) => [frame.aiPhotoId, frame.userPhotoId].filter((id): id is string => Boolean(id))),
    options?.refreshUrls === true,
  );
  const metadata = (version.generation_metadata ?? {}) as { signature?: string };
  return {
    albumId,
    versionId: version.id,
    status: version.status,
    revision: num(version.revision),
    signature: metadata.signature ?? "",
    previewUrls: Object.fromEntries(urls),
    spreads: spreads.map((spread) =>
      assembleEditorSpread(
        spread,
        frames.filter((frame) => frame.draftSpreadId === spread.id),
        urls,
        texts.filter((item) => item.draftSpreadId === spread.id),
        decorations.filter((item) => item.draftSpreadId === spread.id),
      ),
    ),
  };
}
