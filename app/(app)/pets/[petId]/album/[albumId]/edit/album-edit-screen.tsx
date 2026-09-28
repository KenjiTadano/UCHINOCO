"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Settings,
  Type,
} from "lucide-react";
import type { PreviewSpread } from "@/lib/album-preview-spreads";
import { AlbumCoverBook } from "../../_components/album-cover-book";
import { BookSpread } from "../../_components/book-spread";

export type AlbumEditPageEntry =
  | {
      kind: "cover";
      id: string;
      label: string;
    }
  | {
      kind: "spread";
      id: string;
      label: string;
      spread: PreviewSpread;
    };

export type AlbumEditScreenProps = {
  petName: string;
  coverSrc: string | null;
  dateLabel: string;
  titlePrefix: string;
  titleMain: string;
  pageCount: number;
  pages: AlbumEditPageEntry[];
  selectedPageId?: string;
  backHref: string;
  previewHref: string;
  coverChangeHref: string;
  addPhotosHref: string;
  titleEditHref: string;
  doneHref: string;
  pageEditHref: string;
};

const TOOLS = [
  { key: "pages", label: "ページ編集", icon: BookOpen, active: true },
  { key: "add", label: "写真の追加", icon: Plus, active: false },
  { key: "layout", label: "レイアウト", icon: LayoutGrid, active: false },
  { key: "title", label: "タイトル", icon: Type, active: false },
  { key: "settings", label: "設定", icon: Settings, active: false },
] as const;

export function AlbumEditScreen({
  petName,
  coverSrc,
  dateLabel,
  titlePrefix,
  titleMain,
  pageCount,
  pages,
  selectedPageId = "cover",
  backHref,
  previewHref,
  coverChangeHref,
  addPhotosHref,
  titleEditHref,
  doneHref,
  pageEditHref,
}: AlbumEditScreenProps) {
  const toolHref = (key: string) => {
    if (key === "add") return addPhotosHref;
    if (key === "title") return titleEditHref;
    if (key === "pages") return pageEditHref;
    return undefined;
  };

  return (
    <main className="album-edit-page">
      <header className="album-edit-header">
        <Link
          href={backHref}
          className="album-edit-header-side album-edit-back ds-focus"
          aria-label="戻る"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="album-edit-header-title">アルバムを編集</h1>
        <Link href={previewHref} className="album-edit-header-side album-edit-preview ds-focus">
          プレビュー
        </Link>
      </header>

      <div className="album-edit-body">
        <div className="album-edit-cover-wrap">
          <AlbumCoverBook
            shell="monthly"
            size="full"
            coverSrc={coverSrc}
            dateLabel={dateLabel}
            titlePrefix={titlePrefix}
            titleMain={titleMain}
            label={`${petName}のアルバム表紙`}
            showBrand
            priority
            className="album-edit-cover-book"
          >
            <Link
              href={coverChangeHref}
              className="album-edit-cover-change ds-focus"
              data-testid="album-edit-cover-change"
            >
              <ImageIcon size={15} strokeWidth={1.9} aria-hidden="true" />
              表紙を変更
            </Link>
          </AlbumCoverBook>
        </div>

        <nav className="album-edit-toolbar" aria-label="編集ツール">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const href = toolHref(tool.key);
            const className = `album-edit-tool${tool.active ? " is-active" : ""}`;
            const inner = (
              <>
                <span className="album-edit-tool-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="album-edit-tool-label">{tool.label}</span>
              </>
            );
            if (href) {
              return (
        <Link
          key={tool.key}
          href={href}
          className={`${className} ds-focus`}
          data-testid={tool.key === "pages" ? "album-edit-tool-pages" : undefined}
        >
          {inner}
        </Link>
              );
            }
            return (
              <span key={tool.key} className={className} aria-disabled="true">
                {inner}
              </span>
            );
          })}
        </nav>

        <section className="album-edit-pages" aria-labelledby="album-edit-pages-heading">
          <div className="album-edit-pages-head">
            <h2 id="album-edit-pages-heading" className="album-edit-pages-title">
              ページ一覧（全{pageCount}ページ）
            </h2>
            <p className="album-edit-pages-hint">長押しで並べ替え</p>
          </div>
          <div className="album-edit-pages-scroll">
            <ul className="album-edit-page-grid">
              {pages.map((page) => {
                const selected = page.id === selectedPageId;
                return (
                  <li key={page.id} className="album-edit-page-item">
                    <div
                      className={`album-edit-page-thumb${selected ? " is-selected" : ""}${
                        page.kind === "cover" ? " is-cover" : " is-spread"
                      }`}
                    >
                      {page.kind === "cover" ? (
                        <AlbumCoverBook
                          shell="monthly"
                          size="thumbnail"
                          coverSrc={coverSrc}
                          dateLabel={dateLabel}
                          titlePrefix={titlePrefix}
                          titleMain={titleMain}
                          label={`${petName}の表紙`}
                          showBrand
                          className="album-edit-page-cover"
                        />
                      ) : (
                        <BookSpread
                          spread={page.spread}
                          variant="thumbnail"
                          className="album-edit-page-spread"
                        />
                      )}
                    </div>
                    <p className="album-edit-page-label">{page.label}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <div className="album-edit-actions">
          <Link href={doneHref} className="album-edit-primary ds-focus">
            編集を完了する
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
