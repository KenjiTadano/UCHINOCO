"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  Car,
  ChartNoAxesColumnIncreasing,
  Heart,
  House,
  Leaf,
} from "lucide-react";

export type AlbumListCardData = {
  key: string;
  label: string;
  count: number;
  href: string;
  src: string | null;
  filterKeys: string[];
};

function CardIcon({ label }: { label: string }) {
  const props = { size: 14, strokeWidth: 1.7, "aria-hidden": true as const };
  if (/お気に入り/.test(label)) return <Heart {...props} />;
  if (/成長/.test(label)) return <ChartNoAxesColumnIncreasing {...props} />;
  if (/おでかけ/.test(label)) return <Car {...props} />;
  if (/季節/.test(label)) return <Leaf {...props} />;
  if (/日常|家族/.test(label)) return <House {...props} />;
  return <BookOpen {...props} />;
}

export function AlbumListFilters({
  filters,
  cards,
}: {
  filters: string[];
  cards: AlbumListCardData[];
}) {
  const [active, setActive] = useState(filters[0] ?? "すべて");
  const visible =
    active === "すべて"
      ? cards
      : cards.filter((card) =>
          card.filterKeys.some(
            (key) => key === active || key.includes(active) || active.includes(key),
          ),
        );

  return (
    <div className="album-list-block">
      <div className="album-filters" role="tablist" aria-label="アルバムの絞り込み">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={active === filter}
            className={`album-filter ds-focus${active === filter ? " is-active" : ""}`}
            onClick={() => setActive(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="album-list-empty">
          <p>この条件のアルバムはまだありません。</p>
        </div>
      ) : (
        <ul className="album-list-rail">
          {visible.map((card) => (
            <li key={card.key} className="album-list-card" data-filter={card.filterKeys.join(",")}>
              <Link
                href={card.href}
                className="album-list-link ds-focus"
                aria-label={`${card.label}を開く`}
              >
                <div className="album-list-cover">
                  {card.src ? (
                    <Image
                      src={card.src}
                      alt=""
                      fill
                      sizes="112px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <span className="album-list-cover-fallback" />
                  )}
                </div>
                <div className="album-list-meta">
                  <span className="album-list-icon">
                    <CardIcon label={card.label} />
                  </span>
                  <span className="album-list-text">
                    <span className="album-list-name">{card.label}</span>
                    <span className="album-list-count">
                      {card.count.toLocaleString()}枚
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
