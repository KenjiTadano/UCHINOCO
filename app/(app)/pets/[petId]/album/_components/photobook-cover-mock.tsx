import Image from "next/image";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  xs: "h-[72px] w-[54px]",
  sm: "h-[88px] w-[66px]",
  md: "h-[120px] w-[90px]",
  lg: "h-[168px] w-[126px]",
};

type Props = {
  src?: string | null;
  alt: string;
  size?: Size;
  className?: string;
  priority?: boolean;
};

/** Vertical photobook cover with spine — PDF 縦長本モック */
export function PhotobookCoverMock({
  src,
  alt,
  size = "md",
  className = "",
  priority = false,
}: Props) {
  return (
    <div className={`of-book shrink-0 ${SIZE[size]} ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="126px"
          className="object-cover"
          unoptimized
          priority={priority}
        />
      ) : (
        <div className="size-full bg-[#efe6e0]" aria-hidden="true" />
      )}
    </div>
  );
}
