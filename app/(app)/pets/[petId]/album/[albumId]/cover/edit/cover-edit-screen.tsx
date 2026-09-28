"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Image as ImageIcon, X } from "lucide-react";
import type { CoverSeed } from "@/app/(app)/album-draft-service";
import {
  COVER_COLORS,
  COVER_TEMPLATES,
  type CoverColorId,
  type CoverTemplateId,
} from "@/lib/album-cover-templates";
import type { CoverEditorModel } from "@/lib/album-persistence/cover";
import { originalSignedObjectPath, saveStatusLabel } from "@/lib/album-persistence/editor";
import { AlbumCoverBook } from "../../../_components/album-cover-book";
import { EditorHistoryControls } from "../../../_components/editor-history-controls";
import { useCoverEditDraft } from "./use-cover-edit-draft";

export type CoverEditCandidate = {
  id: string;
  src: string;
  thumb: string;
  alt: string;
};

export type CoverEditScreenProps = {
  petName: string;
  dateLabel: string;
  cover: CoverEditorModel | null;
  seed: CoverSeed;
  albumId: string;
  candidates: CoverEditCandidate[];
  readonly: boolean;
  loadError: string | null;
  missing: boolean;
  backHref: string;
  doneHref: string;
  generateHref: string;
};

type TabId = "design" | "title" | "subtitle";

