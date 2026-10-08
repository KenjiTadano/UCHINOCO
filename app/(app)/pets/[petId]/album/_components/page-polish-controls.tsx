"use client";

import { useState } from "react";
import {
  DECORATION_KITS,
  DECORATION_SLOT_LABEL,
  DECORATIONS,
  TEXT_SLOT_LABEL,
  TEXT_STYLES,
  polishForLayout,
  resolveEffectiveDecoration,
  resolveEffectiveText,
  textLengthLimit,
} from "@/lib/album-polish/catalog";
import type { DraftDecoration, DraftTextElement, TextStyleId } from "@/lib/album-polish/types";
import type { DecorationSlotId, TextSlotId } from "@/lib/album-polish/types";
import { PolishMark } from "./polish-mark";

type CaptionOption = { text: string };
type CaptionState = {
  context: string;
  options: CaptionOption[];
  note: string | null;
};

type Props = {
  spreadId: string;
  layoutId: string;
  texts: DraftTextElement[];
  decorations: DraftDecoration[];
  disabled: boolean;
  onText: (slotId: string, text: string) => void;
  onTextStyle: (slotId: string, styleId: TextStyleId) => void;
  onTextMode: (slotId: string, mode: "inherit" | "hidden") => void;
  onDecoration: (slotId: string, decorationId: string) => void;
  onDecorationMode: (slotId: string, mode: "inherit" | "hidden") => void;
  onSuggest: (
    slotId: string,
    force: boolean,
    avoid: string[],
  ) => Promise<{ ok: boolean; message: string | null; suggestions: CaptionOption[]; displayProtected: boolean }>;
};

