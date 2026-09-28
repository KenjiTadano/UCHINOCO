"use client";

import type { PreviewSpread } from "@/lib/album-preview-spreads";
import { BookSpread } from "./book-spread";

type Props = {
  spread: PreviewSpread;
  label: string;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
};

/** Shared spread thumbnail used by 07.1 page list + 07.2 page edit strip. */
export function BookSpreadThumbnail({
  spread,
  label,
  selected = false,
  onSelect,
  className = "",
}: Props) {
  const inner = (
    <>
      <span className="book-spread-thumb-frame">
        <BookSpread spread={spread} variant="thumbnail" className="book-spread-thumb-book" />
      </span>
      <span className="book-spread-thumb-label">{label}</span>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className={`book-spread-thumb${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
        aria-pressed={selected}
        data-testid="book-spread-thumb"
        data-selected={selected ? "true" : "false"}
        onClick={onSelect}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={`book-spread-thumb${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
    >
      {inner}
    </div>
  );
}
