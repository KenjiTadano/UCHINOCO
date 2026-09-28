"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { shellViewParam } from "@/lib/app-shell-view";
import { BottomNavigation } from "./bottom-navigation";
import { LegalNavigation } from "../../_components/legal-navigation";

/** Order-flow routes: product / checkout / order — no Bottom Nav (PDF準拠) */
export function isOrderFlowPath(pathname: string): boolean {
  return /\/album\/[^/]+\/(product|checkout|order)(?:\/|$)/.test(pathname);
}

/** Album create / generating (06.x) — phone column, no Bottom Nav */
export function isAlbumCreatePath(pathname: string): boolean {
  return /\/pets\/[^/]+\/album\/new\/?$/.test(pathname);
}

/** 07.1 album edit / 07.2 page edit / 07.3 cover edit — no Bottom Nav */
export function isAlbumEditPath(pathname: string): boolean {
  return (
    /\/pets\/[^/]+\/album\/[^/]+\/edit\/?$/.test(pathname) ||
    /\/pets\/[^/]+\/album\/[^/]+\/pages\/edit\/?$/.test(pathname) ||
    /\/pets\/[^/]+\/album\/[^/]+\/cover\/edit\/?$/.test(pathname)
  );
}

/** 06.2 AI complete celebration — phone column, no Bottom Nav */
export function isAlbumCompletePath(pathname: string, view: string | null): boolean {
  if (!/^\/pets\/[^/]+\/album\/[^/]+\/?$/.test(pathname)) return false;
  return view === "complete" || view === "preview-complete";
}

/** Task048 Smart Crop lab (/dev/*) — no Bottom Nav */
export function isDevLabPath(pathname: string): boolean {
  return pathname === "/dev" || pathname.startsWith("/dev/");
}

/** 06.3 album preview — phone column, no Bottom Nav */
export function isAlbumPreviewPath(pathname: string, view: string | null): boolean {
  if (!/^\/pets\/[^/]+\/album\/[^/]+\/?$/.test(pathname)) return false;
  return view === "preview";
}

export function AppShell({
  children,
  analysis,
}: {
  children: React.ReactNode;
  analysis: React.ReactNode;
}) {
  // useSearchParams can suspend. The fallback still renders the page, so the
  // order header is in the server HTML instead of a blank shell.
  return (
    <Suspense fallback={<AppShellFrame analysis={analysis} viewParam={null}>{children}</AppShellFrame>}>
      <AppShellWithSearch analysis={analysis}>{children}</AppShellWithSearch>
    </Suspense>
  );
}

function AppShellWithSearch({
  children,
  analysis,
}: {
  children: React.ReactNode;
  analysis: React.ReactNode;
}) {
  const viewParam = shellViewParam(useSearchParams());
  return (
    <AppShellFrame analysis={analysis} viewParam={viewParam}>
      {children}
    </AppShellFrame>
  );
}

function AppShellFrame({
  children,
  analysis,
  viewParam,
}: {
  children: React.ReactNode;
  analysis: React.ReactNode;
  viewParam: "complete" | "preview" | null;
}) {
  const pathname = usePathname();
  const orderFlow = isOrderFlowPath(pathname);
  const albumCreate = isAlbumCreatePath(pathname);
  const albumEdit = isAlbumEditPath(pathname);
  const albumComplete = isAlbumCompletePath(pathname, viewParam);
  const albumPreview = isAlbumPreviewPath(pathname, viewParam);
  const devLab = isDevLabPath(pathname);
  const hideBottomNav =
    orderFlow ||
    albumCreate ||
    albumEdit ||
    albumComplete ||
    albumPreview ||
    devLab;
  const isHome = pathname === "/home";
  const isMemoriesTimeline = /^\/pets\/[^/]+$/.test(pathname);
  const isAddPhoto =
    pathname === "/photos/new" ||
    /^\/pets\/[^/]+\/photos\/new$/.test(pathname);
  const isSearch =
    pathname === "/search" || /^\/pets\/[^/]+\/search$/.test(pathname);
  const isAlbumTop =
    pathname === "/album" || /^\/pets\/[^/]+\/album$/.test(pathname);
  const usesPhoneColumnChrome =
    isMemoriesTimeline ||
    isAddPhoto ||
    isSearch ||
    isAlbumTop ||
    albumCreate ||
    albumEdit ||
    albumComplete ||
    albumPreview;

  return (
    <>
      <div
        className={
          hideBottomNav || usesPhoneColumnChrome
            ? undefined
            : "pb-[calc(6rem+env(safe-area-inset-bottom))]"
        }
      >
        {analysis}
        {children}
        {!hideBottomNav && !isHome && !usesPhoneColumnChrome ? (
          <LegalNavigation />
        ) : null}
      </div>
      {!hideBottomNav ? <BottomNavigation /> : null}
    </>
  );
}
