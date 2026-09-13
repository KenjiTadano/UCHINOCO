import type { PhotoMonthGroup } from "@/lib/photo-timeline";
import { listImagePath } from "@/lib/photo-list-images";
import { EditorialPhotoGrid, MemoryDateHeader } from "@/app/_components/ui";

type MonthPhoto = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
};

type MonthPhotoGridProps = {
  groups: PhotoMonthGroup<MonthPhoto>[];
  petId: string;
  petName: string;
  signedUrlByPath: Map<string, string>;
  variant?: "editorial" | "classic";
};

export function MonthPhotoGrid({
  groups,
  petId,
  petName,
  signedUrlByPath,
  variant = "editorial",
}: MonthPhotoGridProps) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.monthKey}
          aria-labelledby={`month-${group.monthKey}`}
        >
          {variant === "editorial" ? <MemoryDateHeader date={group.monthLabel} count={group.photos.length} /> : (
            <div className="mb-3 flex items-baseline justify-between gap-3"><h2 id={`month-${group.monthKey}`} className="app-section-title">{group.monthLabel}</h2><p className="shrink-0 text-sm text-muted">{group.photos.length}枚</p></div>
          )}
          {variant === "editorial" ? <EditorialPhotoGrid photos={group.photos.flatMap((photo) => {
            const signedUrl = signedUrlByPath.get(listImagePath(photo));
            return signedUrl ? [{ id: photo.id, src: signedUrl, alt: `${petName}の${group.monthLabel}の思い出写真`, href: `/pets/${petId}/photos/${photo.id}`, favorite: photo.favorite }] : [];
          })} /> : (
            <ul className="grid grid-cols-3 gap-1.5">
              {group.photos.map((photo, index) => {
                const signedUrl = signedUrlByPath.get(listImagePath(photo));
                return <li key={photo.id} className="app-photo-frame aspect-square">{signedUrl ? <Link className="relative block size-full ds-focus" href={`/pets/${petId}/photos/${photo.id}`} aria-label={`${group.monthLabel}の${petName}の思い出写真${index + 1}を詳しく見る`}><Image src={signedUrl} alt={`${petName}の写真`} fill sizes="(max-width: 640px) 33vw, 180px" className="object-cover" unoptimized />{photo.favorite ? <span className="absolute right-1.5 top-1.5 text-favorite" aria-hidden="true">★</span> : null}</Link> : <div className="flex size-full items-center justify-center text-xs text-muted">表示できません</div>}</li>;
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
import Image from "next/image";
import Link from "next/link";
