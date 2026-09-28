import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import {
  getCoverColor,
  getCoverTemplate,
  type CoverColorId,
  type CoverTemplateId,
} from "@/lib/album-cover-templates";

export type AlbumCoverBookShell = "monthly" | "complete";
export type AlbumCoverBookSize = "full" | "thumbnail" | "edit";

export type AlbumCoverBookProps = {
  coverSrc: string | null;
  dateLabel: string;
  titlePrefix: string;
  titleMain: string;
  /** Accessible name for the cover. */
  label: string;
  shell?: AlbumCoverBookShell;
  size?: AlbumCoverBookSize;
  showBrand?: boolean;
  priority?: boolean;
  className?: string;
  /** 07.3 design template overlay. */
  templateId?: CoverTemplateId;
  /** 07.3 cover shell tint. */
  colorId?: CoverColorId;
  /** Extra overlay (e.g. 07.1「表紙を変更」). */
  children?: ReactNode;
  /** Original object path for the cover photo. Does not change layout. */
  imagePath?: string;
};

const SHELL: Record<
  AlbumCoverBookShell,
  { src: string; aspect: string; sizes: Record<AlbumCoverBookSize, string> }
> = {
  monthly: {
    src: "/album/monthly_book_blank_cover.png",
    aspect: "709 / 941",
    sizes: { full: "240px", thumbnail: "110px", edit: "280px" },
  },
  complete: {
    src: "/album/complete_blank_cover.png?v=2",
    aspect: "579 / 841",
    sizes: { full: "220px", thumbnail: "110px", edit: "260px" },
  },
};

/**
 * Shared front-facing photobook cover.
 * Layer order: shell → photo → template overlay → typography → controls.
 */
export function AlbumCoverBook({
  coverSrc,
  dateLabel,
  titlePrefix,
  titleMain,
  label,
  shell = "monthly",
  size = "full",
  showBrand = true,
  priority = false,
  className = "",
  templateId = "simple",
  colorId = "white",
  children,
  imagePath = "",
}: AlbumCoverBookProps) {
  const conf = SHELL[shell];
  const template = getCoverTemplate(templateId);
  const color = getCoverColor(colorId);
  const style = {
    aspectRatio: conf.aspect,
    ...(color.tint ? ({ "--cover-tint": color.tint } as CSSProperties) : null),
  } as CSSProperties;

  return (
    <div
      className={`album-cover-book album-cover-book--${shell} album-cover-book--${size} album-cover-book--tpl-${templateId}${color.tint ? " has-tint" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {/* 1. Book shell */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={conf.src} alt="" className="album-cover-book-shell" />

      {/* Optional shell tint (multiply) — keeps paper texture */}
      {color.tint ? (
        <span className="album-cover-book-tint" aria-hidden="true" />
      ) : null}

      {/* 2. Cover photo */}
      {coverSrc ? (
        <span className="album-cover-book-photo">
          <Image
            src={coverSrc}
            alt=""
            fill
            sizes={conf.sizes[size]}
            className="object-cover"
            unoptimized
            priority={priority}
            data-image-kind={imagePath ? "original" : undefined}
            data-src-path={imagePath || undefined}
          />
        </span>
      ) : (
        <span className="album-cover-book-photo is-empty" aria-hidden="true" />
      )}

      {/* 3. Template overlay */}
      {template.overlaySrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={template.overlaySrc}
          alt=""
          className="album-cover-book-overlay"
        />
      ) : null}

      {/* 4. Typography */}
      <div className="album-cover-book-meta">
        <p className="album-cover-book-date">{dateLabel}</p>
        <div className="album-cover-book-title">
          <p className="album-cover-book-title-prefix">{titlePrefix}</p>
          <p className="album-cover-book-title-main">{titleMain}</p>
        </div>
        {showBrand ? <p className="album-cover-book-brand">UCHINOCO</p> : null}
      </div>

      {/* Controls (07.1 / 07.3) */}
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}
