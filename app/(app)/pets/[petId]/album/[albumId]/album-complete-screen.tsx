import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  Heart,
  ImageIcon,
  Printer,
  SquarePen,
} from "lucide-react";
import { AlbumCoverBook } from "../_components/album-cover-book";
import { buildCoverTitleLines } from "@/lib/album-cover-title";
import { PlusUpgradeCta } from "@/app/(app)/plus/plus-checkout-button";
import { NewPhotoSuggestionNotice } from "./new-photo-suggestion";

export type AlbumCompleteScreenProps = {
  petId: string;
  albumId: string;
  petName: string;
  albumTitle: string;
  coverSrc: string | null;
  photoCount: number;
  memoryCount: number;
  periodMonthLabel: string;
  coverDateLabel: string;
  backHref: string;
  editHref: string;
  printHref: string | null;
  acceptAction: () => Promise<void>;
  regenerateAction: () => Promise<void>;
  canRegenerate: boolean;
  showRegenerateUpsell: boolean;
  newPhotoSuggestion?: { href: string; count: number } | null;
};

export { buildCoverTitleLines };

export function AlbumCompleteScreen({
  petId,
  albumId,
  petName,
  albumTitle,
  coverSrc,
  photoCount,
  memoryCount,
  periodMonthLabel,
  coverDateLabel,
  backHref,
  editHref,
  printHref,
  acceptAction,
  regenerateAction,
  canRegenerate,
  showRegenerateUpsell,
  newPhotoSuggestion,
}: AlbumCompleteScreenProps) {
  const coverLines = buildCoverTitleLines(petName, albumTitle, periodMonthLabel);

  return (
    <main className="ai-complete-page">
      <header className="ai-complete-header">
        <Link
          href={backHref}
          className="ai-complete-header-side ai-complete-back ds-focus"
          aria-label="戻る"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="ai-complete-header-title">AIが作ったアルバム</h1>
        <Link href={editHref} className="ai-complete-header-side ai-complete-edit ds-focus">
          編集する
        </Link>
      </header>

      <div className="ai-complete-body">
        {newPhotoSuggestion ? <NewPhotoSuggestionNotice {...newPhotoSuggestion} /> : null}
        <div className="ai-complete-hero">
          <div className="ai-complete-title-row">
            <Image
              src="/album/heading_lines_left.png"
              alt=""
              width={43}
              height={99}
              className="ai-complete-title-deco"
              unoptimized
            />
            <h2 className="ai-complete-title">
              アルバムが
              <br />
              できました！
            </h2>
            <Image
              src="/album/heading_lines_right.png"
              alt=""
              width={43}
              height={99}
              className="ai-complete-title-deco"
              unoptimized
            />
          </div>
          <p className="ai-complete-desc">
            {petName}との思い出を
            <br />
            1冊にまとめました。
          </p>
        </div>

        <div className="ai-complete-book-wrap">
          <AlbumCoverBook
            shell="complete"
            coverSrc={coverSrc}
            dateLabel={coverDateLabel}
            titlePrefix={coverLines.prefix}
            titleMain={coverLines.main}
            label={`${petName}のアルバム表紙`}
            showBrand={false}
            priority
            className="ai-complete-cover-book"
          />
        </div>

        <ul className="ai-complete-stats" aria-label="アルバムの概要">
          <li>
            <ImageIcon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className="ai-complete-stat-value">{photoCount}枚</span>
            <span className="ai-complete-stat-label">の写真</span>
          </li>
          <li>
            <Calendar size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className="ai-complete-stat-value">{memoryCount}つ</span>
            <span className="ai-complete-stat-label">の思い出</span>
          </li>
          <li>
            <Heart size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className="ai-complete-stat-value">{petName}</span>
            <span className="ai-complete-stat-label">の表紙写真</span>
          </li>
        </ul>

        <div className="ai-complete-actions">
          <Link href={`/pets/${petId}/album/${albumId}?view=preview`} className="ai-complete-primary ds-focus">アルバムを見る<ArrowRight size={18} aria-hidden="true" /></Link>
          <form action={acceptAction}>
            <button type="submit" className="ai-complete-primary ds-focus w-full">
              このままでOK
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
          <Link href={editHref} className="ai-complete-secondary ds-focus">
            <SquarePen size={16} strokeWidth={1.9} aria-hidden="true" />
            少し編集する
          </Link>
          {printHref ? (
            <Link href={printHref} className="ai-complete-secondary ds-focus">
              <Printer size={16} strokeWidth={1.9} aria-hidden="true" />
              印刷を見る
            </Link>
          ) : null}
          {canRegenerate ? (
            <form action={regenerateAction}>
              <button type="submit" className="ai-complete-recreate ds-focus w-full">
                ペットや期間を変えて作る
              </button>
            </form>
          ) : showRegenerateUpsell ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-center text-sm text-muted">アルバムの再生成はPLUSで利用できます。</p>
              <PlusUpgradeCta next={backHref} />
              <Link className="ds-focus min-h-11 px-3 py-2 text-center text-sm text-muted underline underline-offset-4" href={backHref}>
                今はFREEのまま使う
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
