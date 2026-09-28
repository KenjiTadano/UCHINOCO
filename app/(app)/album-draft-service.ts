"use server";

import {
  decorationIdIssue,
  decorationSlotIssue,
  plainTextIssue,
  slotKind,
  styleIssue,
  textSlotIssue,
} from "@/lib/album-polish/catalog";
import type { OverrideMode, ScalePreset, TextKind, TextStyleId } from "@/lib/album-polish/types";
import {
  isCoverColorId,
  isCoverTemplateId,
  mapDraftCoverRow,
  toCoverEditor,
  type CoverEditorModel,
  type CoverField,
  type DraftCoverRow,
} from "@/lib/album-persistence/cover";
import { EDITOR_MISSING_DRAFT_MESSAGE } from "@/lib/album-persistence/editor";
import { fail, messageFromError, readDraft, signedUrls } from "@/lib/album-persistence/read-draft";
import type { CropTriple, WriteStatus } from "@/lib/album-persistence/types";
import type { DraftEditorLoad, PersistenceResult } from "@/lib/album-persistence/view";
import { createListImageUrls } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function finishWrite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  albumId: string,
  writeStatus: PersistenceResult["writeStatus"],
): Promise<PersistenceResult> {
  const view = await readDraft(supabase, albumId);
  if (!view) return fail("保存後の読み込みに失敗しました。");
  return {
    ok: writeStatus !== "conflict" && writeStatus !== "missing",
    message: writeStatus === "conflict" ? "保存が競合しました。再試行できます。" : null,
    writeStatus,
    view,
  };
}

async function albumIdForSpread(supabase: Awaited<ReturnType<typeof createClient>>, spreadId: string) {
  const { data } = await supabase
    .from("album_draft_spreads")
    .select("draft_version_id, album_draft_versions(album_id)")
    .eq("id", spreadId)
    .maybeSingle();
  const nested = data?.album_draft_versions as { album_id?: string } | { album_id?: string }[] | null;
  const album = Array.isArray(nested) ? nested[0] : nested;
  return album?.album_id ?? null;
}

export async function loadActiveDraft(
  albumId: string,
  options?: { refreshUrls?: boolean },
): Promise<DraftEditorLoad> {
  if (!UUID_PATTERN.test(albumId)) return { ...fail("不正なIDです。"), albumStatus: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...fail("ログインが必要です。"), albumStatus: null };
  const { data: album } = await supabase
    .from("albums")
    .select("id, status")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!album) return { ...fail("アルバムが見つかりません。"), albumStatus: null };
  const view = await readDraft(supabase, albumId, options);
  if (!view) {
    return { ok: false, message: EDITOR_MISSING_DRAFT_MESSAGE, writeStatus: null, view: null, albumStatus: album.status };
  }
  return { ok: true, message: null, writeStatus: null, view, albumStatus: album.status };
}

export async function refreshDraftPhotoUrls(albumId: string): Promise<{
  ok: boolean;
  message: string | null;
  urls: Record<string, string>;
}> {
  const loaded = await loadActiveDraft(albumId, { refreshUrls: true });
  if (!loaded.view) return { ok: false, message: loaded.message, urls: {} };
  return { ok: true, message: null, urls: loaded.view.previewUrls };
}

export async function loadEditorCandidates(petId: string): Promise<{ id: string; src: string; thumb: string }[]> {
  if (!UUID_PATTERN.test(petId)) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: pet } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) return [];
  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, thumbnail_path")
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .order("taken_at", { ascending: false })
    .limit(80);
  const rows = photos ?? [];
  const originals = await signedUrls(
    supabase,
    rows.map((photo) => photo.id),
  );
  const listed = await createListImageUrls(supabase, rows);
  return rows.flatMap((photo) => {
    const src = originals.get(photo.id);
    if (!src) return [];
    const thumb = photo.thumbnail_path ? listed.signedUrlByPath.get(photo.thumbnail_path) ?? src : src;
    return [{ id: photo.id, src, thumb }];
  });
}

