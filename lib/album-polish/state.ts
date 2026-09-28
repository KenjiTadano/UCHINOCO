import type { PersistedDraftView } from "../album-persistence/view.ts";
import type {
  DecorationId,
  DraftDecoration,
  DraftTextElement,
  OverrideMode,
  ScalePreset,
  TextKind,
  TextStyleId,
} from "./types.ts";

export function textTargetId(spreadId: string, slotId: string) {
  return `text:${spreadId}:${slotId}`;
}

export function decorationTargetId(spreadId: string, slotId: string) {
  return `decoration:${spreadId}:${slotId}`;
}

export function applyTextState(
  view: PersistedDraftView,
  spreadId: string,
  slotId: string,
  next: { mode: OverrideMode; text: string | null; styleId: TextStyleId | null; kind: TextKind },
  clientSeq: number,
): PersistedDraftView {
  return {
    ...view,
    spreads: view.spreads.map((spread) => {
      if (spread.id !== spreadId) return spread;
      const current = spread.texts.find((item) => item.slotId === slotId);
      const row: DraftTextElement = {
        id: current?.id ?? textTargetId(spreadId, slotId),
        draftSpreadId: spreadId,
        slotId,
        kind: current?.kind ?? next.kind,
        aiText: current?.aiText ?? null,
        userText: next.text,
        aiStyleId: current?.aiStyleId ?? "editorial",
        userStyleId: next.styleId,
        overrideMode: next.mode,
        position: current?.position ?? spread.texts.length,
        revision: current?.revision ?? 0,
        clientSeq,
        createdAt: current?.createdAt ?? "",
        updatedAt: current?.updatedAt ?? "",
      };
      const texts = current
        ? spread.texts.map((item) => (item.slotId === slotId ? row : item))
        : [...spread.texts, row];
      return { ...spread, texts };
    }),
  };
}

export function applyDecorationState(
  view: PersistedDraftView,
  spreadId: string,
  slotId: string,
  next: { mode: OverrideMode; decorationId: DecorationId | null; scale: ScalePreset | null },
  clientSeq: number,
): PersistedDraftView {
  return {
    ...view,
    spreads: view.spreads.map((spread) => {
      if (spread.id !== spreadId) return spread;
      const current = spread.decorations.find((item) => item.slotId === slotId);
      const row: DraftDecoration = {
        id: current?.id ?? decorationTargetId(spreadId, slotId),
        draftSpreadId: spreadId,
        slotId,
        aiDecorationId: current?.aiDecorationId ?? null,
        userDecorationId: next.decorationId,
        aiScalePreset: current?.aiScalePreset ?? "small",
        userScalePreset: next.scale,
        overrideMode: next.mode,
        position: current?.position ?? spread.decorations.length,
        revision: current?.revision ?? 0,
        clientSeq,
        createdAt: current?.createdAt ?? "",
        updatedAt: current?.updatedAt ?? "",
      };
      const decorations = current
        ? spread.decorations.map((item) => (item.slotId === slotId ? row : item))
        : [...spread.decorations, row];
      return { ...spread, decorations };
    }),
  };
}
