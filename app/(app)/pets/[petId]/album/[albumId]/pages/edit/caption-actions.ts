"use server";

import OpenAI from "openai";
import { captionLeavesCurrentText, globalCaptionMemory } from "@/lib/album-caption/cache";
import { ALBUM_CAPTION_VERSION } from "@/lib/album-caption/config";
import { buildCaptionFacts, captionFingerprint } from "@/lib/album-caption/facts";
import { resolveCaptionKind } from "@/lib/album-caption/suggest";
import type { AlbumTextSuggestion, CaptionKind } from "@/lib/album-caption/types";
import { suggestionFromText } from "@/lib/album-caption/validate";
import { slotKind, textSlotIssue } from "@/lib/album-polish/catalog";
import { PHOTO_INTELLIGENCE_SEMANTIC } from "@/lib/photo-analysis/constants";
import { PHOTO_INTELLIGENCE_VERSION } from "@/lib/photo-intelligence/config";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SuggestCaptionResult = {
  ok: boolean;
  message: string | null;
  suggestions: Array<{ text: string; sourceFacts: string[]; warnings: string[] }>;
  displayProtected: boolean;
  cacheSource: "memory" | "db" | "model" | "rules" | null;
  visionCalled: false;
};

function emptyResult(message: string | null, protectedDisplay = false): SuggestCaptionResult {
  return {
    ok: false,
    message,
    suggestions: [],
    displayProtected: protectedDisplay,
    cacheSource: null,
    visionCalled: false,
  };
}

function shownText(row: { override_mode: string; user_text: string | null; ai_text: string | null }): string | null {
  if (row.override_mode === "hidden") return null;
  if (row.override_mode === "replace") return row.user_text;
  return row.ai_text;
}

/** Text-only completion. Photo bytes are never attached. */
async function completeCaption(system: string, user: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI();
  const response = await Promise.race([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: false,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 400,
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
  ]);
  return response.choices[0]?.message?.content ?? null;
}

