"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, SquarePen } from "lucide-react";
import type { PreviewPhoto, PreviewSpread } from "@/lib/album-preview-spreads";
import { toAlbumEditorSpread } from "@/lib/album-persistence/editor";
import type { PersistedDraftView, PersistedSpreadView } from "@/lib/album-persistence/view";
import type { AlbumCompositionItem } from "@/lib/album-draft/composition";
import { BookSpread } from "../_components/book-spread";
import { DraftSpreadView } from "../_components/draft-spread-view";
import { AlbumCoverBook } from "../_components/album-cover-book";
import type { CoverEditorModel } from "@/lib/album-persistence/cover";
import { AlbumCompositionPage } from "../_components/album-composition-page";

type PreviewSequenceItem = {kind:"front-cover" | "back-cover"} | { kind: "title"; item: Extract<AlbumCompositionItem, { kind: "title" }> } | { kind: "event"; item: Extract<AlbumCompositionItem, { kind: "event" }> } | { kind: "draft-spread"; item: PersistedSpreadView; role: string; density: string } | { kind: "legacy-spread"; item: PreviewSpread };

function previewSequence(draft: PersistedDraftView | null, spreads: PreviewSpread[]): PreviewSequenceItem[] {
  if (!draft) return spreads.map((item) => ({ kind: "legacy-spread", item }));
  if (!draft.compositionPlan) return draft.spreads.map((item) => ({ kind: "draft-spread", item, role: "STORY", density: "MEDIUM" }));
  const byStoryId = new Map(draft.spreads.map((spread) => [spread.storySpreadId, spread]));
  const seen = new Set<string>();
  const items = draft.compositionPlan.items.flatMap((item): PreviewSequenceItem[] => {
    if (item.kind === "title") return [{ kind: "title", item }];
    if (item.kind === "event") return [{ kind: "event", item }];
    const spread = byStoryId.get(item.storySpreadId);
    if (!spread) return [];
    seen.add(item.storySpreadId);
    return [{ kind: "draft-spread", item: spread, role: item.role, density: item.density }];
  });
  return [...items, ...draft.spreads.filter((spread) => !seen.has(spread.storySpreadId)).map((item) => ({ kind: "draft-spread" as const, item, role: "STORY", density: "MEDIUM" }))];
}

export type AlbumPreviewScreenProps = {
  spreads: PreviewSpread[];
  draft?: PersistedDraftView | null;
  cover?: CoverEditorModel | null;
  backHref: string;
  editHref: string;
  orderHref: string;
  printHref: string;
};

function thumbPhotos(spread: PreviewSpread): PreviewPhoto[] {
  switch (spread.layout) {
    case "B":
      return [spread.leftTop, spread.rightTop];
    case "D":
      return spread.leftPhoto ? [spread.rightPhoto, spread.leftPhoto] : [spread.rightPhoto];
    case "E":
      return spread.rightSmall ? [spread.leftPhoto, spread.rightLarge] : [spread.leftPhoto, spread.rightLarge];
    case "F":
      return [spread.rightTop, spread.rightBottom[0]];
    case "G":
      return [spread.leftPhoto, spread.rightTop];
    default:
      return [spread.rightPhoto];
  }
}

