"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, ChevronLeft, ChevronRight, Copy, Image as ImageIcon, Maximize2, Minimize2, Minus, Palette, Plus, RotateCcw, Shapes, Sparkles, Star, Trash2, Type, X } from "lucide-react";
import { DraftSpreadView } from "../../../_components/draft-spread-view";
import { PagePolishControls } from "../../../_components/page-polish-controls";
import { PageElementMark } from "../../../_components/page-element-mark";
import { digitalNormalizedRect, digitalSpreadGeometry } from "@/lib/album-draft/pages";
import { EditorHistoryControls } from "../../../_components/editor-history-controls";
import { editorPhotoIds, layoutChoices, saveStatusLabel, toAlbumEditorSpread } from "@/lib/album-persistence/editor";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
import { ELEMENT_BACKGROUNDS, ELEMENT_COLORS, ELEMENT_DECORATIONS, ELEMENT_FONTS, ELEMENT_STAMPS, type ElementBackgroundId, type ElementDecorationId, type PageElement, type StampId } from "@/lib/album-elements/model";
import { suggestSpreadCaption } from "./caption-actions";
import { intersects, polishForLayout, toSpreadNorm, visibleDecorationLayers, visibleTextLayers } from "@/lib/album-polish/catalog";
import { usePageEditDraft } from "./use-page-edit-draft";
import { DECORATION_STYLE_PRESETS, recommendAlbumDecoration, recommendAlbumTheme, recommendationSeason, type DecorationRecommendation } from "@/lib/album-decoration/recommendation";
import type { AlbumCompositionItem } from "@/lib/album-draft/composition";
import { trackDecorationRecommendation } from "../../analytics-actions";

export type PageEditCandidatePhoto = {
  id: string;
  src: string;
  thumb: string;
  alt: string;
};

export type PageEditScreenProps = {
  view: PersistedDraftView | null;
  albumId: string;
  readonly: boolean;
  loadError: string | null;
  candidatePhotos: PageEditCandidatePhoto[];
  initialIndex?: number;
  backHref: string;
  doneHref: string;
  generateHref: string;
  printHref: string;
};

function spreadPageLabel(index: number): string {
  const start = index * 2 + 1;
  return `${start}-${start + 1}`;
}

function layoutRecommendationLabel(rank: number | null, category: string) {
  if (rank === null) return category;
  return ["AIおすすめ", "AI次点候補", "AI次々点", "AI第4候補"][rank] ?? `AI第${rank + 1}候補`;
}

function previewRecommendationElements(recommendation: DecorationRecommendation, zIndex: number): PageElement[] {
  const elements: PageElement[] = recommendation.marks.map((mark, index) => {
    const base = {
      id: `preview-${recommendation.id}-${index}`,
      x: mark.rect.x,
      y: mark.rect.y,
      width: mark.rect.w,
      height: mark.rect.h,
      rotation: 0,
      zIndex: Math.min(100, zIndex + index + 1),
      printTarget: mark.printTarget,
      revision: 0,
      clientSeq: 0,
      colorId: mark.colorId,
    };
    return mark.type === "stamp" ? { ...base, type: "stamp" as const, stampId: mark.id as StampId } : { ...base, type: "decoration" as const, decorationId: mark.id as ElementDecorationId };
  });
  if (recommendation.textSuggestion && recommendation.textRect) {
    elements.push({
      id: `preview-${recommendation.id}-date`,
      type: "text",
      text: recommendation.textSuggestion,
      x: recommendation.textRect.x,
      y: recommendation.textRect.y,
      width: recommendation.textRect.w,
      height: recommendation.textRect.h,
      rotation: 0,
      zIndex: Math.min(100, zIndex + elements.length + 1),
      printTarget: "print",
      revision: 0,
      clientSeq: 0,
      fontId: "minimal",
      fontSize: 12,
      bold: false,
      colorId: "ink",
      align: "center",
    });
  }
  return elements;
}

function LayoutSchema({ frames, textSlots }: { frames: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }>; textSlots: Array<{ id: string; rect: { x: number; y: number; w: number; h: number } }> }) {
  return (
    <span className="page-edit-layout-schema" aria-hidden="true">
      {frames.map((frame) => (
        <span key={frame.id} className="page-edit-layout-block" style={{ left: `${frame.rect.x * 100}%`, top: `${frame.rect.y * 100}%`, width: `${frame.rect.w * 100}%`, height: `${frame.rect.h * 100}%` }} />
      ))}
      {textSlots.map((slot) => (
        <span key={slot.id} className="page-edit-layout-text-slot" style={{ left: `${slot.rect.x * 100}%`, top: `${slot.rect.y * 100}%`, width: `${slot.rect.w * 100}%`, height: `${slot.rect.h * 100}%` }} />
      ))}
    </span>
  );
}

