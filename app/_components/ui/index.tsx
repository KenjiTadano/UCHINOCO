import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
        <h1 className="ds-heading">{title}</h1>
        {description ? <p className="app-description mt-2">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

type PetSwitcherProps = {
  pets: Array<{ id: string; name: string }>;
  currentPetId?: string;
  href?: (petId: string) => string;
};

export function PetSwitcher({ pets, currentPetId, href = (id) => `/pets/${id}` }: PetSwitcherProps) {
  if (pets.length < 2) return null;

  return (
    <nav aria-label="ペットを選択" className="flex gap-2 overflow-x-auto pb-1">
      {pets.map((pet) => {
        const active = pet.id === currentPetId;
        return (
          <Link
            key={pet.id}
            href={href(pet.id)}
            aria-current={active ? "page" : undefined}
            className={`ds-focus inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors ${
              active
                ? "border-brand-terracotta bg-brand-terracotta-soft font-semibold text-brand-terracotta-strong"
                : "bg-surface text-muted hover:border-brand-terracotta hover:text-foreground"
            }`}
          >
            {pet.name}
          </Link>
        );
      })}
    </nav>
  );
}

type SegmentControlProps = {
  items: Array<{ label: string; href: string }>;
  currentHref: string;
};

export function SegmentControl({ items, currentHref }: SegmentControlProps) {
  return (
    <nav aria-label="表示切り替え" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-warm p-1">
      {items.map((item) => {
        const active = item.href === currentHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`ds-focus inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
              active
                ? "bg-surface font-semibold text-brand-terracotta-strong shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

type ButtonProps = {
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

function buttonClass(variant: "primary" | "secondary") {
  return variant === "primary"
    ? "bg-brand-terracotta-strong text-white hover:bg-brand-terracotta"
    : "border bg-surface text-foreground hover:border-brand-terracotta hover:bg-brand-terracotta-soft";
}

export function PrimaryButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`ds-focus inline-flex min-h-11 items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-colors ${buttonClass("primary")} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`ds-focus inline-flex min-h-11 items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-colors ${buttonClass("secondary")} ${className}`} {...props}>
      {children}
    </button>
  );
}

type IconButtonProps = ButtonProps & { label: string };

export function IconButton({ children, label, className = "", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`ds-focus inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-brand-terracotta-soft hover:text-brand-terracotta-strong ${className}`}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

export type EditorialPhoto = {
  id: string;
  src: string;
  alt: string;
  href?: string;
  aspectRatio?: number;
  favorite?: boolean;
};

export function PhotoCard({ photo, className = "" }: { photo: EditorialPhoto; className?: string }) {
  const content = (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-[14px] bg-surface-warm ${className}`}
      style={{ aspectRatio: photo.aspectRatio && photo.aspectRatio > 0 ? photo.aspectRatio : 1 }}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(max-width: 640px) 50vw, 280px"
        className="object-contain transition-transform duration-300 group-hover:scale-[1.01]"
        unoptimized
      />
      {photo.favorite ? (
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-favorite" aria-label="お気に入り">
          ★
        </span>
      ) : null}
    </div>
  );

  return photo.href ? (
    <Link href={photo.href} aria-label={`${photo.alt}を開く`} className="ds-focus block min-w-0 rounded-[14px]">
      {content}
    </Link>
  ) : content;
}

export function EditorialPhotoGrid({ photos }: { photos: EditorialPhoto[] }) {
  if (photos.length === 0) return null;
  if (photos.length === 1) return <div className="grid"> <PhotoCard photo={photos[0]} className="w-full" /> </div>;
  if (photos.length === 2) {
    return (
      <div className="grid grid-cols-[1.25fr_0.75fr] items-start gap-2 sm:gap-3">
        <PhotoCard photo={photos[0]} className="w-full" />
        <PhotoCard photo={photos[1]} className="w-full" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <PhotoCard photo={photos[0]} className="col-span-2" />
      {photos.slice(1).map((photo) => <PhotoCard key={photo.id} photo={photo} />)}
    </div>
  );
}

export function MemoryDateHeader({ date, count }: { date: string; count?: number }) {
  return (
    <header className="flex items-baseline justify-between gap-3 border-b pb-2">
      <h2 className="ds-editorial">{date}</h2>
      {typeof count === "number" ? <span className="ds-caption">{count}枚の思い出</span> : null}
    </header>
  );
}

export function PhotoAddButton({ href = "/photos/new", children = "写真を追加" }: { href?: string; children?: ReactNode }) {
  return <Link href={href} className="ds-focus inline-flex min-h-11 items-center justify-center rounded-[14px] bg-brand-terracotta-strong px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-terracotta">＋ {children}</Link>;
}

export function TagChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex min-h-8 items-center rounded-full bg-brand-terracotta-soft px-3 text-xs text-brand-terracotta-strong">{children}</span>;
}

export function SearchChip({ children, href, onClick, pressed = false, disabled = false }: {
  children: ReactNode; href?: string; onClick?: () => void; pressed?: boolean; disabled?: boolean;
}) {
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={pressed} disabled={disabled}
    className={`ds-focus inline-flex min-h-11 max-w-full items-center gap-1.5 break-words rounded-full border px-3 py-2 text-sm transition-colors disabled:cursor-default ${pressed
      ? "border-brand-terracotta/60 bg-brand-terracotta-soft font-medium text-brand-terracotta-strong"
      : "border-border bg-surface text-foreground hover:border-brand-terracotta/60"}`}>
    {pressed ? <span aria-hidden="true">✓</span> : null}{children}
  </button>;
  const chip = <span className="inline-flex min-h-8 items-center rounded-full border bg-surface px-3 text-xs text-muted">{children}</span>;
  return href ? <Link href={href} className="ds-focus inline-flex rounded-full">{chip}</Link> : chip;
}

export function FavoriteButton({ favorite, onClick, disabled = false }: { favorite: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "お気に入りから外す" : "お気に入りに追加"}
      onClick={onClick}
      disabled={disabled}
      className={`ds-focus inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${favorite ? "border-favorite/40 bg-favorite-soft text-favorite" : "bg-surface text-muted hover:border-favorite/40 hover:text-favorite"}`}
    >
      <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
      <span>{favorite ? "お気に入り済み" : "お気に入り"}</span>
    </button>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <section className="rounded-[20px] border border-dashed bg-surface/70 px-6 py-10 text-center" aria-live="polite">
      <h2 className="ds-heading text-lg">{title}</h2>
      {description ? <p className="ds-caption mt-2">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}

export function LoadingState({ label = "読み込み中..." }: { label?: string }) {
  return <div className="rounded-[20px] border bg-surface/70 px-6 py-10 text-center text-sm text-muted" aria-busy="true">{label}</div>;
}

export function AIProcessingStatus({ status }: { status: "pending" | "processing" | "completed" | "failed" }) {
  const labels = { pending: "解析待ち", processing: "AI解析中...", completed: "解析済み", failed: "解析に失敗しました" };
  return <p className={`ds-caption ${status === "failed" ? "text-danger" : status === "completed" ? "text-success" : ""}`} role="status">{labels[status]}</p>;
}