/** Compact strip thumbs under the main stage (06.3). */
function ThumbPreview({ spread }: { spread: PreviewSpread }) {
  const photos = thumbPhotos(spread);
  return (
    <span className="album-preview-thumb-inner">
      {photos.slice(0, 2).map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${photo.src}-${i}`} src={photo.src} alt="" />
      ))}
    </span>
  );
}

export function AlbumPreviewScreen({ spreads, draft = null, cover = null, backHref, editHref, orderHref, printHref }: AlbumPreviewScreenProps) {
  const [index, setIndex] = useState(0);
  const savedDraft = draft;
  const body = previewSequence(savedDraft, spreads);
  const hasBackCover = Boolean(cover && savedDraft?.spreads.some(spread => spread.effectiveLayoutId.startsWith("E_")));
  const sequence: PreviewSequenceItem[] = cover ? [{kind:"front-cover"},...body,...(hasBackCover ? [{kind:"back-cover" as const}] : [])] : body;
  const currentItem = sequence[index] ?? null;
  const totalPages = body.reduce((sum, item) => sum + (item.kind === "draft-spread" || item.kind === "legacy-spread" ? 2 : 1), 0);
  const pageOffset = sequence.slice(0, index).reduce((sum, item) => sum + (item.kind === "draft-spread" || item.kind === "legacy-spread" ? 2 : 1), 0);
  const pageLabel = currentItem?.kind === "front-cover" ? "表紙" : currentItem?.kind === "back-cover" ? "裏表紙" : `本文 ${Math.max(1,pageOffset-(cover?1:0)+1)} / ${Math.max(1,totalPages)}`;
  const thumbsCentered = sequence.length <= 3;
  const draftSpread = currentItem?.kind === "draft-spread" ? currentItem.item : null;
  const editorSpread = draftSpread && savedDraft ? toAlbumEditorSpread(draftSpread, savedDraft.previewUrls) : null;

  const go = (next: number) => {
    if (sequence.length === 0) return;
    setIndex((next + sequence.length) % sequence.length);
  };

  return (
    <main className="album-preview-page-root">
      <header className="album-preview-header">
        <Link href={backHref} className="album-preview-header-side album-preview-back ds-focus" aria-label="戻る">
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="album-preview-header-title">アルバムのプレビュー</h1>
        <Link href={editHref} className="album-preview-header-side album-preview-edit ds-focus">
          編集する
        </Link>
      </header>

      <div className="album-preview-body">
        {currentItem?.kind === "front-cover" || currentItem?.kind === "back-cover" ? (
          <>
            <p className="album-preview-page-num" aria-live="polite">{pageLabel}</p>
            <div className="album-preview-stage album-preview-stage--single" data-page-kind={currentItem.kind}>
              <button type="button" className="album-preview-arrow album-preview-arrow-left ds-focus" aria-label="前のページ" onClick={()=>go(index-1)}><ChevronLeft size={20} /></button>
              {currentItem.kind === "front-cover" && cover ? <AlbumCoverBook coverSrc={cover.previewUrl} dateLabel={cover.subtitle} titlePrefix="" titleMain={cover.title} label="表紙" templateId={cover.templateId} colorId={cover.colorId} /> : <div className="album-editorial-back-cover" aria-label="裏表紙"><p>UCHINOCO</p><p>うちの子との、大切な日々。</p></div>}
              <button type="button" className="album-preview-arrow album-preview-arrow-right ds-focus" aria-label="次のページ" onClick={()=>go(index+1)}><ChevronRight size={20} /></button>
            </div>
          </>
        ) : currentItem?.kind === "title" || currentItem?.kind === "event" ? (
          <>
            <p className="album-preview-page-num" aria-live="polite">
              {pageLabel}
            </p>
            <div className="album-preview-stage album-preview-stage--single">
              <button type="button" className="album-preview-arrow album-preview-arrow-left ds-focus" aria-label="前のページ" onClick={() => go(index - 1)} disabled={sequence.length <= 1}>
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <AlbumCompositionPage item={currentItem.item} />
              <button type="button" className="album-preview-arrow album-preview-arrow-right ds-focus" aria-label="次のページ" onClick={() => go(index + 1)} disabled={sequence.length <= 1}>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : draftSpread && editorSpread && savedDraft ? (
          <>
            <p className="album-preview-page-num" aria-live="polite">
              {pageLabel}
            </p>

            <div className="album-preview-stage">
              <button type="button" className="album-preview-arrow album-preview-arrow-left ds-focus" aria-label="前の見開き" onClick={() => go(index - 1)} disabled={sequence.length <= 1}>
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <div data-page-role={currentItem?.kind === "draft-spread" ? currentItem.role : undefined} data-page-density={currentItem?.kind === "draft-spread" ? currentItem.density : undefined}>
                <DraftSpreadView preview={draftSpread.preview} frames={editorSpread.frames} texts={draftSpread.texts} decorations={draftSpread.decorations} elements={draftSpread.elements} backgrounds={draftSpread.backgrounds} layoutId={editorSpread.layoutId} digital />
              </div>
              <button type="button" className="album-preview-arrow album-preview-arrow-right ds-focus" aria-label="次の見開き" onClick={() => go(index + 1)} disabled={sequence.length <= 1}>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className={`album-preview-thumbs${thumbsCentered ? " is-centered" : ""}`} role="tablist" aria-label="見開き一覧">
              {sequence.map((item, itemIndex) => {
                if (item.kind === "front-cover" || item.kind === "back-cover") return <button key={item.kind} type="button" role="tab" aria-selected={itemIndex===index} className={`album-preview-thumb album-preview-thumb--text${itemIndex===index?" is-selected":""}`} onClick={()=>setIndex(itemIndex)}>{item.kind==="front-cover"?"表紙":"裏表紙"}</button>;
                if (item.kind === "title" || item.kind === "event") {
                  return (
                    <button key={`${item.kind}-${itemIndex}`} type="button" role="tab" aria-selected={itemIndex === index} className={`album-preview-thumb album-preview-thumb--text${itemIndex === index ? " is-selected" : ""}`} onClick={() => setIndex(itemIndex)}>
                      {item.kind === "title" ? item.item.title : item.item.title}
                    </button>
                  );
                }
                if (item.kind !== "draft-spread") return null;
                const itemFrames = toAlbumEditorSpread(item.item, savedDraft.previewUrls).frames;
                return (
                  <button key={item.item.id} type="button" role="tab" aria-selected={itemIndex === index} className={`album-preview-thumb${itemIndex === index ? " is-selected" : ""}`} onClick={() => setIndex(itemIndex)}>
                    <span className="album-preview-thumb-inner">
                      {itemFrames.slice(0, 2).map((frame) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={frame.id} src={frame.previewUrl} alt="" />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : currentItem?.kind === "legacy-spread" ? (
          <>
            <p className="album-preview-page-num" aria-live="polite">
              {pageLabel}
            </p>

            <div className="album-preview-stage">
              <button type="button" className="album-preview-arrow album-preview-arrow-left ds-focus" aria-label="前の見開き" onClick={() => go(index - 1)} disabled={sequence.length <= 1}>
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>

              <BookSpread spread={currentItem.item} variant="full" priority />

              <button type="button" className="album-preview-arrow album-preview-arrow-right ds-focus" aria-label="次の見開き" onClick={() => go(index + 1)} disabled={sequence.length <= 1}>
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className={`album-preview-thumbs${thumbsCentered ? " is-centered" : ""}`} role="tablist" aria-label="見開き一覧">
              {sequence
                .filter((item) => item.kind === "legacy-spread")
                .slice(0, 6)
                .map((item, i) => (
                  <button key={i} type="button" role="tab" aria-selected={i === index} className={`album-preview-thumb${i === index ? " is-selected" : ""}`} onClick={() => setIndex(i)}>
                    <ThumbPreview spread={item.item} />
                  </button>
                ))}
            </div>
          </>
        ) : (
          <p className="album-preview-empty">プレビューできる写真がありません。</p>
        )}

        {cover && currentItem?.kind === "front-cover" ? <Link href={editHref.replace(/\/pages\/edit$/, "/cover/edit")} className="album-preview-secondary ds-focus">表紙を編集する</Link> : null}
        <div className="album-preview-section-nav" aria-label="アルバムの表示箇所">
          {cover ? <button type="button" className="app-button-secondary" onClick={()=>setIndex(0)}>表紙</button> : null}
          <button type="button" className="app-button-secondary" onClick={()=>setIndex(cover?1:0)}>本文</button>
          {hasBackCover ? <button type="button" className="app-button-secondary" onClick={()=>setIndex(sequence.length-1)}>裏表紙</button> : null}
        </div>
        {draft ? <Link href={printHref} className="album-preview-secondary ds-focus">印刷を確認する</Link> : null}
        <div className="album-preview-actions">
          <Link href={draft ? backHref : orderHref} className="album-preview-primary ds-focus">
            <BookOpen size={18} strokeWidth={1.9} aria-hidden="true" />
            {draft ? "このアルバムで進む" : "このアルバムで注文する"}
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <Link href={editHref} className="album-preview-secondary ds-focus">
            <SquarePen size={16} strokeWidth={1.9} aria-hidden="true" />
            少し編集する
          </Link>
        </div>
      </div>
    </main>
  );
}
