import type { AlbumCompositionItem } from "@/lib/album-draft/composition";

type VirtualPage = Extract<AlbumCompositionItem, { kind: "title" | "event" }>;

export function AlbumCompositionPage({ item, className = "" }: { item: VirtualPage; className?: string }) {
  return (
    <article className={`album-composition-page ${className}`.trim()} data-page-role={item.role}>
      {item.kind === "title" ? (
        <div className="album-composition-page-content">
          <h2>{item.title}</h2>
          <p>{item.petName}</p>
          <p className="album-composition-page-period">{item.period}</p>
        </div>
      ) : (
        <div className="album-composition-page-content">
          <h2>{item.title}</h2>
          <time dateTime={item.date}>{item.dateLabel}</time>
        </div>
      )}
    </article>
  );
}
