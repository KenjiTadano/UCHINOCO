"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { BookOpen, House, Images, Plus, Search } from "lucide-react";

type NavigationItem = {
  label: string;
  href: string;
  active: (pathname: string) => boolean;
  icon: "home" | "memories" | "search" | "album";
};

const ICON_PROPS = {
  size: 18,
  strokeWidth: 1.7,
  "aria-hidden": true as const,
};

function NavigationIcon({ icon }: { icon: NavigationItem["icon"] }) {
  if (icon === "home") return <House {...ICON_PROPS} />;
  if (icon === "memories") return <Images {...ICON_PROPS} />;
  if (icon === "search") return <Search {...ICON_PROPS} />;
  return <BookOpen {...ICON_PROPS} />;
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
        className={`ds-focus flex min-h-[49px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[9px] leading-tight transition-colors ${
          isActive
            ? "font-semibold text-brand-terracotta"
            : "text-muted hover:text-foreground"
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
        /^\/pets\/[^/]+\/photos\/(?!new$)[^/]+$/.test(current) ||
        /^\/pets\/[^/]+\/favorites(?:\/|$)/.test(current),
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
        /^\/pets\/[^/]+\/album(?:\/|$)/.test(current),
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
    <nav aria-label="メインナビゲーション" className="home-bottom-nav">
      <ul className="home-bottom-nav-inner">
        <NavigationLink item={items[0]} pathname={pathname} />
        <NavigationLink item={items[1]} pathname={pathname} />
        <li className="home-fab-slot">
          <button
            type="button"
            onClick={startAddingPhoto}
            disabled={isAddingPhoto || isPhotoFlow}
            aria-current={isPhotoFlow ? "page" : undefined}
            aria-label={
              isAddingPhoto
                ? "写真追加画面を開いています"
                : isPhotoFlow
                  ? "写真追加画面を表示中"
                  : "写真を追加"
            }
            className={`home-fab ds-focus disabled:opacity-60 ${isPhotoFlow ? "is-active" : ""}`}
          >
            <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {isPhotoFlow ? (
            <span className="home-fab-label" aria-hidden="true">
              写真を追加
            </span>
          ) : null}
        </li>
        <NavigationLink item={items[2]} pathname={pathname} />
        <NavigationLink item={items[3]} pathname={pathname} />
      </ul>
    </nav>
  );
}
