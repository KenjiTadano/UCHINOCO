import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  Heart,
  ImageIcon,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { AlbumCoverBook } from "../_components/album-cover-book";
import { buildCoverTitleLines } from "@/lib/album-cover-title";

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
  highlights: string[];
  backHref: string;
  editHref: string;
  previewHref: string;
  recreateHref: string;
};

export { buildCoverTitleLines };

export function AlbumCompleteScreen({
  petName,
  albumTitle,
  coverSrc,
  photoCount,
  memoryCount,
  periodMonthLabel,
  coverDateLabel,
  highlights,
  backHref,
  editHref,
  previewHref,
  recreateHref,
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
              今月のアルバムが
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
            {petName}の素敵な思い出を
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
            <span className="ai-complete-stat-label">のベストショット</span>
          </li>
        </ul>

        <div className="ai-complete-actions">
          <Link href={previewHref} className="ai-complete-primary ds-focus">
            中をプレビューする
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <Link href={recreateHref} className="ai-complete-secondary ds-focus">
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
            別のテーマで作り直す
          </Link>
        </div>

        <section
          className="ai-complete-highlights"
          aria-labelledby="ai-complete-highlights-heading"
        >
          <h3 id="ai-complete-highlights-heading" className="ai-complete-highlights-head">
            <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
            こんな思い出を選びました
          </h3>
          <ul className="ai-complete-highlights-list">
            {highlights.map((text) => (
              <li key={text}>
                <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

/** Display highlights for the complete screen — cosmetic copy from pet/period data. */
export function buildAlbumCompleteHighlights(
  petName: string,
  opts?: { multiPetLabel?: string | null },
): string[] {
  const pair = opts?.multiPetLabel?.trim();
  if (pair) {
    const [a, b] = pair.split(/[・･]/).map((s) => s.trim()).filter(Boolean);
    if (a && b) {
      return [
        `${a}のお散歩やおでかけの笑顔`,
        `${b}のリラックスした寝顔`,
        "季節の移ろい（夏〜秋）",
        "日常の何気ないかわいい瞬間",
        `${a}と${b}の一緒の時間`,
      ];
    }
  }
  return [
    `${petName}のお散歩やおでかけの笑顔`,
    `${petName}のリラックスした寝顔`,
    "季節の移ろい（夏〜秋）",
    "日常の何気ないかわいい瞬間",
    `${petName}との一緒の時間`,
  ];
}
