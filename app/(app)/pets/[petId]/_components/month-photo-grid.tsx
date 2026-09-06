import Image from "next/image";
import Link from "next/link";
import type { PhotoMonthGroup } from "@/lib/photo-timeline";

type MonthPhoto = {
  id: string;
  storage_path: string;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
};

type MonthPhotoGridProps = {
  groups: PhotoMonthGroup<MonthPhoto>[];
  petId: string;
  petName: string;
  signedUrlByPath: Map<string, string>;
};

export function MonthPhotoGrid({
  groups,
  petId,
  petName,
  signedUrlByPath,
}: MonthPhotoGridProps) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.monthKey}
          aria-labelledby={`month-${group.monthKey}`}
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id={`month-${group.monthKey}`} className="app-section-title">
              {group.monthLabel}
            </h2>
            <p className="shrink-0 text-sm text-muted">
              {group.photos.length}枚
            </p>
          </div>

          <ul className="grid grid-cols-3 gap-1.5">
            {group.photos.map((photo, index) => {
              const signedUrl = signedUrlByPath.get(photo.storage_path);
              return (
                <li key={photo.id} className="app-photo-frame aspect-square">
                  {signedUrl ? (
                    <Link
                      className="relative block size-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      href={`/pets/${petId}/photos/${photo.id}`}
                      aria-label={`${group.monthLabel}の${petName}の思い出写真${index + 1}を詳しく見る${photo.favorite ? "（お気に入り）" : ""}`}
                    >
                      <Image
                        className="object-cover transition-opacity hover:opacity-85"
                        src={signedUrl}
                        alt={`${petName}の${group.monthLabel}の思い出写真${index + 1}`}
                        fill
                        sizes="(max-width: 640px) 33vw, 180px"
                        unoptimized
                      />
                      {photo.favorite ? (
                        <span
                          className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-sm text-favorite shadow-sm"
                          aria-hidden="true"
                        >
                          ★
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <div className="flex size-full items-center justify-center px-1 text-center text-xs text-muted">
                      表示できません
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