export async function suggestSpreadCaption(input: {
  spreadId: string;
  slotId: string;
  force?: boolean;
  avoid?: string[];
}): Promise<SuggestCaptionResult> {
  if (!UUID_PATTERN.test(input.spreadId)) return emptyResult("見開きが見つかりません。");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyResult("ログインが必要です。");

  const { data: spread } = await supabase
    .from("album_draft_spreads")
    .select("id, story_spread_id, draft_version_id, ai_layout_id, user_layout_id")
    .eq("id", input.spreadId)
    .maybeSingle();
  if (!spread) return emptyResult("見開きが見つかりません。");

  const { data: version } = await supabase
    .from("album_draft_versions")
    .select("id, status, album_id")
    .eq("id", spread.draft_version_id)
    .maybeSingle();
  if (!version) return emptyResult("見開きが見つかりません。");

  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, status, pet_id")
    .eq("id", version.album_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!album) return emptyResult("見開きが見つかりません。");
  if (album.status === "ordered" || version.status === "locked") {
    return emptyResult("このアルバムは注文済みのため変更できません。");
  }

  const layoutId = spread.user_layout_id ?? spread.ai_layout_id;
  const kind = slotKind(input.slotId);
  const slotError = kind ? textSlotIssue(layoutId, input.slotId, kind) : "このレイアウトには使えない位置です。";
  if (!kind || slotError) return emptyResult(slotError ?? "このレイアウトには使えない位置です。");

  const { data: pet } = await supabase.from("pets").select("name").eq("id", album.pet_id).maybeSingle();
  const { data: frames } = await supabase
    .from("album_draft_frames")
    .select("ai_photo_id, user_photo_id, position")
    .eq("draft_spread_id", spread.id)
    .order("position");
  const photoIds = (frames ?? [])
    .map((frame) => frame.user_photo_id ?? frame.ai_photo_id)
    .filter((id): id is string => Boolean(id));

  const [{ data: photos }, { data: analyses }, { data: versionSpreads }] = await Promise.all([
    photoIds.length > 0
      ? supabase.from("photos").select("id, taken_at").in("id", photoIds)
      : Promise.resolve({ data: [] }),
    photoIds.length > 0
      ? supabase
          .from("photo_analysis_results")
          .select("photo_id, result, analysis_version, created_at")
          .in("photo_id", photoIds)
          .eq("analysis_type", PHOTO_INTELLIGENCE_SEMANTIC)
          .eq("result_status", "success")
          .eq("analysis_version", PHOTO_INTELLIGENCE_VERSION)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("album_draft_spreads").select("id").eq("draft_version_id", version.id),
  ]);

  const takenAt = (photos ?? [])
    .map((photo) => photo.taken_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const seen = new Set<string>();
  const visions = [];
  for (const row of analyses ?? []) {
    if (seen.has(row.photo_id)) continue;
    seen.add(row.photo_id);
    visions.push(row.result);
  }

  const spreadIds = (versionSpreads ?? []).map((item) => item.id);
  const { data: texts } = spreadIds.length
    ? await supabase
        .from("album_draft_text_elements")
        .select("draft_spread_id, slot_id, override_mode, user_text, ai_text")
        .in("draft_spread_id", spreadIds)
    : { data: [] };
  const current = (texts ?? []).find((row) => row.draft_spread_id === spread.id && row.slot_id === input.slotId) ?? null;
  const displayProtected = captionLeavesCurrentText(current?.override_mode);
  const priorTexts = (texts ?? [])
    .filter((row) => !(row.draft_spread_id === spread.id && row.slot_id === input.slotId))
    .map((row) => shownText(row))
    .filter((value): value is string => Boolean(value));

  const facts = buildCaptionFacts({
    spreadId: spread.id,
    storySpreadId: spread.story_spread_id,
    photoIds,
    petName: pet?.name ?? null,
    capturedAt: takenAt,
    visions,
    userText: current?.override_mode === "replace" ? current.user_text : null,
    priorTexts,
  });

  if (kind === "date") {
    const dateText = facts.dateLabel;
    const suggestion = dateText ? suggestionFromText(facts, "caption", dateText, 0.8) : null;
    if (!dateText || !suggestion) return emptyResult("提案できる情報が足りません。", displayProtected);
    await seedAiText(supabase, spread.id, input.slotId, "date", dateText, current?.ai_text ?? null, Boolean(input.force));
    return {
      ok: true,
      message: displayProtected ? "候補です。選ぶまで、いまの文章は変わりません。" : null,
      suggestions: [{ text: dateText, sourceFacts: suggestion.sourceFacts, warnings: [] }],
      displayProtected,
      cacheSource: "rules",
      visionCalled: false,
    };
  }

  const captionKind = kind as CaptionKind;
  const fingerprint = captionFingerprint(facts, captionKind);
  const { data: cached } = await supabase
    .from("album_text_suggestions")
    .select("analysis_version, input_fingerprint, suggestions")
    .eq("draft_spread_id", spread.id)
    .eq("kind", captionKind)
    .eq("analysis_version", ALBUM_CAPTION_VERSION)
    .eq("input_fingerprint", fingerprint)
    .maybeSingle();

  const resolved = await resolveCaptionKind({
    force: input.force,
    kind: captionKind,
    facts,
    memory: globalCaptionMemory(),
    stored: cached
      ? {
          analysisVersion: cached.analysis_version,
          inputFingerprint: cached.input_fingerprint,
          suggestions: cached.suggestions,
        }
      : null,
    avoid: input.avoid,
    complete: completeCaption,
  });

  if (resolved.cacheable && resolved.cacheable.length > 0) {
    const saved = await supabase.rpc("save_album_text_suggestion", {
      p_spread_id: spread.id,
      p_kind: captionKind,
      p_analysis_version: ALBUM_CAPTION_VERSION,
      p_input_fingerprint: resolved.fingerprint,
      p_suggestions: resolved.cacheable as unknown as Json,
    });
    if (saved.error) {
      // The lines can still be shown. The next request will try to store them again.
    }
  }

  if (resolved.status !== "ok" || resolved.suggestions.length === 0) {
    const message =
      resolved.status === "ok"
        ? "同じ言い方を避けたため、新しい候補がありません。"
        : "提案できる情報が足りません。";
    return emptyResult(message, displayProtected);
  }

  await seedAiText(
    supabase,
    spread.id,
    input.slotId,
    captionKind,
    resolved.suggestions[0]?.text ?? "",
    current?.ai_text ?? null,
    Boolean(input.force),
  );

  return {
    ok: true,
    message: displayProtected ? "候補です。選ぶまで、いまの文章は変わりません。" : null,
    suggestions: resolved.suggestions.map((item: AlbumTextSuggestion) => ({
      text: item.text,
      sourceFacts: item.sourceFacts,
      warnings: item.warnings,
    })),
    displayProtected,
    cacheSource: resolved.source,
    visionCalled: false,
  };
}

async function seedAiText(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spreadId: string,
  slotId: string,
  kind: "title" | "caption" | "date",
  text: string,
  existingAi: string | null,
  force: boolean,
) {
  if (force || existingAi || !text) return;
  const seeded = await supabase.rpc("seed_draft_text_ai", {
    p_spread_id: spreadId,
    p_slot_id: slotId,
    p_kind: kind,
    p_ai_text: text,
  });
  if (seeded.error) return;
}
