import Image from "next/image";

/**
 * Album cover collage shared component.
 * - 0 photos: placeholder
 * - 1 photo: full-bleed 4:3
 * - 2-3 photos: 2fr+1fr grid (large left + 2 small right)
 * petName is used as accessible alt text on the primary photo only.
 */
export function AlbumCoverCollage({ urls, petName }: { urls: string[]; petName: string }) {
  if (urls.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-surface-warm text-sm text-muted">
        写真がありません
      </div>
    );
  }
  if (urls.length === 1) {
    return (
      <div className="overflow-hidden rounded-2xl bg-surface-warm">
        <div className="relative aspect-[4/3]">
          <Image
            src={urls[0]}
            alt={`${petName}の思い出`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      </div>
    );
  }
  return (
    <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] gap-0.5 overflow-hidden rounded-2xl bg-surface-warm">
      <div className="relative overflow-hidden">
        <Image src={urls[0]} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="grid grid-rows-2 gap-0.5">
        <div className="relative overflow-hidden">
          <Image src={urls[1]} alt="" fill className="object-cover" unoptimized />
        </div>
        <div className="relative overflow-hidden">
          {urls[2] ? (
            <Image src={urls[2]} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="size-full bg-surface-warm" />
          )}
        </div>
      </div>
    </div>
  );
}