export function PageEditScreen({ view: initialView, albumId, readonly, loadError, candidatePhotos, initialIndex = 0, backHref, doneHref, generateHref, printHref }: PageEditScreenProps) {
  const draft = usePageEditDraft(initialView, albumId, readonly);
  const view = draft.view;
  const safeInitial = Math.min(Math.max(initialIndex, 0), Math.max((view?.spreads.length ?? 1) - 1, 0));
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(safeInitial);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceSlot, setReplaceSlot] = useState<number | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [addPanel, setAddPanel] = useState<"stamp" | "decoration" | "background" | "recommendation" | null>(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState("clean");
  const [recommendationMessage, setRecommendationMessage] = useState<string | null>(null);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [showAllLayouts, setShowAllLayouts] = useState(false);
  const [elementCaptionOptions, setElementCaptionOptions] = useState<{ text: string }[]>([]);
  const [elementCaptionBusy, setElementCaptionBusy] = useState(false);
  const [elementCaptionMessage, setElementCaptionMessage] = useState<string | null>(null);

  const spread = view?.spreads[activeSpreadIndex] ?? null;
  const editor = spread ? toAlbumEditorSpread(spread, view?.previewUrls ?? {}) : null;
  const selectedFrame = editor?.frames.find((frame) => frame.id === selectedFrameId) ?? null;
  const selectedElement = spread?.elements.find((element) => element.id === selectedElementId) ?? null;
  const selectedAssignment = selectedFrame ? spread?.preview.assignments.find((assignment) => assignment.frameId === selectedFrame.frameId) : null;
  const maxZoom = selectedFrame ? Math.max(1, selectedAssignment?.cropFrame.maxScale ?? selectedFrame.crop.scale) : 1;
  const totalSpreads = view?.spreads.length ?? 0;
  const totalPages = Math.max(totalSpreads * 2, 2);
  const pageStart = activeSpreadIndex * 2 + 1;
  const pageLabel = `${pageStart} - ${pageStart + 1} / ${totalPages}`;
  const choices = editor ? layoutChoices(editor.frames.length, editor.layoutId, spread?.layoutRanking ?? null) : [];
  const visibleChoices = showAllLayouts ? choices : choices.slice(0, 4);
  const usedIds = new Set(editor?.frames.map((frame) => frame.photoId) ?? []);
  const thumbById = new Map(candidatePhotos.map((photo) => [photo.id, photo.thumb]));
  const digital = digitalSpreadGeometry();
  const plannedSpread = view?.compositionPlan?.items.find((item): item is Extract<AlbumCompositionItem, { kind: "spread" }> => item.kind === "spread" && item.storySpreadId === spread?.storySpreadId);
  const knownEvent = view?.compositionPlan?.items.find((item): item is Extract<AlbumCompositionItem, { kind: "event" }> => item.kind === "event" && item.afterStorySpreadId === spread?.storySpreadId);
  const storyType = spread?.preview.story.storyType ?? "everyday";
  const albumTheme = view ? recommendAlbumTheme({ dates: view.spreads.map((item) => item.preview.story.startedAt), hasEvent: view.compositionPlan?.items.some((item) => item.kind === "event") ?? false, storyTypes: view.spreads.map((item) => item.preview.story.storyType) }) : "CLEAN";
  const currentLayoutChoice = choices.find((choice) => choice.id === editor?.layoutId);
  const polishTexts = spread ? visibleTextLayers(spread.effectiveLayoutId, spread.texts) : [];
  const polishDecorations = spread ? visibleDecorationLayers(spread.effectiveLayoutId, spread.decorations) : [];
  const recommendationElements = spread?.elements.filter((element) => element.recommendationId?.startsWith("task059:")) ?? [];
  const manualBackground = spread
    ? (["left", "right"] as const).some((side) => {
        const current = spread.backgrounds[side].backgroundId;
        if (current == null) return false;
        return !recommendationElements.some((element) => element.recommendationBackgroundsAfter?.[side] === current);
      })
    : false;
  const pageRects = [digital.leftPage, digital.rightPage].map((page) => ({ x: page.x + page.w * 0.06, y: page.y + page.h * 0.06, w: page.w * 0.88, h: page.h * 0.88 }));
  const recommendationOptions =
    spread && editor
      ? recommendAlbumDecoration({
          role: knownEvent ? "EVENT" : (plannedSpread?.role ?? "STORY"),
          storyType,
          density: plannedSpread?.density ?? "MEDIUM",
          whitespaceIntent: spread.preview.rhythm?.whitespaceIntent ?? "balanced",
          photoCount: editor.frames.length,
          event: knownEvent ? { kind: knownEvent.eventKind, date: knownEvent.date, dateLabel: knownEvent.dateLabel } : undefined,
          season: recommendationSeason(spread.preview.story.startedAt),
          albumTheme,
          photoTone: null,
          confidence: spread.preview.heroConfidence ?? 0.7,
          userElementCount: spread.elements.filter((element) => !element.recommendationId?.startsWith("task059:")).length + spread.texts.filter((item) => item.overrideMode !== "inherit").length + spread.decorations.filter((item) => item.overrideMode !== "inherit").length,
          hasUserBackground: manualBackground,
          safePages: [
            { side: "left", rect: pageRects[0] },
            { side: "right", rect: pageRects[1] },
          ],
          occupiedRects: [...(currentLayoutChoice?.frames.map((frame) => digitalNormalizedRect(frame.rect)) ?? []), ...polishTexts.map((item) => item.rect), ...polishDecorations.map((item) => item.rect), ...spread.elements.map((item) => ({ x: item.x, y: item.y, w: item.width, h: item.height }))],
          gutter: { x: digital.leftPage.x + digital.leftPage.w, y: 0, w: Math.max(0, digital.rightPage.x - digital.leftPage.x - digital.leftPage.w), h: 1 },
        })
      : [];
  const selectedRecommendation = recommendationOptions.find((item) => item.id === selectedRecommendationId) ?? recommendationOptions[0] ?? null;
  const recommendationPreview = selectedRecommendation && spread ? previewRecommendationElements(selectedRecommendation, Math.max(0, ...spread.elements.map((item) => item.zIndex))) : [];
  const recommendationBaseBackgrounds = spread
    ? (["left", "right"] as const).reduce(
        (backgrounds, side) => {
          const current = spread.backgrounds[side].backgroundId;
          const source = recommendationElements.find((element) => element.recommendationBackgroundsAfter?.[side] === current)?.recommendationBackgroundsBefore?.[side];
          backgrounds[side] = source === undefined ? current : source;
          return backgrounds;
        },
        { left: null as ElementBackgroundId | null, right: null as ElementBackgroundId | null },
      )
    : null;
  const previewElements = addPanel === "recommendation" && spread ? [...spread.elements.filter((element) => !element.recommendationId?.startsWith("task059:")), ...recommendationPreview] : (spread?.elements ?? []);
  const previewBackgrounds =
    addPanel === "recommendation" && spread && selectedRecommendation && recommendationBaseBackgrounds
      ? {
          left: { ...spread.backgrounds.left, backgroundId: selectedRecommendation.backgrounds.left ?? recommendationBaseBackgrounds.left },
          right: { ...spread.backgrounds.right, backgroundId: selectedRecommendation.backgrounds.right ?? recommendationBaseBackgrounds.right },
        }
      : spread?.backgrounds;

  const selectSpread = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= totalSpreads) return;
    setActiveSpreadIndex(nextIndex);
    setSelectedFrameId(null);
    setSelectedElementId(null);
    setAddPanel(null);
    setAddMessage(null);
    setPickerOpen(false);
    setReplaceSlot(null);
    setShowAllLayouts(false);
    setSelectedRecommendationId("clean");
    setRecommendationMessage(null);
  };

  function revealSpread(spreadId: string | null) {
    if (!spreadId || !draft.view) return;
    const index = draft.view.spreads.findIndex((item) => item.id === spreadId);
    if (index >= 0) setActiveSpreadIndex(index);
  }

  function addElement(type: "text" | "stamp" | "decoration", markId?: StampId | ElementDecorationId) {
    if (!spread || readonly) return;
    const slots = polishForLayout(spread.effectiveLayoutId);
    const candidates = type === "text" ? slots.text.filter((slot) => slot.kind === "caption").map((slot) => digitalNormalizedRect(toSpreadNorm(slot.rect))) : slots.decoration.map((slot) => digitalNormalizedRect(toSpreadNorm(slot.rect)));
    const occupied = [...visibleTextLayers(spread.effectiveLayoutId, spread.texts).map((item) => item.rect), ...visibleDecorationLayers(spread.effectiveLayoutId, spread.decorations).map((item) => item.rect), ...spread.elements.map((item) => ({ x: item.x, y: item.y, w: item.width, h: item.height }))];
    const slot = candidates.find((rect) => {
      const minSize = type === "text" ? { w: Math.max(0.08, rect.w), h: Math.max(0.04, rect.h) } : { w: Math.max(0.04, rect.w), h: Math.max(0.04, rect.h) };
      return !occupied.some((item) => intersects({ x: rect.x, y: rect.y, ...minSize }, item));
    });
    if (!slot) {
      setAddMessage("この見開きには空いている配置場所がありません。");
      return;
    }
    const id = crypto.randomUUID();
    const zIndex = Math.min(100, Math.max(0, ...spread.elements.map((element) => element.zIndex)) + 1);
    setAddMessage(null);
    const base = { id, x: slot.x, y: slot.y, width: slot.w, height: slot.h, rotation: 0, zIndex, printTarget: "print" as const, revision: 0, clientSeq: 0 };
    const element: PageElement =
      type === "text"
        ? { ...base, type, text: "ここに一言", fontId: "editorial", fontSize: 18, bold: false, colorId: "ink", align: "center" }
        : type === "stamp"
          ? { ...base, type, width: Math.max(0.04, slot.w), height: Math.max(0.04, slot.h), stampId: (markId ?? "paw") as StampId, colorId: "terracotta" }
          : { ...base, type, width: Math.max(0.04, slot.w), height: Math.max(0.04, slot.h), decorationId: (markId ?? "line") as ElementDecorationId, colorId: "sage" };
    draft.setPageElement(spread.id, id, element);
    setSelectedFrameId(null);
    setSelectedElementId(id);
    setAddPanel(null);
  }

  function patchSelectedElement(patch: Partial<PageElement>, debounce = false) {
    if (!spread || !selectedElement) return;
    draft.setPageElement(spread.id, selectedElement.id, { ...selectedElement, ...patch } as PageElement, debounce);
  }

  function duplicateSelectedElement() {
    if (!spread || !selectedElement) return;
    const id = crypto.randomUUID();
    const element = { ...selectedElement, id, x: Math.min(0.92, selectedElement.x + 0.035), y: Math.min(0.92, selectedElement.y + 0.035), zIndex: Math.min(100, selectedElement.zIndex + 1), revision: 0, clientSeq: 0 } as PageElement;
    draft.setPageElement(spread.id, id, element);
    setSelectedElementId(id);
  }

  function applySelectedRecommendation() {
    if (!spread || !selectedRecommendation) return;
    if (selectedRecommendation.styleId === "CLEAN") {
      const cleared = draft.clearAIRecommendations(spread.id);
      setRecommendationMessage(cleared ? "AIの装飾を取り除きました。" : "このままで、写真を主役にします。");
      void trackDecorationRecommendation(albumId, "decoration_reset", `${spread.id}:clean`, selectedRecommendation.styleId);
      return;
    }
    const elements = previewRecommendationElements(selectedRecommendation, Math.max(0, ...spread.elements.map((item) => item.zIndex))).map((element) => ({ ...element, id: crypto.randomUUID() }));
    const applied = draft.applyDecorationRecommendation(spread.id, { elements, backgrounds: selectedRecommendation.backgrounds });
    setRecommendationMessage(applied ? "提案を適用しました。Undoで戻せます。" : (draft.error ?? "この提案は適用できませんでした。"));
    if (applied) void trackDecorationRecommendation(albumId, "decoration_applied", `${spread.id}:${selectedRecommendation.id}`, selectedRecommendation.styleId);
  }

  function removeAIRecommendations() {
    if (!spread) return;
    const removed = draft.clearAIRecommendations(spread.id);
    setRecommendationMessage(removed ? "AIの装飾を取り除きました。" : "AIから追加された装飾はありません。");
    if (removed) void trackDecorationRecommendation(albumId, "decoration_reset", `${spread.id}:all`);
  }

  async function requestElementCaptions() {
    if (!spread || selectedElement?.type !== "text" || elementCaptionBusy) return;
    const captionSlot = polishForLayout(spread.effectiveLayoutId).text.find((slot) => slot.kind === "caption");
    if (!captionSlot) {
      setElementCaptionMessage("この見開きには提案できるキャプション位置がありません。");
      return;
    }
    setElementCaptionBusy(true);
    setElementCaptionMessage(null);
    const result = await suggestSpreadCaption({ spreadId: spread.id, slotId: captionSlot.id, force: false, avoid: [] });
    setElementCaptionBusy(false);
    setElementCaptionOptions(result.suggestions);
    setElementCaptionMessage(result.ok ? result.message : (result.message ?? "提案できる情報が足りません。"));
  }

  return (
    <main className="page-edit-page" data-testid="page-edit-draft" data-readonly={readonly ? "true" : "false"} data-spread-count={totalSpreads} data-photo-count={view ? editorPhotoIds(view).length : 0}>
      <header className="page-edit-header">
        <Link href={backHref} className="page-edit-header-side page-edit-back ds-focus" aria-label="戻る" data-testid="page-edit-back">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <div className="editor-history-heading">
          <h1 className="page-edit-header-title">ページを編集</h1>
          <EditorHistoryControls canUndo={draft.canUndo} canRedo={draft.canRedo} disabled={readonly || !view} onUndo={() => revealSpread(draft.undo())} onRedo={() => revealSpread(draft.redo())} />
        </div>
        <Link href={doneHref} className="page-edit-header-side page-edit-done ds-focus" data-testid="page-edit-done">
          完了
        </Link>
      </header>

      <div className="page-edit-body">
        {loadError ? (
          <p className="page-edit-empty" data-testid="page-edit-load-error">
            {loadError}
          </p>
        ) : editor && spread && view ? (
          <>
            <p className="page-edit-page-num" aria-live="polite" data-testid="page-edit-page-num">
              {pageLabel}
            </p>
            <p className="page-edit-save" data-testid="page-edit-save" data-state={readonly ? "error" : draft.saveState} aria-live="polite">
              {readonly ? "注文済みのため編集できません" : saveStatusLabel(draft.saveState)}
              {draft.error ? <span data-testid="page-edit-save-error"> {draft.error}</span> : null}
              {!readonly && draft.saveState === "error" ? (
                <button type="button" className="page-edit-save-retry" data-testid="page-edit-retry" onClick={draft.retry}>
                  再試行
                </button>
              ) : null}
            </p>
            {draft.saveState === "saving" ? (
              <p className="page-edit-print-pending" data-testid="page-edit-print-pending">
                保存中
              </p>
            ) : (
              <Link href={printHref} className="page-edit-print-link ds-focus" data-testid="page-edit-print">
                印刷プレビュー
              </Link>
            )}

            <div className="page-edit-stage">
              <button type="button" className="page-edit-arrow page-edit-arrow-left ds-focus" aria-label="前の見開き" data-testid="page-edit-arrow-prev" onClick={() => selectSpread(activeSpreadIndex - 1)} disabled={activeSpreadIndex <= 0}>
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>

              <DraftSpreadView
                preview={spread.preview}
                frames={editor.frames}
                texts={spread.texts}
                decorations={spread.decorations}
                elements={previewElements}
                backgrounds={previewBackgrounds}
                layoutId={spread.effectiveLayoutId}
                className="page-edit-draft-book"
                digital
                selectedFrameId={selectedFrameId}
                selectedElementId={selectedElementId}
                interactiveElements={!readonly && addPanel !== "recommendation"}
                onFrameSelect={(frameId) => {
                  setSelectedFrameId(frameId);
                  setSelectedElementId(null);
                }}
                onElementSelect={(elementId) => {
                  setSelectedElementId(elementId);
                  if (elementId) setSelectedFrameId(null);
                }}
                onElementChange={(element) => draft.setPageElement(spread.id, element.id, element, true)}
                onElementGestureStart={(elementId) => draft.beginPageElementGesture(spread.id, elementId)}
                onElementGestureEnd={draft.endPageElementGesture}
                interactive={!readonly && addPanel !== "recommendation"}
                onCropStart={(frameId) => {
                  setSelectedFrameId(frameId);
                  draft.beginCrop(frameId);
                }}
                onCrop={draft.setCrop}
                onCropEnd={draft.endCrop}
                onImageError={() => void draft.refreshUrls()}
              />

              <button type="button" className="page-edit-arrow page-edit-arrow-right ds-focus" aria-label="次の見開き" data-testid="page-edit-arrow-next" onClick={() => selectSpread(activeSpreadIndex + 1)} disabled={activeSpreadIndex >= totalSpreads - 1}>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <section className="page-edit-element-tools" aria-label="ページ要素" data-testid="page-edit-element-tools">
              <div className="page-edit-element-add-row">
                <button type="button" className="page-edit-element-add ds-focus" data-testid="page-edit-add-text" disabled={readonly} onClick={() => addElement("text")}>
                  <Type size={16} aria-hidden="true" /> テキスト
                </button>
                <button type="button" className={`page-edit-element-add ds-focus${addPanel === "stamp" ? " is-selected" : ""}`} data-testid="page-edit-add-stamp" disabled={readonly} aria-expanded={addPanel === "stamp"} onClick={() => setAddPanel((current) => (current === "stamp" ? null : "stamp"))}>
                  <Star size={16} aria-hidden="true" /> スタンプ
                </button>
                <button type="button" className={`page-edit-element-add ds-focus${addPanel === "decoration" ? " is-selected" : ""}`} data-testid="page-edit-add-decoration" disabled={readonly} aria-expanded={addPanel === "decoration"} onClick={() => setAddPanel((current) => (current === "decoration" ? null : "decoration"))}>
                  <Shapes size={16} aria-hidden="true" /> 装飾
                </button>
                <button type="button" className={`page-edit-element-add ds-focus${addPanel === "background" ? " is-selected" : ""}`} data-testid="page-edit-change-background" disabled={readonly} aria-expanded={addPanel === "background"} onClick={() => setAddPanel((current) => (current === "background" ? null : "background"))}>
                  <Palette size={16} aria-hidden="true" /> 背景
                </button>
                <button
                  type="button"
                  className={`page-edit-element-add ds-focus${addPanel === "recommendation" ? " is-selected" : ""}`}
                  data-testid="page-edit-decoration-recommendation"
                  disabled={readonly}
                  aria-expanded={addPanel === "recommendation"}
                  onClick={() => {
                    setSelectedRecommendationId("clean");
                    setRecommendationMessage(null);
                    if (addPanel !== "recommendation") void trackDecorationRecommendation(albumId, "decoration_recommendation_shown", `${spread.id}:shown`);
                    setAddPanel((current) => (current === "recommendation" ? null : "recommendation"));
                  }}
                >
                  <Sparkles size={16} aria-hidden="true" /> AIおすすめ
                </button>
                {recommendationElements.length > 0 ? (
                  <button type="button" className="page-edit-reset ds-focus" data-testid="page-edit-clear-ai-decorations" disabled={readonly} onClick={removeAIRecommendations}>
                    AI装飾を全削除
                  </button>
                ) : null}
              </div>
              {addMessage ? (
                <p className="page-edit-element-caption-message" role="status">
                  {addMessage}
                </p>
              ) : null}

              {addPanel === "recommendation" ? (
                <div className="page-edit-recommendation-panel" data-testid="page-edit-decoration-recommendations">
                  <div className="page-edit-recommendation-options" role="group" aria-label="AIおすすめの雰囲気">
                    {recommendationOptions.map((recommendation) => (
                      <button
                        key={recommendation.id}
                        type="button"
                        className={`page-edit-recommendation-option ds-focus${recommendation.id === selectedRecommendation?.id ? " is-selected" : ""}`}
                        data-testid={`page-edit-recommendation-${recommendation.id}`}
                        aria-pressed={recommendation.id === selectedRecommendation?.id}
                        onClick={() => {
                          setSelectedRecommendationId(recommendation.id);
                          void trackDecorationRecommendation(albumId, "decoration_previewed", `${spread.id}:${recommendation.id}`, recommendation.styleId);
                        }}
                      >
                        <span>{DECORATION_STYLE_PRESETS.find((preset) => preset.id === recommendation.styleId)?.label}</span>
                        <small>{Math.round(recommendation.confidence * 100)}%</small>
                      </button>
                    ))}
                  </div>
                  {selectedRecommendation ? (
                    <div className="page-edit-recommendation-preview" data-testid="page-edit-recommendation-preview">
                      <p>{selectedRecommendation.reason}</p>
                      {selectedRecommendation.textSuggestion ? <p className="page-edit-recommendation-date">{selectedRecommendation.textSuggestion}</p> : null}
                      {selectedRecommendation.backgrounds.left || selectedRecommendation.backgrounds.right ? <span>淡い背景色</span> : null}
                    </div>
                  ) : null}
                  {recommendationMessage ? (
                    <p className="page-edit-element-caption-message" role="status">
                      {recommendationMessage}
                    </p>
                  ) : null}
                  <div className="page-edit-recommendation-actions">
                    <button
                      type="button"
                      className="page-edit-element-add ds-focus"
                      data-testid="page-edit-recommendation-keep"
                      onClick={() => {
                        void trackDecorationRecommendation(albumId, "decoration_rejected", `${spread.id}:${selectedRecommendation?.id ?? "none"}`, selectedRecommendation?.styleId);
                        setAddPanel(null);
                      }}
                    >
                      このままでOK
                    </button>
                    <button type="button" className="page-edit-element-add page-edit-recommendation-apply ds-focus" data-testid="page-edit-recommendation-apply" disabled={readonly || !selectedRecommendation} onClick={applySelectedRecommendation}>
                      提案を適用
                    </button>
                  </div>
                </div>
              ) : null}

              {addPanel === "stamp" ? (
                <div className="page-edit-element-picker" data-testid="page-edit-stamp-picker" aria-label="スタンプ">
                  {ELEMENT_STAMPS.map((stamp) => (
                    <button key={stamp.id} type="button" className="page-edit-element-option ds-focus" data-testid={`page-edit-stamp-${stamp.id}`} onClick={() => addElement("stamp", stamp.id)}>
                      <PageElementMark type="stamp" markId={stamp.id} color="#b36048" />
                      <span>{stamp.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {addPanel === "decoration" ? (
                <div className="page-edit-element-picker" data-testid="page-edit-decoration-picker" aria-label="装飾">
                  {ELEMENT_DECORATIONS.map((decoration) => (
                    <button key={decoration.id} type="button" className="page-edit-element-option ds-focus" data-testid={`page-edit-element-decoration-${decoration.id}`} onClick={() => addElement("decoration", decoration.id)}>
                      <PageElementMark type="decoration" markId={decoration.id} color="#71836e" />
                      <span>{decoration.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {addPanel === "background" ? (
                <div className="page-edit-background-picker" data-testid="page-edit-background-picker">
                  {(["left", "right"] as const).map((side) => (
                    <div key={side} className="page-edit-background-side" role="group" aria-label={side === "left" ? "左ページ背景" : "右ページ背景"}>
                      <span>{side === "left" ? "左" : "右"}</span>
                      {ELEMENT_BACKGROUNDS.map((background) => (
                        <button
                          key={background.id}
                          type="button"
                          className="page-edit-background-swatch ds-focus"
                          data-testid={`page-edit-background-${side}-${background.id}`}
                          aria-label={background.label}
                          aria-pressed={(spread.backgrounds[side].backgroundId ?? "white") === background.id}
                          style={{ backgroundColor: background.hex }}
                          onClick={() => draft.setPageBackground(spread.id, side, background.id as ElementBackgroundId)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {selectedElement ? (
              <section className="page-edit-element-inspector" aria-label="選択した要素" data-testid="page-edit-element-inspector" data-element-id={selectedElement.id}>
                {selectedElement.type === "text" ? (
                  <>
                    <label className="page-edit-element-text-field">
                      <span>テキスト</span>
                      <textarea rows={2} maxLength={120} data-testid="page-edit-element-text-input" value={selectedElement.text} disabled={readonly} onChange={(event) => patchSelectedElement({ text: event.target.value }, true)} />
                    </label>
                    <div className="page-edit-element-caption-tools">
                      <button type="button" className="page-edit-reset" data-testid="page-edit-element-caption-suggest" disabled={readonly || elementCaptionBusy} onClick={() => void requestElementCaptions()}>
                        <Sparkles size={14} aria-hidden="true" /> {elementCaptionBusy ? "提案中" : "AIから提案"}
                      </button>
                      {elementCaptionOptions.map((option) => (
                        <button key={option.text} type="button" className="page-edit-element-caption-option ds-focus" data-testid="page-edit-element-caption-option" onClick={() => patchSelectedElement({ text: option.text })}>
                          {option.text}
                        </button>
                      ))}
                      {elementCaptionMessage ? (
                        <span role="status" className="page-edit-element-caption-message">
                          {elementCaptionMessage}
                        </span>
                      ) : null}
                    </div>
                    <label className="page-edit-element-select-field">
                      <span>フォント</span>
                      <select data-testid="page-edit-element-font" value={selectedElement.fontId} disabled={readonly} onChange={(event) => patchSelectedElement({ fontId: event.target.value as typeof selectedElement.fontId })}>
                        {ELEMENT_FONTS.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="page-edit-element-size-field">
                      <span>サイズ</span>
                      <input
                        type="range"
                        aria-label="文字サイズ"
                        data-testid="page-edit-element-font-size"
                        min={10}
                        max={48}
                        value={selectedElement.fontSize}
                        disabled={readonly}
                        onPointerDown={() => draft.beginPageElementGesture(spread.id, selectedElement.id)}
                        onPointerUp={draft.endPageElementGesture}
                        onPointerCancel={draft.endPageElementGesture}
                        onChange={(event) => patchSelectedElement({ fontSize: Number(event.target.value) }, true)}
                      />
                    </label>
                    <button type="button" className={`page-edit-element-tool ds-focus${selectedElement.bold ? " is-selected" : ""}`} aria-label="太字" aria-pressed={selectedElement.bold} data-testid="page-edit-element-bold" disabled={readonly} onClick={() => patchSelectedElement({ bold: !selectedElement.bold })}>
                      <Bold size={16} aria-hidden="true" />
                    </button>
                    <div className="page-edit-element-align" role="group" aria-label="文字揃え">
                      {(["left", "center", "right"] as const).map((align) => {
                        const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                        return (
                          <button key={align} type="button" className={`page-edit-element-tool ds-focus${selectedElement.align === align ? " is-selected" : ""}`} aria-label={`${align}揃え`} aria-pressed={selectedElement.align === align} data-testid={`page-edit-element-align-${align}`} disabled={readonly} onClick={() => patchSelectedElement({ align })}>
                            <Icon size={16} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <div className="page-edit-element-colors" role="group" aria-label="要素の色">
                  {ELEMENT_COLORS.map((color) => (
                    <button key={color.id} type="button" className="page-edit-background-swatch ds-focus" data-testid={`page-edit-element-color-${color.id}`} aria-label={color.label} aria-pressed={selectedElement.colorId === color.id} style={{ backgroundColor: color.hex }} disabled={readonly} onClick={() => patchSelectedElement({ colorId: color.id })} />
                  ))}
                </div>
                <label className="page-edit-element-rotation">
                  <span>回転</span>
                  <input
                    type="range"
                    aria-label="要素の回転"
                    min={-180}
                    max={180}
                    step={15}
                    value={selectedElement.rotation}
                    disabled={readonly}
                    onPointerDown={() => draft.beginPageElementGesture(spread.id, selectedElement.id)}
                    onPointerUp={draft.endPageElementGesture}
                    onPointerCancel={draft.endPageElementGesture}
                    onChange={(event) => patchSelectedElement({ rotation: Number(event.target.value) }, true)}
                  />
                  <output>{selectedElement.rotation}°</output>
                </label>
                <div className="page-edit-element-actions">
                  <button type="button" className="page-edit-element-tool ds-focus" aria-label="前面へ" data-testid="page-edit-element-forward" disabled={readonly} onClick={() => patchSelectedElement({ zIndex: Math.min(100, Math.max(0, ...spread.elements.map((item) => item.zIndex)) + 1) })}>
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="page-edit-element-tool ds-focus" aria-label="背面へ" data-testid="page-edit-element-backward" disabled={readonly || selectedElement.zIndex <= -100} onClick={() => patchSelectedElement({ zIndex: Math.max(-100, Math.min(...spread.elements.map((item) => item.zIndex)) - 1) })}>
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="page-edit-element-tool ds-focus" aria-label="複製" data-testid="page-edit-element-duplicate" disabled={readonly} onClick={duplicateSelectedElement}>
                    <Copy size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="page-edit-element-tool page-edit-element-delete ds-focus"
                    aria-label="削除"
                    data-testid="page-edit-element-delete"
                    disabled={readonly}
                    onClick={() => {
                      draft.setPageElement(spread.id, selectedElement.id, null);
                      setSelectedElementId(null);
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </section>
            ) : null}

            {selectedFrame ? (
              <section className="page-edit-crop-toolbar" aria-label="写真の位置とズーム" data-testid="page-edit-crop-toolbar" data-frame-id={selectedFrame.id}>
                <div className="page-edit-crop-zoom">
                  <span className="page-edit-crop-label">Zoom</span>
                  <button type="button" className="page-edit-crop-icon ds-focus" aria-label="縮小" data-testid="page-edit-zoom-out" disabled={readonly || selectedFrame.crop.scale <= 1} onClick={() => draft.setCrop(selectedFrame.id, { ...selectedFrame.crop, scale: Math.max(1, selectedFrame.crop.scale - 0.1) })}>
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <input
                    type="range"
                    aria-label="写真のズーム"
                    data-testid="page-edit-zoom"
                    min={1}
                    max={maxZoom}
                    step={0.01}
                    value={Math.min(maxZoom, Math.max(1, selectedFrame.crop.scale))}
                    disabled={readonly || maxZoom <= 1}
                    onPointerDown={() => draft.beginCrop(selectedFrame.id)}
                    onPointerUp={draft.endCrop}
                    onPointerCancel={draft.endCrop}
                    onKeyDown={(event) => {
                      if (!event.repeat && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                        draft.beginCrop(selectedFrame.id);
                      }
                    }}
                    onKeyUp={(event) => {
                      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) draft.endCrop();
                    }}
                    onChange={(event) => draft.setCrop(selectedFrame.id, { ...selectedFrame.crop, scale: Number(event.target.value) })}
                  />
                  <button type="button" className="page-edit-crop-icon ds-focus" aria-label="拡大" data-testid="page-edit-zoom-in" disabled={readonly || selectedFrame.crop.scale >= maxZoom} onClick={() => draft.setCrop(selectedFrame.id, { ...selectedFrame.crop, scale: Math.min(maxZoom, selectedFrame.crop.scale + 0.1) })}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                  <output className="page-edit-crop-zoom-value" data-testid="page-edit-zoom-value">
                    {selectedFrame.crop.scale.toFixed(2)}
                  </output>
                </div>
                <div className="page-edit-crop-actions">
                  <button type="button" className="page-edit-crop-action ds-focus" data-testid="page-edit-fit" disabled={readonly} onClick={() => draft.setCrop(selectedFrame.id, { ...selectedFrame.crop, scale: 1 })}>
                    <Minimize2 size={15} aria-hidden="true" /> Fit
                  </button>
                  <button type="button" className="page-edit-crop-action ds-focus" data-testid="page-edit-fill" disabled={readonly || maxZoom <= 1} onClick={() => draft.setCrop(selectedFrame.id, { ...selectedFrame.crop, scale: maxZoom })}>
                    <Maximize2 size={15} aria-hidden="true" /> Fill
                  </button>
                  <button type="button" className="page-edit-crop-action ds-focus" data-testid="page-edit-reset-crop-selected" disabled={readonly || !selectedFrame.cropOverridden} onClick={() => draft.resetCrop(selectedFrame.id)}>
                    <RotateCcw size={15} aria-hidden="true" /> AIに戻す
                  </button>
                </div>
              </section>
            ) : null}

            <div className="page-edit-thumbs" role="tablist" aria-label="見開き一覧" data-testid="page-edit-thumbs">
              {view.spreads.map((item, index) => {
                const thumb = toAlbumEditorSpread(item, view.previewUrls);
                return (
                  <button key={item.id} type="button" className={`book-spread-thumb page-edit-thumb${index === activeSpreadIndex ? " is-selected" : ""}`} aria-pressed={index === activeSpreadIndex} data-testid="book-spread-thumb" data-selected={index === activeSpreadIndex ? "true" : "false"} onClick={() => selectSpread(index)}>
                    <span className="book-spread-thumb-frame">
                      <DraftSpreadView preview={item.preview} frames={thumb.frames} texts={item.texts} decorations={item.decorations} layoutId={item.effectiveLayoutId} />
                    </span>
                    <span className="book-spread-thumb-label">{spreadPageLabel(index)}</span>
                  </button>
                );
              })}
            </div>

            <section className="page-edit-photos" aria-labelledby="page-edit-photos-heading">
              <div className="page-edit-section-head">
                <h2 id="page-edit-photos-heading" className="page-edit-section-title">
                  このページの写真（{editor.frames.length}枚）
                </h2>
                <span className="page-edit-section-actions">
                  {editor.frames.some((frame) => frame.cropOverridden) ? (
                    <button
                      type="button"
                      className="page-edit-reset"
                      data-testid="page-edit-reset-crop"
                      disabled={readonly}
                      onClick={() => {
                        for (const frame of editor.frames) {
                          if (frame.cropOverridden) draft.resetCrop(frame.id);
                        }
                      }}
                    >
                      切り抜きをAIに戻す
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="page-edit-change-photos ds-focus"
                    data-testid="page-edit-change-photos"
                    disabled={readonly}
                    onClick={() => {
                      setReplaceSlot(0);
                      setPickerOpen(true);
                    }}
                  >
                    <ImageIcon size={14} strokeWidth={1.9} aria-hidden="true" />
                    写真を変更
                  </button>
                </span>
              </div>
              <ul className="page-edit-photo-list" data-testid="page-edit-photo-list">
                {editor.frames.map((frame, index) => (
                  <li key={frame.id} className="page-edit-photo-card">
                    <button
                      type="button"
                      className="page-edit-photo-hit"
                      aria-label={`写真${index + 1}を差し替え`}
                      disabled={readonly}
                      onClick={() => {
                        setReplaceSlot(index);
                        setPickerOpen(true);
                      }}
                    >
                      {(thumbById.get(frame.photoId) ?? frame.previewUrl) ? <Image src={thumbById.get(frame.photoId) ?? frame.previewUrl} alt="" fill sizes="96px" className="object-cover" unoptimized /> : null}
                    </button>
                    <button
                      type="button"
                      className="page-edit-photo-remove ds-focus"
                      aria-label="AIの写真に戻す"
                      data-testid={`page-edit-photo-remove-${index}`}
                      disabled={readonly || !frame.photoOverridden}
                      onClick={(event) => {
                        event.stopPropagation();
                        draft.resetPhoto(frame.id);
                      }}
                    >
                      <X size={12} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="page-edit-layouts" aria-labelledby="page-edit-layouts-heading">
              <div className="page-edit-section-head">
                <h2 id="page-edit-layouts-heading" className="page-edit-section-title">
                  レイアウトを変更
                </h2>
                <span className="page-edit-section-actions">
                  {editor.layoutOverridden ? (
                    <button type="button" className="page-edit-reset" data-testid="page-edit-reset-layout" disabled={readonly} onClick={() => draft.setLayout(spread.id, null)}>
                      AIに戻す
                    </button>
                  ) : null}
                  {choices.length > 4 ? (
                    <button type="button" className="page-edit-see-all ds-focus" aria-expanded={showAllLayouts} onClick={() => setShowAllLayouts((value) => !value)}>
                      {showAllLayouts ? (spread?.layoutRanking?.selectedLayout ? "AI上位だけ見る" : "先頭4件だけ見る") : "すべて見る →"}
                    </button>
                  ) : null}
                </span>
              </div>
              <div className="page-edit-layout-list" role="listbox" aria-label="レイアウト" data-testid="page-edit-layouts">
                {visibleChoices.map((option) => (
                  <button key={option.id} type="button" role="option" aria-selected={editor.layoutId === option.id} data-testid={`page-edit-layout-${option.id}`} className={`page-edit-layout-card${editor.layoutId === option.id ? " is-selected" : ""} ds-focus`} disabled={readonly} onClick={() => draft.setLayout(spread.id, option.id)}>
                    <LayoutSchema frames={option.frames} textSlots={option.textSlots} />
                    <span className="page-edit-layout-label">{option.label}</span>
                    <span className="page-edit-layout-meta" data-ai-rank={option.aiRank ?? undefined} data-ai-score={option.aiScore ?? undefined}>
                      {option.aiRank === null ? option.category : `${layoutRecommendationLabel(option.aiRank, option.category)} · ${option.aiScore}点 · ${option.tier}`}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <PagePolishControls
              spreadId={spread.id}
              layoutId={spread.effectiveLayoutId}
              texts={spread.texts}
              decorations={spread.decorations}
              disabled={readonly}
              onText={(slotId, text) => draft.setText(spread.id, slotId, text)}
              onTextStyle={(slotId, styleId) => draft.setTextStyle(spread.id, slotId, styleId)}
              onTextMode={(slotId, mode) => draft.setTextMode(spread.id, slotId, mode)}
              onDecoration={(slotId, decorationId) => draft.setDecoration(spread.id, slotId, decorationId, "small")}
              onDecorationMode={(slotId, mode) => draft.setDecorationMode(spread.id, slotId, mode)}
              onSuggest={(slotId, force, avoid) => suggestSpreadCaption({ spreadId: spread.id, slotId, force, avoid })}
            />
          </>
        ) : (
          <p className="page-edit-empty" data-testid="page-edit-empty">
            保存された初稿がありません。
            <br />
            <Link href={generateHref} className="page-edit-see-all">
              初稿を作成する
            </Link>
          </p>
        )}
      </div>

      {pickerOpen && !readonly ? (
        <div className="page-edit-picker" role="dialog" aria-modal="true" aria-labelledby="page-edit-picker-title" data-testid="page-edit-picker">
          <button
            type="button"
            className="page-edit-picker-backdrop"
            aria-label="閉じる"
            onClick={() => {
              setPickerOpen(false);
              setReplaceSlot(null);
            }}
          />
          <div className="page-edit-picker-sheet">
            <div className="page-edit-picker-head">
              <h2 id="page-edit-picker-title" className="page-edit-picker-title">
                写真を選ぶ
              </h2>
              <button
                type="button"
                className="page-edit-picker-close ds-focus"
                aria-label="閉じる"
                onClick={() => {
                  setPickerOpen(false);
                  setReplaceSlot(null);
                }}
              >
                <X size={18} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
            <p className="page-edit-picker-hint">このペットの写真から選びます</p>
            <ul className="page-edit-picker-grid">
              {candidatePhotos.map((candidate) => {
                const inUse = usedIds.has(candidate.id);
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className={`page-edit-picker-item${inUse ? " is-used" : ""} ds-focus`}
                      data-testid={`page-edit-picker-item-${candidate.id}`}
                      onClick={() => {
                        const frame = editor?.frames[replaceSlot ?? 0];
                        if (!frame) return;
                        const knownOriginal = view?.previewUrls[candidate.id];
                        draft.setPhoto(frame.id, candidate.id, knownOriginal || candidate.src);
                        setPickerOpen(false);
                        setReplaceSlot(null);
                      }}
                    >
                      <Image src={candidate.thumb} alt={candidate.alt} fill sizes="110px" className="object-cover" unoptimized />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}