export async function overrideSpreadLayout(
  spreadId: string,
  expectedRevision: number,
  clientSeq: number,
  userLayoutId: string | null,
): Promise<PersistenceResult> {
  if (!UUID_PATTERN.test(spreadId)) return fail("不正なIDです。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("ログインが必要です。");
  const albumId = await albumIdForSpread(supabase, spreadId);
  if (!albumId) return fail("見開きが見つかりません。");
  const updated = await supabase.rpc("apply_draft_spread_layout", {
    p_spread_id: spreadId,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_user_layout_id: userLayoutId,
    p_reset: userLayoutId == null,
  });
  if (updated.error) return fail(messageFromError(updated.error));
  const status = (updated.data as { status?: PersistenceResult["writeStatus"] } | null)?.status ?? "missing";
  return finishWrite(supabase, albumId, status);
}

export async function overrideFrameCrop(
  frameId: string,
  expectedRevision: number,
  clientSeq: number,
  crop: CropTriple | null,
  debugDelayMs = 0,
): Promise<PersistenceResult> {
  if (!UUID_PATTERN.test(frameId)) return fail("不正なIDです。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("ログインが必要です。");
  if (process.env.NODE_ENV !== "production" && debugDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(debugDelayMs, 2000)));
  }
  const { data: frame } = await supabase.from("album_draft_frames").select("draft_spread_id").eq("id", frameId).maybeSingle();
  if (!frame) return fail("フレームが見つかりません。");
  const albumId = await albumIdForSpread(supabase, frame.draft_spread_id);
  if (!albumId) return fail("見開きが見つかりません。");
  const updated = await supabase.rpc("apply_draft_frame_override", {
    p_frame_id: frameId,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_user_photo_id: null,
    p_clear_photo: false,
    p_crop_x: crop?.x ?? null,
    p_crop_y: crop?.y ?? null,
    p_crop_scale: crop?.scale ?? null,
    p_clear_crop: crop == null,
  });
  if (updated.error) return fail(messageFromError(updated.error));
  const status = (updated.data as { status?: PersistenceResult["writeStatus"] } | null)?.status ?? "missing";
  return finishWrite(supabase, albumId, status);
}

export async function overrideFramePhoto(
  frameId: string,
  expectedRevision: number,
  clientSeq: number,
  photoId: string | null,
): Promise<PersistenceResult> {
  if (!UUID_PATTERN.test(frameId)) return fail("不正なIDです。");
  if (photoId && !UUID_PATTERN.test(photoId)) return fail("不正なIDです。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("ログインが必要です。");
  const { data: frame } = await supabase.from("album_draft_frames").select("draft_spread_id").eq("id", frameId).maybeSingle();
  if (!frame) return fail("フレームが見つかりません。");
  const albumId = await albumIdForSpread(supabase, frame.draft_spread_id);
  if (!albumId) return fail("見開きが見つかりません。");
  if (photoId) {
    const { data: album } = await supabase
      .from("albums")
      .select("id, pet_id, owner_user_id")
      .eq("id", albumId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    const { data: photo } = await supabase
      .from("photos")
      .select("id, pet_id, uploader_user_id")
      .eq("id", photoId)
      .maybeSingle();
    if (!album || !photo || photo.pet_id !== album.pet_id || photo.uploader_user_id !== user.id) {
      return fail("この写真はこのアルバムに使えません。");
    }
  }
  const updated = await supabase.rpc("apply_draft_frame_override", {
    p_frame_id: frameId,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_user_photo_id: photoId,
    p_clear_photo: photoId == null,
    p_crop_x: null,
    p_crop_y: null,
    p_crop_scale: null,
    p_clear_crop: false,
  });
  if (updated.error) return fail(messageFromError(updated.error));
  const status = (updated.data as { status?: PersistenceResult["writeStatus"] } | null)?.status ?? "missing";
  return finishWrite(supabase, albumId, status);
}

export type CoverSeed = {
  aiPhotoId: string | null;
  aiTitle: string;
  aiSubtitle: string;
};

export type CoverEditorLoad = {
  ok: boolean;
  message: string | null;
  cover: CoverEditorModel | null;
  albumStatus: string | null;
};

export type CoverWriteResult = {
  ok: boolean;
  message: string | null;
  writeStatus: WriteStatus | null;
  cover: CoverEditorModel | null;
};

async function coverModel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: DraftCoverRow,
  refresh = false,
): Promise<CoverEditorModel> {
  const ids = [row.aiPhotoId, row.userPhotoId].filter((id): id is string => Boolean(id));
  const urls = await signedUrls(supabase, ids, refresh);
  return toCoverEditor(row, Object.fromEntries(urls));
}

/**
 * Reads the cover on the active draft. Inserts the AI/default row once when
 * the draft exists and the cover row does not. Never regenerates the album.
 */
export async function loadCoverEditor(
  albumId: string,
  seed: CoverSeed,
  options?: { refreshUrls?: boolean },
): Promise<CoverEditorLoad> {
  if (!UUID_PATTERN.test(albumId)) return { ok: false, message: "不正なIDです。", cover: null, albumStatus: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "ログインが必要です。", cover: null, albumStatus: null };
  const { data: album } = await supabase
    .from("albums")
    .select("id, status")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!album) return { ok: false, message: "アルバムが見つかりません。", cover: null, albumStatus: null };
  const { data: version } = await supabase
    .from("album_draft_versions")
    .select("id")
    .eq("album_id", albumId)
    .eq("is_active", true)
    .maybeSingle();
  if (!version) {
    return { ok: false, message: EDITOR_MISSING_DRAFT_MESSAGE, cover: null, albumStatus: album.status };
  }
  const { data: existing } = await supabase
    .from("album_draft_covers")
    .select("*")
    .eq("draft_version_id", version.id)
    .maybeSingle();
  let row = existing as Record<string, unknown> | null;
  if (!row) {
    const inserted = await supabase
      .from("album_draft_covers")
      .insert({
        draft_version_id: version.id,
        cover_type: "front",
        ai_photo_id: seed.aiPhotoId,
        ai_title: seed.aiTitle,
        ai_subtitle: seed.aiSubtitle,
        ai_template_id: "simple",
        ai_color_id: "white",
      })
      .select("*")
      .maybeSingle();
    if (inserted.error?.code === "23505") {
      const again = await supabase
        .from("album_draft_covers")
        .select("*")
        .eq("draft_version_id", version.id)
        .maybeSingle();
      row = again.data as Record<string, unknown> | null;
    } else if (inserted.error) {
      return { ok: false, message: messageFromError(inserted.error), cover: null, albumStatus: album.status };
    } else {
      row = inserted.data as Record<string, unknown> | null;
    }
  }
  if (!row) return { ok: false, message: "表紙の読み込みに失敗しました。", cover: null, albumStatus: album.status };
  return {
    ok: true,
    message: null,
    cover: await coverModel(supabase, mapDraftCoverRow(row), options?.refreshUrls === true),
    albumStatus: album.status,
  };
}

