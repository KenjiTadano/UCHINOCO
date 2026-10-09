"use client";

import Link from "next/link";
import { useState } from "react";
import { AlbumCoverBook } from "../../_components/album-cover-book";
import { DraftSpreadView } from "../../_components/draft-spread-view";
import { generateAlbumPrint, startAlbumCheckout, type AlbumPrintResult } from "./actions";
import { PRINT_STALE_MESSAGE } from "@/lib/album-print/config";
import { PHOTOBOOK_PRODUCTS, calcPrice, formatPrice } from "@/lib/photobook-products";
import type { CoverEditorModel } from "@/lib/album-persistence/cover";
import { toAlbumEditorSpread } from "@/lib/album-persistence/editor";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
import type { PersistedSpreadView } from "@/lib/album-persistence/view";
import type { AlbumCompositionItem } from "@/lib/album-draft/composition";
import { AlbumCompositionPage } from "../../_components/album-composition-page";

type PrintSequenceItem = { kind: "title"; item: Extract<AlbumCompositionItem, { kind: "title" }> } | { kind: "event"; item: Extract<AlbumCompositionItem, { kind: "event" }> } | { kind: "spread"; item: PersistedSpreadView; role: string; density: string };

function printSequence(view: PersistedDraftView): PrintSequenceItem[] {
  if (!view.compositionPlan) return view.spreads.map((item) => ({ kind: "spread", item, role: "STORY", density: "MEDIUM" }));
  const byStoryId = new Map(view.spreads.map((spread) => [spread.storySpreadId, spread]));
  const seen = new Set<string>();
  const items = view.compositionPlan.items.flatMap((item): PrintSequenceItem[] => {
    if (item.kind === "title") return [{ kind: "title", item }];
    if (item.kind === "event") return [{ kind: "event", item }];
    const spread = byStoryId.get(item.storySpreadId);
    if (!spread) return [];
    seen.add(item.storySpreadId);
    return [{ kind: "spread", item: spread, role: item.role, density: item.density }];
  });
  return [...items, ...view.spreads.filter((spread) => !seen.has(spread.storySpreadId)).map((item) => ({ kind: "spread" as const, item, role: "STORY", density: "MEDIUM" }))];
}

export function PrintPreviewScreen({ petId, albumId, petName, dateLabel, cover, view, initial, editorHref }: { petId: string; albumId: string; petName: string; dateLabel: string; cover: CoverEditorModel | null; view: PersistedDraftView | null; initial: AlbumPrintResult; editorHref: string }) {
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState<"pdf" | "order" | null>(null);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const issues = result.issues;
  const blocking = issues.some((issue) => issue.severity === "blocking");
  const spreadCount = view?.spreads.length ?? 0;
  const sequence = view ? printSequence(view) : [];
  const pageCount = sequence.reduce((sum, item) => sum + (item.kind === "spread" ? 2 : 1), 0);
  const standard = PHOTOBOOK_PRODUCTS[0];
  const startingPrice = formatPrice(calcPrice(standard, standard.basePages));

  async function onGenerate() {
    setPending("pdf");
    const next = await generateAlbumPrint(petId, albumId);
    setResult(next);
    setPending(null);
    if (next.href) window.location.assign(next.href);
  }

  async function onOrder() {
    setPending("order");
    setOrderMessage(null);
    const next = await startAlbumCheckout(petId, albumId);
    setPending(null);
    if (next.href) window.location.assign(next.href);
    else setOrderMessage(next.message);
  }

  return (
    <main className="print-preview-page" data-testid="print-preview" data-ordered={result.ordered ? "true" : "false"} data-print-href={result.href ?? ""} data-print-message={result.message ?? ""}>
      <header className="print-preview-header">
        <Link href={editorHref} className="print-preview-back ds-focus">
          編集へ戻る
        </Link>
        <h1>印刷プレビュー</h1>
      </header>
      <p className="print-preview-note">保存済みの内容を表示しています。</p>
      {result.stale ? (
        <p className="print-preview-stale" data-testid="print-preview-stale">
          {PRINT_STALE_MESSAGE}
        </p>
      ) : null}
      {result.message && !result.stale ? <p className="print-preview-message">{result.message}</p> : null}
      {issues.length > 0 ? (
        <ul className="print-preview-issues" data-testid="print-preview-issues">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} data-severity={issue.severity} data-code={issue.code}>
              {issue.severity === "blocking" ? "停止" : "注意"}: {issue.message}
              {issue.dpi ? ` ${issue.dpi}dpi` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {result.ordered || !view ? null : (
        <>
          <section className="print-preview-cover" data-testid="print-preview-cover">
            <h2>表紙</h2>
            <AlbumCoverBook shell="monthly" size="edit" coverSrc={cover?.previewUrl || null} dateLabel={dateLabel} titlePrefix={cover?.subtitle ?? ""} titleMain={cover?.title || "タイトル"} label={`${petName}の表紙`} templateId={cover?.templateId ?? "simple"} colorId={cover?.colorId ?? "white"} showBrand imagePath={cover?.photoId ?? ""} />
          </section>
          {(() => {
            let pageNumber = 1;
            return sequence.map((item, index) => {
              if (item.kind === "title" || item.kind === "event") {
                pageNumber += 1;
                return <AlbumCompositionPage key={`${item.kind}-${index}`} item={item.item} className="print-preview-composition-page" />;
              }
              const spread = item.item;
              const editor = toAlbumEditorSpread(spread, view.previewUrls);
              const start = pageNumber;
              pageNumber += 2;
              return (
                <section key={spread.id} className="print-preview-spread" data-testid={`print-preview-spread-${index + 1}`} data-page-role={item.role} data-page-density={item.density}>
                  <h2>
                    {start}-{start + 1}
                  </h2>
                  <DraftSpreadView preview={spread.preview} frames={editor.frames} texts={spread.texts} decorations={spread.decorations} elements={spread.elements} backgrounds={spread.backgrounds} layoutId={editor.layoutId} digital />
                </section>
              );
            });
          })()}
          {view.spreads.some(spread=>spread.effectiveLayoutId.startsWith("E_")) ? <section className="print-preview-cover"><h2>裏表紙</h2><div className="album-editorial-back-cover" aria-label="裏表紙"><p>UCHINOCO</p><p>うちの子との、大切な日々。</p></div></section> : null}
          <section className="print-preview-order" data-testid="print-preview-summary">
            <p>見開き {spreadCount}</p>
            <p>ページ {pageCount}</p>
            <p>数量 1</p>
            <p>
              基本料金 {startingPrice}（{standard.name} {standard.basePages}ページ・商品選択で確定）
            </p>
            {issues.some((issue) => issue.severity === "warning") && !blocking ? <p data-testid="print-preview-warning-ok">注意があっても、この内容のまま注文できます。</p> : null}
            {orderMessage ? (
              <p className="print-preview-stale" data-testid="print-preview-order-error">
                {orderMessage}
              </p>
            ) : null}
            <button type="button" className="print-preview-generate ds-focus" data-testid="print-preview-order" disabled={pending != null || blocking || result.stale || !result.snapshotId} onClick={onOrder}>
              {pending === "order" ? "確認中" : "この内容で注文する"}
            </button>
          </section>
          <button type="button" className="print-preview-generate ds-focus" data-testid="print-preview-generate" disabled={pending != null || blocking} onClick={onGenerate}>
            {pending === "pdf" ? "作成中" : "PDFを作成"}
          </button>
        </>
      )}
    </main>
  );
}
