import type { DraftDecoration, DraftTextElement, OverrideMode, ScalePreset, TextKind, TextStyleId } from "./types.ts";
import { isDecorationId, isOverrideMode, isScalePreset, isTextStyleId } from "./catalog.ts";

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textKind(value: unknown): TextKind {
  return value === "title" || value === "caption" || value === "date" ? value : "caption";
}

function mode(value: unknown): OverrideMode {
  return typeof value === "string" && isOverrideMode(value) ? value : "inherit";
}

export function mapTextRow(row: Record<string, unknown>): DraftTextElement {
  const aiStyle = String(row.ai_style_id ?? "editorial");
  const userStyle = row.user_style_id == null ? null : String(row.user_style_id);
  return {
    id: String(row.id),
    draftSpreadId: String(row.draft_spread_id),
    slotId: String(row.slot_id),
    kind: textKind(row.kind),
    aiText: row.ai_text == null ? null : String(row.ai_text),
    userText: row.user_text == null ? null : String(row.user_text),
    aiStyleId: isTextStyleId(aiStyle) ? aiStyle : "editorial",
    userStyleId: isTextStyleId(userStyle) ? userStyle : null,
    overrideMode: mode(row.override_mode),
    position: num(row.position),
    revision: num(row.revision) || 1,
    clientSeq: num(row.client_seq),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapDecorationRow(row: Record<string, unknown>): DraftDecoration {
  const aiScale = String(row.ai_scale_preset ?? "small");
  const userScale = row.user_scale_preset == null ? null : String(row.user_scale_preset);
  const aiDecoration = row.ai_decoration_id == null ? null : String(row.ai_decoration_id);
  const userDecoration = row.user_decoration_id == null ? null : String(row.user_decoration_id);
  return {
    id: String(row.id),
    draftSpreadId: String(row.draft_spread_id),
    slotId: String(row.slot_id),
    aiDecorationId: isDecorationId(aiDecoration) ? aiDecoration : null,
    userDecorationId: isDecorationId(userDecoration) ? userDecoration : null,
    aiScalePreset: aiScale === "medium" ? "medium" : "small",
    userScalePreset: isScalePreset(userScale) ? userScale : null,
    overrideMode: mode(row.override_mode),
    position: num(row.position),
    revision: num(row.revision) || 1,
    clientSeq: num(row.client_seq),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function emptyTextOverride(): { mode: OverrideMode; text: string | null; styleId: TextStyleId | null } {
  return { mode: "inherit", text: null, styleId: null };
}

export function textUserSnapshot(row: DraftTextElement | undefined) {
  if (!row) return emptyTextOverride();
  return { mode: row.overrideMode, text: row.userText, styleId: row.userStyleId };
}

export function decorationUserSnapshot(row: DraftDecoration | undefined): {
  mode: OverrideMode;
  decorationId: DraftDecoration["userDecorationId"];
  scale: ScalePreset | null;
} {
  if (!row) return { mode: "inherit", decorationId: null, scale: null };
  return { mode: row.overrideMode, decorationId: row.userDecorationId, scale: row.userScalePreset };
}