export async function refreshCoverPhotoUrls(albumId: string, seed: CoverSeed): Promise<{
  ok: boolean;
  message: string | null;
  urls: Record<string, string>;
}> {
  const loaded = await loadCoverEditor(albumId, seed, { refreshUrls: true });
  if (!loaded.cover) return { ok: false, message: loaded.message, urls: {} };
  return { ok: true, message: null, urls: loaded.cover.previewUrls };
}

export async function overrideCover(
  coverId: string,
  expectedRevision: number,
  clientSeq: number,
  field: CoverField,
  value: string | null,
): Promise<CoverWriteResult> {
  if (!UUID_PATTERN.test(coverId)) return { ok: false, message: "不正なIDです。", writeStatus: null, cover: null };
  if (field === "photo" && value && !UUID_PATTERN.test(value)) {
    return { ok: false, message: "不正なIDです。", writeStatus: null, cover: null };
  }
  if (field === "template" && value && !isCoverTemplateId(value)) {
    return { ok: false, message: "未対応のデザインです。", writeStatus: null, cover: null };
  }
  if (field === "color" && value && !isCoverColorId(value)) {
    return { ok: false, message: "未対応の色です。", writeStatus: null, cover: null };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "ログインが必要です。", writeStatus: null, cover: null };
  const { data: cover } = await supabase
    .from("album_draft_covers")
    .select("id, draft_version_id")
    .eq("id", coverId)
    .maybeSingle();
  if (!cover) return { ok: false, message: "表紙が見つかりません。", writeStatus: null, cover: null };
  const { data: version } = await supabase
    .from("album_draft_versions")
    .select("album_id")
    .eq("id", cover.draft_version_id)
    .maybeSingle();
  if (!version) return { ok: false, message: "表紙が見つかりません。", writeStatus: null, cover: null };
  if (field === "photo" && value) {
    const { data: album } = await supabase
      .from("albums")
      .select("id, pet_id, owner_user_id")
      .eq("id", version.album_id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    const { data: photo } = await supabase
      .from("photos")
      .select("id, pet_id, uploader_user_id")
      .eq("id", value)
      .maybeSingle();
    if (!album || !photo || photo.pet_id !== album.pet_id || photo.uploader_user_id !== user.id) {
      return { ok: false, message: "この写真はこのアルバムに使えません。", writeStatus: null, cover: null };
    }
  }
  const updated = await supabase.rpc("apply_draft_cover_override", {
    p_cover_id: coverId,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_field: field,
    p_reset: value == null,
    p_text: field === "photo" ? null : value,
    p_photo_id: field === "photo" ? value : null,
  });
  if (updated.error) {
    return { ok: false, message: messageFromError(updated.error), writeStatus: null, cover: null };
  }
  const status = (updated.data as { status?: WriteStatus } | null)?.status ?? "missing";
  const { data: fresh } = await supabase.from("album_draft_covers").select("*").eq("id", coverId).maybeSingle();
  if (!fresh) return { ok: false, message: "保存後の読み込みに失敗しました。", writeStatus: status, cover: null };
  return {
    ok: status !== "conflict" && status !== "missing",
    message: status === "conflict" ? "保存が競合しました。再試行できます。" : null,
    writeStatus: status,
    cover: await coverModel(supabase, mapDraftCoverRow(fresh as Record<string, unknown>)),
  };
}

export async function overrideSpreadText(
  spreadId: string,
  slotId: string,
  kind: TextKind,
  expectedRevision: number,
  clientSeq: number,
  mode: OverrideMode,
  userText: string | null,
  userStyleId: TextStyleId | null,
): Promise<PersistenceResult> {
  if (!UUID_PATTERN.test(spreadId)) return fail("不正なIDです。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("ログインが必要です。");
  const albumId = await albumIdForSpread(supabase, spreadId);
  if (!albumId) return fail("見開きが見つかりません。");
  const { data: spread } = await supabase
    .from("album_draft_spreads")
    .select("ai_layout_id, user_layout_id")
    .eq("id", spreadId)
    .maybeSingle();
  if (!spread) return fail("見開きが見つかりません。");
  const layoutId = spread.user_layout_id ?? spread.ai_layout_id;
  const slotError = textSlotIssue(layoutId, slotId, kind) ?? plainTextIssue(kind, userText) ?? styleIssue(userStyleId);
  if (slotKind(slotId) !== kind) return fail("このレイアウトには使えない位置です。");
  if (slotError) return fail(slotError);
  const updated = await supabase.rpc("apply_draft_text_override", {
    p_spread_id: spreadId,
    p_slot_id: slotId,
    p_kind: kind,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_mode: mode,
    p_user_text: userText,
    p_user_style_id: userStyleId,
  });
  if (updated.error) return fail(messageFromError(updated.error));
  const status = (updated.data as { status?: PersistenceResult["writeStatus"] } | null)?.status ?? "missing";
  return finishWrite(supabase, albumId, status);
}

export async function overrideSpreadDecoration(
  spreadId: string,
  slotId: string,
  expectedRevision: number,
  clientSeq: number,
  mode: OverrideMode,
  userDecorationId: string | null,
  userScale: ScalePreset | null,
): Promise<PersistenceResult> {
  if (!UUID_PATTERN.test(spreadId)) return fail("不正なIDです。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("ログインが必要です。");
  const albumId = await albumIdForSpread(supabase, spreadId);
  if (!albumId) return fail("見開きが見つかりません。");
  const { data: spread } = await supabase
    .from("album_draft_spreads")
    .select("ai_layout_id, user_layout_id")
    .eq("id", spreadId)
    .maybeSingle();
  if (!spread) return fail("見開きが見つかりません。");
  const layoutId = spread.user_layout_id ?? spread.ai_layout_id;
  const slotError = decorationSlotIssue(layoutId, slotId) ?? decorationIdIssue(userDecorationId);
  if (slotError) return fail(slotError);
  const updated = await supabase.rpc("apply_draft_decoration_override", {
    p_spread_id: spreadId,
    p_slot_id: slotId,
    p_expected_revision: expectedRevision,
    p_client_seq: clientSeq,
    p_mode: mode,
    p_user_decoration_id: userDecorationId,
    p_user_scale_preset: userScale,
  });
  if (updated.error) return fail(messageFromError(updated.error));
  const status = (updated.data as { status?: PersistenceResult["writeStatus"] } | null)?.status ?? "missing";
  return finishWrite(supabase, albumId, status);
}