export function CoverEditScreen({
  petName,
  dateLabel,
  cover: initialCover,
  seed,
  albumId,
  candidates,
  readonly,
  loadError,
  missing,
  backHref,
  doneHref,
  generateHref,
}: CoverEditScreenProps) {
  const draft = useCoverEditDraft(initialCover, albumId, seed, readonly);
  const cover = draft.cover;
  const [tab, setTab] = useState<TabId>("design");
  const [pickerOpen, setPickerOpen] = useState(false);
  const templateId = cover?.templateId ?? "simple";
  const colorId = cover?.colorId ?? "white";
  const titleMain = cover?.title ?? "";
  const titlePrefix = cover?.subtitle ?? "";
  const coverSrc = cover?.previewUrl || null;

  return (
    <main
      className="cover-edit-page"
      data-testid="cover-edit-draft"
      data-readonly={readonly ? "true" : "false"}
      data-photo-id={cover?.photoId ?? ""}
      data-template={templateId}
      data-color={colorId}
    >
      <header className="cover-edit-header">
        <Link
          href={backHref}
          className="cover-edit-header-side cover-edit-back ds-focus"
          aria-label="戻る"
          data-testid="cover-edit-back"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <div className="editor-history-heading">
          <h1 className="cover-edit-header-title">表紙を編集</h1>
          <EditorHistoryControls
            canUndo={draft.canUndo}
            canRedo={draft.canRedo}
            disabled={readonly || missing || !cover}
            onUndo={draft.undo}
            onRedo={draft.redo}
          />
        </div>
        <Link
          href={doneHref}
          className="cover-edit-header-side cover-edit-done ds-focus"
          data-testid="cover-edit-done"
        >
          完了
        </Link>
      </header>

      <div className="cover-edit-body">
        {loadError ? (
          <p className="page-edit-empty" data-testid="cover-edit-load-error">
            {loadError}
          </p>
        ) : missing || !cover ? (
          <p className="page-edit-empty" data-testid="cover-edit-empty">
            保存された初稿がありません。
            <br />
            <Link href={generateHref} className="page-edit-see-all">
              初稿を作成する
            </Link>
          </p>
        ) : (
          <>
            <p
              className="page-edit-save"
              data-testid="cover-edit-save"
              data-state={readonly ? "error" : draft.saveState}
              aria-live="polite"
            >
              {readonly ? "注文済みのため編集できません" : saveStatusLabel(draft.saveState)}
              {draft.error ? <span data-testid="cover-edit-save-error"> {draft.error}</span> : null}
              {!readonly && draft.saveState === "error" ? (
                <button type="button" className="page-edit-save-retry" data-testid="cover-edit-retry" onClick={draft.retry}>
                  再試行
                </button>
              ) : null}
            </p>
            <div
              className="cover-edit-preview-wrap"
              data-testid="cover-edit-preview"
              data-src-path={originalSignedObjectPath(coverSrc ?? "")}
              data-title={titleMain}
              data-subtitle={titlePrefix}
            >
              <AlbumCoverBook
                shell="monthly"
                size="edit"
                coverSrc={coverSrc}
                dateLabel={dateLabel}
                titlePrefix={titlePrefix}
                titleMain={titleMain || "タイトル"}
                label={`${petName}の表紙プレビュー`}
                templateId={templateId}
                colorId={colorId}
                showBrand
                priority
                className="cover-edit-book"
                imagePath={originalSignedObjectPath(coverSrc ?? "")}
              >
                <button
                  type="button"
                  className="cover-edit-change-photo ds-focus"
                  data-testid="cover-edit-change-photo"
                  disabled={readonly}
                  onClick={() => setPickerOpen(true)}
                >
                  <ImageIcon size={15} strokeWidth={1.9} aria-hidden="true" />
                  写真を変更
                </button>
              </AlbumCoverBook>
            </div>

            <div className="cover-edit-tabs" role="tablist" aria-label="表紙編集">
              {(
                [
                  { id: "design", label: "デザイン" },
                  { id: "title", label: "タイトル" },
                  { id: "subtitle", label: "サブタイトル" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  data-testid={`cover-edit-tab-${t.id}`}
                  className={`cover-edit-tab${tab === t.id ? " is-selected" : ""} ds-focus`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "design" ? (
              <section className="cover-edit-design" aria-label="デザイン">
                <ul className="cover-edit-template-grid">
                  {COVER_TEMPLATES.map((tpl) => (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        data-testid={`cover-edit-template-${tpl.id}`}
                        className={`cover-edit-template-card${templateId === tpl.id ? " is-selected" : ""} ds-focus`}
                        aria-pressed={templateId === tpl.id}
                        disabled={readonly}
                        onClick={() => draft.setTemplate(tpl.id as CoverTemplateId)}
                      >
                        <span className="cover-edit-template-preview">
                          <AlbumCoverBook
                            shell="monthly"
                            size="thumbnail"
                            coverSrc={coverSrc}
                            dateLabel={dateLabel}
                            titlePrefix={titlePrefix}
                            titleMain={titleMain}
                            label=""
                            templateId={tpl.id}
                            colorId={colorId}
                            showBrand={false}
                            className="cover-edit-template-book"
                          />
                        </span>
                        <span className="cover-edit-template-label">{tpl.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="cover-edit-colors">
                  <h2 className="cover-edit-colors-title">表紙の色</h2>
                  <div className="cover-edit-swatches" role="listbox" aria-label="表紙の色">
                    {COVER_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={colorId === c.id}
                        aria-label={c.label}
                        data-testid={`cover-edit-color-${c.id}`}
                        className={`cover-edit-swatch${colorId === c.id ? " is-selected" : ""} ds-focus`}
                        data-color={c.id}
                        style={{ background: c.swatch }}
                        disabled={readonly}
                        onClick={() => draft.setColor(c.id as CoverColorId)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {tab === "title" ? (
              <section className="cover-edit-field" aria-label="タイトル">
                <label className="cover-edit-field-label" htmlFor="cover-edit-title-input">
                  タイトル
                </label>
                <input
                  id="cover-edit-title-input"
                  data-testid="cover-edit-title-input"
                  className="cover-edit-input"
                  value={titleMain}
                  disabled={readonly}
                  onChange={(e) => draft.setTitle(e.target.value)}
                  maxLength={40}
                  placeholder="9月の思い出"
                />
                <p className="cover-edit-field-hint">上部の表紙プレビューにすぐ反映されます</p>
              </section>
            ) : null}

            {tab === "subtitle" ? (
              <section className="cover-edit-field" aria-label="サブタイトル">
                <label className="cover-edit-field-label" htmlFor="cover-edit-subtitle-input">
                  サブタイトル
                </label>
                <input
                  id="cover-edit-subtitle-input"
                  data-testid="cover-edit-subtitle-input"
                  className="cover-edit-input"
                  value={titlePrefix}
                  disabled={readonly}
                  onChange={(e) => draft.setSubtitle(e.target.value)}
                  maxLength={24}
                  placeholder={`${petName}の`}
                />
                <p className="cover-edit-field-hint">上部の表紙プレビューにすぐ反映されます</p>
              </section>
            ) : null}
          </>
        )}
      </div>

      {pickerOpen && cover && !readonly ? (
        <div
          className="cover-edit-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cover-edit-picker-title"
          data-testid="cover-edit-picker"
        >
          <button
            type="button"
            className="cover-edit-picker-backdrop"
            aria-label="閉じる"
            onClick={() => setPickerOpen(false)}
          />
          <div className="cover-edit-picker-sheet">
            <div className="cover-edit-picker-head">
              <h2 id="cover-edit-picker-title" className="cover-edit-picker-title">
                表紙写真を選ぶ
              </h2>
              <button
                type="button"
                className="cover-edit-picker-close ds-focus"
                aria-label="閉じる"
                onClick={() => setPickerOpen(false)}
              >
                <X size={18} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
            <p className="cover-edit-picker-hint">アルバム内の写真から選びます</p>
            {cover.photoOverridden ? (
              <button
                type="button"
                className="page-edit-reset"
                data-testid="cover-edit-reset-photo"
                onClick={() => {
                  draft.setPhoto(null);
                  setPickerOpen(false);
                }}
              >
                最初の写真に戻す
              </button>
            ) : null}
            <ul className="cover-edit-picker-grid">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`cover-edit-picker-item${cover.photoId === c.id ? " is-used" : ""} ds-focus`}
                    data-testid={`cover-edit-picker-item-${c.id}`}
                    onClick={() => {
                      draft.setPhoto(c.id, c.src);
                      setPickerOpen(false);
                    }}
                  >
                    <Image
                      src={c.thumb || c.src}
                      alt={c.alt}
                      fill
                      sizes="110px"
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}
