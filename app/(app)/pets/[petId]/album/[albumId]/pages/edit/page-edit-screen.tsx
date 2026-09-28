"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { DraftSpreadView } from "../../../_components/draft-spread-view";
import { PagePolishControls } from "../../../_components/page-polish-controls";
import { EditorHistoryControls } from "../../../_components/editor-history-controls";
import {
  editorPhotoIds,
  layoutChoices,
  saveStatusLabel,
  toAlbumEditorSpread,
} from "@/lib/album-persistence/editor";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
import { suggestSpreadCaption } from "./caption-actions";
import { usePageEditDraft } from "./use-page-edit-draft";

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

function LayoutSchema({ schema }: { schema: "l1" | "l2" | "l3" | "l4" }) {
  return (
    <span className={`page-edit-layout-schema page-edit-layout-schema--${schema}`} aria-hidden="true">
      <span className="page-edit-layout-block" />
      <span className="page-edit-layout-block" />
      <span className="page-edit-layout-block" />
    </span>
  );
}

export function PageEditScreen({
  view: initialView,
  albumId,
  readonly,
  loadError,
  candidatePhotos,
  initialIndex = 0,
  backHref,
  doneHref,
  generateHref,
  printHref,
}: PageEditScreenProps) {
  const draft = usePageEditDraft(initialView, albumId, readonly);
  const view = draft.view;
  const safeInitial = Math.min(Math.max(initialIndex, 0), Math.max((view?.spreads.length ?? 1) - 1, 0));
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(safeInitial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceSlot, setReplaceSlot] = useState<number | null>(null);

  const spread = view?.spreads[activeSpreadIndex] ?? null;
  const editor = spread ? toAlbumEditorSpread(spread, view?.previewUrls ?? {}) : null;
  const totalSpreads = view?.spreads.length ?? 0;
  const totalPages = Math.max(totalSpreads * 2, 2);
  const pageStart = activeSpreadIndex * 2 + 1;
  const pageLabel = `${pageStart} - ${pageStart + 1} / ${totalPages}`;
  const choices = editor ? layoutChoices(editor.frames.length, editor.layoutId) : [];
  const usedIds = new Set(editor?.frames.map((frame) => frame.photoId) ?? []);
  const thumbById = new Map(candidatePhotos.map((photo) => [photo.id, photo.thumb]));

  const selectSpread = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= totalSpreads) return;
    setActiveSpreadIndex(nextIndex);
    setPickerOpen(false);
    setReplaceSlot(null);
  };

  function revealSpread(spreadId: string | null) {
    if (!spreadId || !draft.view) return;
    const index = draft.view.spreads.findIndex((item) => item.id === spreadId);
    if (index >= 0) setActiveSpreadIndex(index);
  }

  return (
    <main
      className="page-edit-page"
      data-testid="page-edit-draft"
      data-readonly={readonly ? "true" : "false"}
      data-spread-count={totalSpreads}
      data-photo-count={view ? editorPhotoIds(view).length : 0}
    >
      <header className="page-edit-header">
        <Link
          href={backHref}
          className="page-edit-header-side page-edit-back ds-focus"
          aria-label="戻る"
          data-testid="page-edit-back"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <div className="editor-history-heading">
          <h1 className="page-edit-header-title">ページを編集</h1>
          <EditorHistoryControls
            canUndo={draft.canUndo}
            canRedo={draft.canRedo}
            disabled={readonly || !view}
            onUndo={() => revealSpread(draft.undo())}
            onRedo={() => revealSpread(draft.redo())}
          />
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
            <p
              className="page-edit-save"
              data-testid="page-edit-save"
              data-state={readonly ? "error" : draft.saveState}
              aria-live="polite"
            >
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
              <button
                type="button"
                className="page-edit-arrow page-edit-arrow-left ds-focus"
                aria-label="前の見開き"
                data-testid="page-edit-arrow-prev"
                onClick={() => selectSpread(activeSpreadIndex - 1)}
                disabled={activeSpreadIndex <= 0}
              >
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>

              <DraftSpreadView
                preview={spread.preview}
                frames={editor.frames}
                texts={spread.texts}
                decorations={spread.decorations}
                layoutId={spread.effectiveLayoutId}
                className="page-edit-draft-book"
                interactive={!readonly}
                onCropStart={draft.beginCrop}
                onCrop={draft.setCrop}
                onCropEnd={draft.endCrop}
                onImageError={() => void draft.refreshUrls()}
              />

              <button
                type="button"
                className="page-edit-arrow page-edit-arrow-right ds-focus"
                aria-label="次の見開き"
                data-testid="page-edit-arrow-next"
                onClick={() => selectSpread(activeSpreadIndex + 1)}
                disabled={activeSpreadIndex >= totalSpreads - 1}
              >
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="page-edit-thumbs" role="tablist" aria-label="見開き一覧" data-testid="page-edit-thumbs">
              {view.spreads.map((item, index) => {
                const thumb = toAlbumEditorSpread(item, view.previewUrls);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`book-spread-thumb page-edit-thumb${index === activeSpreadIndex ? " is-selected" : ""}`}
                    aria-pressed={index === activeSpreadIndex}
                    data-testid="book-spread-thumb"
                    data-selected={index === activeSpreadIndex ? "true" : "false"}
                    onClick={() => selectSpread(index)}
                  >
                    <span className="book-spread-thumb-frame">
                      <DraftSpreadView
                        preview={item.preview}
                        frames={thumb.frames}
                        texts={item.texts}
                        decorations={item.decorations}
                        layoutId={item.effectiveLayoutId}
                      />
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
                      { (thumbById.get(frame.photoId) ?? frame.previewUrl) ? (
                        <Image
                          src={thumbById.get(frame.photoId) ?? frame.previewUrl}
                          alt=""
                          fill
                          sizes="96px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : null}
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
                    <button
                      type="button"
                      className="page-edit-reset"
                      data-testid="page-edit-reset-layout"
                      disabled={readonly}
                      onClick={() => draft.setLayout(spread.id, null)}
                    >
                      AIに戻す
                    </button>
                  ) : null}
                  <span className="page-edit-see-all">すべて見る →</span>
                </span>
              </div>
              <div className="page-edit-layout-list" role="listbox" aria-label="レイアウト" data-testid="page-edit-layouts">
                {choices.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={editor.layoutId === option.id}
                    data-testid={`page-edit-layout-${option.id}`}
                    className={`page-edit-layout-card${editor.layoutId === option.id ? " is-selected" : ""} ds-focus`}
                    disabled={readonly}
                    onClick={() => draft.setLayout(spread.id, option.id)}
                  >
                    <LayoutSchema schema={option.schema} />
                    <span className="page-edit-layout-label">{option.label}</span>
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
        <div
          className="page-edit-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="page-edit-picker-title"
          data-testid="page-edit-picker"
        >
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
