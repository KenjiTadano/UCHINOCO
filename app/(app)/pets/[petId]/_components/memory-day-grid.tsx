import Image from "next/image";
import Link from "next/link";

export type MemoryDayPhoto = {
  id: string;
  src: string;
  alt: string;
  href: string;
  favorite?: boolean;
  overlay?: string | null;
};

function PhotoTile({
  photo,
  className,
  sizes,
  overlay,
}: {
  photo: MemoryDayPhoto;
  className?: string;
  sizes: string;
  overlay?: string | null;
}) {
  return (
    <Link
      href={photo.href}
      aria-label={`${photo.alt}を開く`}
      className={`mem-photo ds-focus ${className ?? ""}`}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        className="object-cover"
        unoptimized
      />
      {overlay ? (
        <span className="mem-photo-overlay" aria-hidden="true">
          {overlay}
        </span>
      ) : null}
      {photo.favorite ? (
        <span className="mem-photo-fav" aria-label="お気に入り">
          ★
        </span>
      ) : null}
    </Link>
  );
}

/** Asymmetric day grid: large left + stacked small right (matches 02_memories). */
export function MemoryDayGrid({ photos }: { photos: MemoryDayPhoto[] }) {
  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <div className="mem-grid mem-grid-1">
        <PhotoTile
          photo={photos[0]}
          className="mem-photo-hero"
          sizes="358px"
          overlay={photos[0].overlay}
        />
      </div>
    );
  }

  if (photos.length === 2) {
    return (
      <div className="mem-grid mem-grid-2">
        <PhotoTile
          photo={photos[0]}
          className="mem-photo-hero"
          sizes="220px"
          overlay={photos[0].overlay}
        />
        <PhotoTile photo={photos[1]} className="mem-photo-side" sizes="130px" />
      </div>
    );
  }

  const sideCount = Math.min(photos.length - 1, 3);
  const side = photos.slice(1, 1 + sideCount);

  return (
    <div className={`mem-grid mem-grid-side-${sideCount}`}>
      <PhotoTile
        photo={photos[0]}
        className="mem-photo-hero"
        sizes="220px"
        overlay={photos[0].overlay}
      />
      <div className="mem-grid-stack">
        {side.map((photo) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            className="mem-photo-side"
            sizes="130px"
          />
        ))}
      </div>
    </div>
  );
}
