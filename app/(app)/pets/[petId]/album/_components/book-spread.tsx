"use client";

import Image from "next/image";
import { PawPrint } from "lucide-react";
import type { PreviewPhoto, PreviewSpread } from "@/lib/album-preview-spreads";

export type BookSpreadVariant = "full" | "thumbnail" | "edit";

const BLANK_SPREAD = "/album/06_3_album_preview_blank_spread_taller.png";

function SpreadPhoto({
  photo,
  className,
  sizes,
}: {
  photo: PreviewPhoto;
  className?: string;
  sizes: string;
}) {
  return (
    <span className={`album-preview-photo ${className ?? ""}`}>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        className="object-cover"
        style={{ objectPosition: photo.objectPosition ?? "center" }}
        unoptimized
      />
    </span>
  );
}

function PageSurface({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className={`album-preview-page album-preview-page-${side}`}>{children}</div>
  );
}

function TextBlock({
  eyebrow,
  title,
  body,
  accent,
  compact,
}: {
  eyebrow?: string | null;
  title: string | null;
  body: string | null;
  accent?: string | null;
  compact?: boolean;
}) {
  return (
    <div className="album-preview-text-page">
      {!compact && eyebrow ? <p className="album-preview-eyebrow">{eyebrow}</p> : null}
      {title ? <h3 className="album-preview-book-title">{title}</h3> : null}
      {!compact && body ? <p className="album-preview-book-body">{body}</p> : null}
      {!compact ? (
        accent ? (
          <p className="album-preview-book-accent">
            <PawPrint size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{accent}</span>
          </p>
        ) : (
          <span className="album-preview-season-accent" aria-hidden="true">
            <PawPrint size={16} strokeWidth={1.6} />
          </span>
        )
      ) : null}
    </div>
  );
}

