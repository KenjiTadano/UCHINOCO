"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type NavigationItem = {
  label: string;
  href: string;
  active: (pathname: string) => boolean;
  icon: "home" | "memories" | "search" | "album";
};

function NavigationIcon({ icon }: { icon: NavigationItem["icon"] }) {
  if (icon === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m3 11 9-8 9 8" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" />
      </svg>
    );
  }
  if (icon === "memories") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m5.5 17 4.5-4 3.5 3 2.5-2 2.5 2.5" />
      </svg>
    );
  }
  if (icon === "search") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="14" height="16" rx="2" />
      <path d="M8 7h6M8 11h6M8 15h4M18 7h2v14a1 1 0 0 1-1 1H7" />
    </svg>
  );
}

function NavigationLink({
  item,
  pathname,
}: {
  item: NavigationItem;
  pathname: string;
}) {
  const isActive = item.active(pathname);
  return (
    <li className="flex min-w-0">
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`m-0.5 flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:text-xs ${
          isActive
            ? "bg-primary-soft font-semibold text-primary"
            : "text-muted hover:bg-primary-soft/60 hover:text-foreground"
        }`}
      >
        <NavigationIcon icon={item.icon} />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAddingPhoto, startPhotoNavigation] = useTransition();
  const items: NavigationItem[] = [
    {
      label: "ホーム",
      href: "/home",
      active: (current) =>
        current === "/home" ||
        current === "/pets/new" ||
        /^\/pets\/[^/]+\/edit$/.test(current),
      icon: "home",
    },
    {
      label: "思い出",
      href: "/memories",
      active: (current) =>
        current === "/memories" ||
        /^\/pets\/[^/]+$/.test(current) ||
        /^\/pets\/[^/]+\/photos\/(?!new$)[^/]+$/.test(current),
      icon: "memories",
    },
    {
      label: "探す",
      href: "/search",
      active: (current) =>
        current === "/search" || /^\/pets\/[^/]+\/search$/.test(current),
      icon: "search",
    },
    {
      label: "アルバム",
      href: "/album",
      active: (current) =>
        current === "/album" ||
        /^\/pets\/[^/]+\/(album|favorites)$/.test(current),
      icon: "album",
    },
  ];
  const isPhotoFlow =
    pathname === "/photos/new" || /^\/pets\/[^/]+\/photos\/new$/.test(pathname);

  const startAddingPhoto = () => {
    if (isAddingPhoto || isPhotoFlow) return;
    const returnTo = pathname.startsWith("/") ? pathname : "/home";
    startPhotoNavigation(() => {
      router.push(`/photos/new?returnTo=${encodeURIComponent(returnTo)}`);
    });
  };

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-[color:var(--background)]/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-[4.5rem] w-full max-w-xl grid-cols-5 px-1">
        <NavigationLink item={items[0]} pathname={pathname} />
        <NavigationLink item={items[1]} pathname={pathname} />
        <li className="relative flex min-w-0 justify-center">
          <button
            type="button"
            onClick={startAddingPhoto}
            disabled={isAddingPhoto || isPhotoFlow}
            aria-label={
              isAddingPhoto
                ? "写真追加画面を開いています"
                : isPhotoFlow
                  ? "写真追加画面を表示中"
                  : "写真を追加"
            }
            className="group absolute -top-5 flex min-h-16 w-full min-w-0 flex-col items-center justify-start gap-1 rounded-xl pt-0 text-[10px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-xs"
          >
            <span className="flex size-14 items-center justify-center rounded-full border-4 border-[var(--background)] bg-primary text-3xl font-light leading-none text-primary-foreground transition-colors group-hover:bg-[var(--primary-hover)]" aria-hidden="true">
              +
            </span>
            <span className="whitespace-nowrap">写真を追加</span>
          </button>
        </li>
        <NavigationLink item={items[2]} pathname={pathname} />
        <NavigationLink item={items[3]} pathname={pathname} />
      </ul>
    </nav>
  );
}
