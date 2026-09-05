"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItem = {
  label: string;
  href: string;
  active: (pathname: string) => boolean;
  icon: "home" | "photo" | "search";
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
  if (icon === "photo") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m5.5 16 4.5-4 3.5 3 2.5-2 2.5 2.5M12 2v6M9 5h6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function BottomNavigation() {
  const pathname = usePathname();
  const items: NavigationItem[] = [
    {
      label: "ホーム",
      href: "/home",
      active: (current) => current === "/home",
      icon: "home",
    },
    {
      label: "写真追加",
      href: "/photos/new",
      active: (current) =>
        current === "/photos/new" ||
        /^\/pets\/[^/]+\/photos\/new$/.test(current),
      icon: "photo",
    },
    {
      label: "検索",
      href: "/search",
      active: (current) =>
        current === "/search" || /^\/pets\/[^/]+\/search$/.test(current),
      icon: "search",
    },
  ];

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-surface/95 shadow-[0_-6px_24px_rgba(107,76,62,0.08)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 w-full max-w-xl grid-cols-3 px-2">
        {items.map((item) => {
          const isActive = item.active(pathname);
          return (
            <li key={item.label} className="flex">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`m-1 flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
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
        })}
      </ul>
    </nav>
  );
}