function SpreadContent({
  spread,
  variant,
}: {
  spread: PreviewSpread;
  variant: BookSpreadVariant;
}) {
  const compact = variant === "thumbnail";
  const sizes = compact
    ? { full: "90px", large: "70px", medium: "60px", small: "40px", inset: "45px" }
    : { full: "200px", large: "160px", medium: "140px", small: "80px", inset: "100px" };

  if (spread.layout === "D") {
    return (
      <>
        <PageSurface side="left">
          <div className="album-preview-layout-d-left">
            <TextBlock
              eyebrow={spread.eyebrow}
              title={spread.title}
              body={spread.body}
              accent={spread.accent}
              compact={compact}
            />
            {spread.leftPhoto ? (
              <SpreadPhoto
                photo={spread.leftPhoto}
                className="is-inset"
                sizes={sizes.inset}
              />
            ) : null}
          </div>
        </PageSurface>
        <PageSurface side="right">
          <SpreadPhoto
            photo={spread.rightPhoto}
            className="is-full is-wide"
            sizes={sizes.full}
          />
        </PageSurface>
      </>
    );
  }

  if (spread.layout === "E") {
    return (
      <>
        <PageSurface side="left">
          <div className="album-preview-layout-e-left">
            <TextBlock title={spread.title} body={spread.body} compact={compact} />
            <SpreadPhoto
              photo={spread.leftPhoto}
              className="is-medium"
              sizes={sizes.medium}
            />
          </div>
        </PageSurface>
        <PageSurface side="right">
          <div className="album-preview-layout-e-right">
            <SpreadPhoto
              photo={spread.rightLarge}
              className="is-large"
              sizes={sizes.large}
            />
            {spread.rightSmall ? (
              <SpreadPhoto
                photo={spread.rightSmall}
                className="is-inset"
                sizes={sizes.inset}
              />
            ) : null}
          </div>
        </PageSurface>
      </>
    );
  }

  if (spread.layout === "A") {
    return (
      <>
        <PageSurface side="left">
          <TextBlock
            title={spread.title}
            body={spread.body}
            accent={spread.accent}
            compact={compact}
          />
        </PageSurface>
        <PageSurface side="right">
          <SpreadPhoto
            photo={spread.rightPhoto}
            className="is-full is-wide"
            sizes={sizes.full}
          />
        </PageSurface>
      </>
    );
  }

  if (spread.layout === "C") {
    return (
      <>
        <PageSurface side="left">
          <TextBlock title={spread.title} body={spread.body} compact={compact} />
        </PageSurface>
        <PageSurface side="right">
          <SpreadPhoto
            photo={spread.rightPhoto}
            className="is-full is-wide"
            sizes={sizes.full}
          />
        </PageSurface>
      </>
    );
  }

  if (spread.layout === "F") {
    return (
      <>
        <PageSurface side="left">
          <TextBlock
            title={spread.title}
            body={spread.body}
            accent={spread.accent}
            compact={compact}
          />
        </PageSurface>
        <PageSurface side="right">
          <div className="album-preview-right-stack album-preview-layout-f-right">
            <SpreadPhoto photo={spread.rightTop} className="is-large" sizes={sizes.large} />
            <div className="album-preview-collage-row">
              <SpreadPhoto
                photo={spread.rightBottom[0]}
                className="is-small"
                sizes={sizes.small}
              />
              <SpreadPhoto
                photo={spread.rightBottom[1]}
                className="is-small"
                sizes={sizes.small}
              />
            </div>
          </div>
        </PageSurface>
      </>
    );
  }

  if (spread.layout === "G") {
    return (
      <>
        <PageSurface side="left">
          <SpreadPhoto
            photo={spread.leftPhoto}
            className="is-full is-wide"
            sizes={sizes.full}
          />
        </PageSurface>
        <PageSurface side="right">
          <div className="album-preview-layout-g-right">
            <SpreadPhoto photo={spread.rightTop} className="is-large" sizes={sizes.large} />
            <SpreadPhoto
              photo={spread.rightBottom}
              className="is-large"
              sizes={sizes.large}
            />
          </div>
        </PageSurface>
      </>
    );
  }

  // Layout B — collage
  return (
    <>
      <PageSurface side="left">
        <div className="album-preview-collage">
          <SpreadPhoto photo={spread.leftTop} className="is-large" sizes={sizes.large} />
          <div className="album-preview-collage-row">
            <SpreadPhoto
              photo={spread.leftBottom[0]}
              className="is-small"
              sizes={sizes.small}
            />
            <SpreadPhoto
              photo={spread.leftBottom[1]}
              className="is-small"
              sizes={sizes.small}
            />
          </div>
        </div>
      </PageSurface>
      <PageSurface side="right">
        <div className="album-preview-right-stack">
          <SpreadPhoto photo={spread.rightTop} className="is-large" sizes={sizes.large} />
          <div className="album-preview-text-block">
            {spread.title ? (
              <h3 className="album-preview-book-title">{spread.title}</h3>
            ) : null}
            {!compact && spread.body ? (
              <p className="album-preview-book-body">{spread.body}</p>
            ) : null}
            {!compact ? (
              <PawPrint
                className="album-preview-paw"
                size={14}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            ) : null}
          </div>
        </div>
      </PageSurface>
    </>
  );
}

type BookSpreadProps = {
  spread: PreviewSpread;
  variant?: BookSpreadVariant;
  className?: string;
  priority?: boolean;
};

/**
 * Shared open-book spread (06.3 preview / 07.1 thumbs / 07.2 edit).
 * `thumbnail` keeps photo placement / titles; omits body accents.
 * `edit` matches full rendering for the page editor stage.
 */
export function BookSpread({
  spread,
  variant = "full",
  className = "",
  priority = false,
}: BookSpreadProps) {
  const isThumb = variant === "thumbnail";

  return (
    <div
      className={`book-spread album-preview-book book-spread--${variant}${className ? ` ${className}` : ""}`}
    >
      <Image
        src={BLANK_SPREAD}
        alt=""
        fill
        sizes={isThumb ? "120px" : "362px"}
        className="object-contain"
        priority={priority}
        unoptimized
      />
      <SpreadContent spread={spread} variant={variant === "edit" ? "full" : variant} />
    </div>
  );
}
