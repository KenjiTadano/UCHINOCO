"use server";

import {
  overrideFrameCrop as writeFrameCrop,
  overrideFramePhoto as writeFramePhoto,
  overrideSpreadLayout as writeSpreadLayout,
} from "@/app/(app)/album-draft-service";
import { ALBUM_PERSISTENCE_LAB_TITLE_PREFIX } from "@/lib/album-persistence/config";
import type { PersistableSpread } from "@/lib/album-persistence/payload";
import { buildDraftSavePayload } from "@/lib/album-persistence/payload";
import { fail, messageFromError, readDraft } from "@/lib/album-persistence/read-draft";
import type { CropTriple } from "@/lib/album-persistence/types";
import type { PersistenceResult } from "@/lib/album-persistence/view";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type {
  PersistedDraftView,
  PersistedFrameView,
  PersistedSpreadView,
  PersistenceResult,
} from "@/lib/album-persistence/view";

export async function overrideSpreadLayout(
  spreadId: string,
  expectedRevision: number,
  clientSeq: number,
  userLayoutId: string | null,
) {
  return writeSpreadLayout(spreadId, expectedRevision, clientSeq, userLayoutId);
}

export async function overrideFrameCrop(
  frameId: string,
  expectedRevision: number,
  clientSeq: number,
  crop: CropTriple | null,
  debugDelayMs = 0,
) {
  return writeFrameCrop(frameId, expectedRevision, clientSeq, crop, debugDelayMs);
}

export async function overrideFramePhoto(
  frameId: string,
  expectedRevision: number,
  clientSeq: number,
  photoId: string | null,
) {
  return writeFramePhoto(frameId, expectedRevision, clientSeq, photoId);
}

function labTitle(monthKey: string) {
  return `${ALBUM_PERSISTENCE_LAB_TITLE_PREFIX} ${monthKey}`;
}

async function requireUserAlbum(petId: string, monthKey: string) {
  if (!UUID_PATTERN.test(petId)) return { error: fail("不正なIDです。") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail("ログインが必要です。") };
  const title = labTitle(monthKey);
  const { data: existing } = await supabase
    .from("albums")
    .select("id, status")
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .eq("title", title)
    .neq("status", "ordered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { supabase, user, title, album: existing };
}

export async function saveGeneratedDraft(
  petId: string,
  monthKey: string,
  spreads: PersistableSpread[],
  period: { start: string; end: string },
  warnings: string[] = [],
): Promise<PersistenceResult> {
  const ctx = await requireUserAlbum(petId, monthKey);
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!("supabase" in ctx) || !ctx.supabase || !ctx.user) return fail("ログインが必要です。");
  let albumId = ctx.album?.id ?? null;
  if (!albumId) {
    const inserted = await ctx.supabase
      .from("albums")
      .insert({
        owner_user_id: ctx.user.id,
        pet_id: petId,
        title: ctx.title,
        status: "draft",
        period_from: period.start,
        period_to: period.end,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) return fail(messageFromError(inserted.error));
    albumId = inserted.data.id;
  }
  const payload = buildDraftSavePayload(spreads, warnings);
  const saved = await ctx.supabase.rpc("save_album_draft_version", {
    p_album_id: albumId,
    p_payload: payload as unknown as Json,
  });
  if (saved.error) return fail(messageFromError(saved.error));
  const view = await readDraft(ctx.supabase, albumId);
  if (!view) return fail("保存後の読み込みに失敗しました。");
  return { ok: true, message: null, writeStatus: "applied", view };
}

export async function loadPersistedDraft(petId: string, monthKey: string): Promise<PersistenceResult> {
  const ctx = await requireUserAlbum(petId, monthKey);
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!("supabase" in ctx) || !ctx.supabase) return fail("ログインが必要です。");
  if (!ctx.album) return fail("保存された初稿がありません。");
  const view = await readDraft(ctx.supabase, ctx.album.id);
  if (!view) return fail("保存された初稿がありません。");
  return { ok: true, message: null, writeStatus: null, view };
}
