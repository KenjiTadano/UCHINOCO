"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  SquarePen,
} from "lucide-react";
import type { PreviewPhoto, PreviewSpread } from "@/lib/album-preview-spreads";
import { BookSpread } from "../_components/book-spread";

export type AlbumPreviewScreenProps = {
  spreads: PreviewSpread[];
  backHref: string;
  editHref: string;
  orderHref: string;
};

function thumbPhotos(spread: PreviewSpread): PreviewPhoto[] {
  switch (spread.layout) {
    case "B":
      return [spread.leftTop, spread.rightTop];
    case "D":
      return spread.leftPhoto
        ? [spread.rightPhoto, spread.leftPhoto]
        : [spread.rightPhoto];
    case "E":
      return spread.rightSmall
        ? [spread.leftPhoto, spread.rightLarge]
        : [spread.leftPhoto, spread.rightLarge];
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

export function AlbumPreviewScreen({
  spreads,
  backHref,
  editHref,
  orderHref,
}: AlbumPreviewScreenProps) {
  const [index, setIndex] = useState(0);
  const totalSpreads = spreads.length;
  const spread = spreads[index] ?? null;
  const totalPages = Math.max(totalSpreads * 2, 2);
  const pageLabel = `${Math.min(index * 2 + 1, totalPages)} / ${totalPages}`;
  const thumbsCentered = totalSpreads <= 3;

  const go = (next: number) => {
    if (totalSpreads === 0) return;
    setIndex((next + totalSpreads) % totalSpreads);
  };

  return (
    <main className="album-preview-page-root">
      <header className="album-preview-header">
        <Link
          href={backHref}
          className="album-preview-header-side album-preview-back ds-focus"
          aria-label="戻る"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="album-preview-header-title">アルバムのプレビュー</h1>
        <Link href={editHref} className="album-preview-header-side album-preview-edit ds-focus">
          編集する
        </Link>
      </header>

      <div className="album-preview-body">
        {spread ? (
          <>
            <p className="album-preview-page-num" aria-live="polite">
              {pageLabel}
            </p>

            <div className="album-preview-stage">
              <button
                type="button"
                className="album-preview-arrow album-preview-arrow-left ds-focus"
                aria-label="前の見開き"
                onClick={() => go(index - 1)}
                disabled={totalSpreads <= 1}
              >
                <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>

              <BookSpread spread={spread} variant="full" priority />

              <button
                type="button"
                className="album-preview-arrow album-preview-arrow-right ds-focus"
                aria-label="次の見開き"
                onClick={() => go(index + 1)}
                disabled={totalSpreads <= 1}
              >
                <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div
              className={`album-preview-thumbs${thumbsCentered ? " is-centered" : ""}`}
              role="tablist"
              aria-label="見開き一覧"
            >
              {spreads.slice(0, 6).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className={`album-preview-thumb${i === index ? " is-selected" : ""}`}
                  onClick={() => setIndex(i)}
                >
                  <ThumbPreview spread={s} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="album-preview-empty">プレビューできる写真がありません。</p>
        )}

        <div className="album-preview-actions">
          <Link href={orderHref} className="album-preview-primary ds-focus">
            <BookOpen size={18} strokeWidth={1.9} aria-hidden="true" />
            このアルバムで注文する
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <Link href={editHref} className="album-preview-secondary ds-focus">
            <SquarePen size={16} strokeWidth={1.9} aria-hidden="true" />
            編集を続ける
          </Link>
        </div>
      </div>
    </main>
  );
}