export function PagePolishControls({
  spreadId,
  layoutId,
  texts,
  decorations,
  disabled,
  onText,
  onTextStyle,
  onTextMode,
  onDecoration,
  onDecorationMode,
  onSuggest,
}: Props) {
  const slots = polishForLayout(layoutId);
  const [panel, setPanel] = useState<"text" | "decoration" | null>(null);
  const [textSlot, setTextSlot] = useState<string>(slots.text[0]?.id ?? "");
  const [decoSlot, setDecoSlot] = useState<string>(slots.decoration[0]?.id ?? "");
  const [kit, setKit] = useState(DECORATION_KITS[0].id);
  const activeText = slots.text.find((slot) => slot.id === textSlot) ?? slots.text[0];
  const textRow = texts.find((item) => item.slotId === activeText?.id) ?? null;
  const shown = resolveEffectiveText(textRow);
  const inputValue = textRow?.overrideMode === "replace" ? (textRow.userText ?? "") : "";
  const decoRow = decorations.find((item) => item.slotId === decoSlot) ?? null;
  const decoShown = resolveEffectiveDecoration(decoRow);
  const kitItems = DECORATION_KITS.find((item) => item.id === kit)?.items ?? [];
  const [suggesting, setSuggesting] = useState(false);
  const [captionState, setCaptionState] = useState<CaptionState>({
    context: "",
    options: [],
    note: null,
  });
  const captionContext = `${spreadId}:${layoutId}:${textSlot}`;
  const captionOptions = captionState.context === captionContext ? captionState.options : [];
  const captionNote = captionState.context === captionContext ? captionState.note : null;

  async function requestCaptions(force: boolean) {
    if (!activeText || disabled || suggesting) return;
    setSuggesting(true);
    setCaptionState({ context: captionContext, options: captionOptions, note: null });
    const result = await onSuggest(
      activeText.id,
      force,
      force ? captionOptions.map((item) => item.text) : [],
    );
    setSuggesting(false);
    setCaptionState({
      context: captionContext,
      options: result.suggestions,
      note: result.ok ? result.message : (result.message ?? "提案できる情報が足りません。"),
    });
  }

  return (
    <section className="page-edit-polish" aria-label="テキストと装飾" data-testid="page-edit-polish">
      <div className="page-edit-polish-switch">
        <button
          type="button"
          className={`page-edit-polish-tab${panel === "text" ? " is-selected" : ""}`}
          aria-pressed={panel === "text"}
          data-testid="page-edit-text-open"
          disabled={disabled || slots.text.length === 0}
          onClick={() => setPanel((current) => (current === "text" ? null : "text"))}
        >
          テキスト
        </button>
        <button
          type="button"
          className={`page-edit-polish-tab${panel === "decoration" ? " is-selected" : ""}`}
          aria-pressed={panel === "decoration"}
          data-testid="page-edit-decoration-open"
          disabled={disabled || slots.decoration.length === 0}
          onClick={() => setPanel((current) => (current === "decoration" ? null : "decoration"))}
        >
          装飾
        </button>
      </div>

      {panel === "text" && activeText ? (
        <div className="page-edit-polish-panel" data-testid="page-edit-text-panel">
          <div className="page-edit-polish-slots" role="group" aria-label="テキストの位置">
            {slots.text.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={`page-edit-polish-chip${slot.id === activeText.id ? " is-selected" : ""}`}
                aria-pressed={slot.id === activeText.id}
                data-testid={`page-edit-text-slot-${slot.id}`}
                disabled={disabled}
                onClick={() => setTextSlot(slot.id)}
              >
                {TEXT_SLOT_LABEL[slot.id as TextSlotId]}
              </button>
            ))}
          </div>
          <label className="page-edit-polish-field">
            <span className="page-edit-polish-label">{TEXT_SLOT_LABEL[activeText.id as TextSlotId]}</span>
            <input
              className="page-edit-polish-input"
              data-testid="page-edit-text-input"
              maxLength={textLengthLimit(activeText.kind)}
              disabled={disabled || textRow?.overrideMode === "hidden"}
              placeholder={textRow?.aiText || (activeText.kind === "date" ? "July 2, 2023" : "短いことば")}
              value={inputValue}
              onChange={(event) => onText(activeText.id, event.target.value)}
            />
          </label>
          <div className="page-edit-polish-slots" role="listbox" aria-label="文字のスタイル">
            {TEXT_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`page-edit-polish-chip${shown.styleId === style.id && textRow?.userStyleId === style.id ? " is-selected" : ""}`}
                data-testid={`page-edit-text-style-${style.id}`}
                disabled={disabled}
                onClick={() => onTextStyle(activeText.id, style.id)}
              >
                {style.label}
              </button>
            ))}
          </div>
          <div className="page-edit-polish-actions">
            <button
              type="button"
              className="page-edit-reset"
              data-testid="page-edit-caption-suggest"
              disabled={disabled || suggesting}
              onClick={() => void requestCaptions(false)}
            >
              AIから提案
            </button>
            {captionOptions.length > 0 ? (
              <button
                type="button"
                className="page-edit-reset"
                data-testid="page-edit-caption-refresh"
                disabled={disabled || suggesting}
                onClick={() => void requestCaptions(true)}
              >
                別の提案
              </button>
            ) : null}
            <button
              type="button"
              className="page-edit-reset"
              data-testid="page-edit-text-reset"
              disabled={disabled || !textRow || textRow.overrideMode === "inherit"}
              onClick={() => onTextMode(activeText.id, "inherit")}
            >
              AIに戻す
            </button>
            <button
              type="button"
              className="page-edit-reset"
              data-testid="page-edit-text-hide"
              disabled={disabled || textRow?.overrideMode === "hidden"}
              onClick={() => onTextMode(activeText.id, "hidden")}
            >
              非表示
            </button>
          </div>
          {captionNote ? (
            <p className="page-edit-caption-note" data-testid="page-edit-caption-note">
              {captionNote}
            </p>
          ) : null}
          {captionOptions.length > 0 ? (
            <div className="page-edit-caption-list" data-testid="page-edit-caption-list">
              {captionOptions.map((option) => (
                <button
                  key={option.text}
                  type="button"
                  className="page-edit-caption-option"
                  data-testid="page-edit-caption-option"
                  data-suggestion={option.text}
                  disabled={disabled}
                  onClick={() => onText(activeText.id, option.text)}
                >
                  {option.text}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {panel === "decoration" ? (
        <div className="page-edit-polish-panel" data-testid="page-edit-decoration-panel">
          <div className="page-edit-polish-slots" aria-label="装飾の位置">
            {slots.decoration.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={`page-edit-polish-chip${slot.id === decoSlot ? " is-selected" : ""}`}
                data-testid={`page-edit-decoration-slot-${slot.id}`}
                disabled={disabled}
                onClick={() => setDecoSlot(slot.id)}
              >
                {DECORATION_SLOT_LABEL[slot.id as DecorationSlotId]}
              </button>
            ))}
          </div>
          <div className="page-edit-polish-slots" aria-label="装飾キット">
            {DECORATION_KITS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`page-edit-polish-chip${item.id === kit ? " is-selected" : ""}`}
                data-testid={`page-edit-decoration-kit-${item.id}`}
                disabled={disabled}
                onClick={() => setKit(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="page-edit-polish-marks">
            {kitItems.map((id) => {
              const label = DECORATIONS.find((item) => item.id === id)?.label ?? id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`page-edit-polish-mark${decoShown.decorationId === id ? " is-selected" : ""}`}
                  data-testid={`page-edit-decoration-${id}`}
                  aria-label={label}
                  disabled={disabled || !decoSlot}
                  onClick={() => onDecoration(decoSlot, id)}
                >
                  <PolishMark id={id} />
                </button>
              );
            })}
          </div>
          <div className="page-edit-polish-actions">
            <button
              type="button"
              className="page-edit-reset"
              data-testid="page-edit-decoration-reset"
              disabled={disabled || !decoRow || decoRow.overrideMode === "inherit"}
              onClick={() => onDecorationMode(decoSlot, "inherit")}
            >
              AIに戻す
            </button>
            <button
              type="button"
              className="page-edit-reset"
              data-testid="page-edit-decoration-hide"
              disabled={disabled || !decoShown.visible}
              onClick={() => onDecorationMode(decoSlot, "hidden")}
            >
              外す
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
