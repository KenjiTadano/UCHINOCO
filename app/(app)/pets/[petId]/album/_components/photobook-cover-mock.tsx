import Image from "next/image";

type Size = "sm" | "md" | "lg" | "hero";

const SIZE_CLASS: Record<Size, string> = {
  sm: "w-14",
  md: "w-24",
  lg: "w-36 sm:w-44",
  hero: "w-44 sm:w-56 lg:w-64",
};

type Props = {
  src?: string | null;
  alt: string;
  size?: Size;
  hardCover?: boolean;
  className?: string;
  priority?: boolean;
};

/**
 * Physical photobook cover mock — PHOTO FIRST visual for order flow screens.
 */
export function PhotobookCoverMock({
  src,
  alt,
  size = "md",
  hardCover = true,
  className = "",
  priority = false,
}: Props) {
  return (
    <div
      className={`relative aspect-[3/4] shrink-0 overflow-hidden bg-surface-warm ${SIZE_CLASS[size]} ${
        hardCover
          ? "shadow-[2px_4px_12px_0_rgba(63,48,43,0.14)]"
          : "shadow-[1px_2px_6px_0_rgba(63,48,43,0.08)]"
      } ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={size === "hero" ? "(max-width: 640px) 176px, 256px" : "112px"}
          className="object-cover"
          unoptimized
          priority={priority}
        />
      ) : (
        <div className="size-full bg-surface-warm" aria-hidden="true" />
      )}
      {/* Spine */}
      <div
        className={`absolute inset-y-0 left-0 ${
          hardCover ? "w-2.5 bg-black/[0.16]" : "w-1.5 bg-black/[0.08]"
        }`}
        aria-hidden="true"
      />
      {hardCover ? (
        <div className="absolute inset-0 bg-black/[0.04]" aria-hidden="true" />
      ) : null}
    </div>
  );
}
