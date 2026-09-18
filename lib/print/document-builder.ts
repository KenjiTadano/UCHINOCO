/**
 * Builds a PrintDocumentSpec from an order snapshot.
 * No "server-only" — pure builder, fully testable.
 *
 * IMPORTANT: only order_photos is used as image source.
 * album_photos is never consulted — the order snapshot is the sole truth.
 */

import type {
  PrintDocumentSpec,
  PrintPage,
  PrintPageItem,
  PrintCover,
} from "./document-types.ts";

export type OrderPhotoEntry = {
  photoId: string | null;
  position: number;
  original_path: string;
};

export type OrderSnapshotInput = {
  orderId: string;
  album_title_snapshot: string | null;
  cover_original_path_snapshot: string | null;
  /** From orders.pages */
  pages: number;
  productId: string;
  printWidthMm: number;
  printHeightMm: number;
  bleedMm: number;
  /** Must be ORDER BY position ASC — sourced from order_photos only */
  orderPhotos: OrderPhotoEntry[];
};

/**
 * Builds a PrintDocumentSpec from a paid order snapshot.
 * v1 layout: 1 photo per page, blank pages fill any remainder.
 * Throws if orderPhotos.length > pages (defense-in-depth).
 */
export function buildPrintDocument(input: OrderSnapshotInput): PrintDocumentSpec {
  if (input.orderPhotos.length > input.pages) {
    throw new Error(
      `Photo count (${input.orderPhotos.length}) exceeds page count (${input.pages})`,
    );
  }

  const pages: PrintPage[] = [];
  for (let i = 0; i < input.pages; i++) {
    const photo = input.orderPhotos[i] ?? null;
    const item: PrintPageItem | null = photo
      ? {
          photoId: photo.photoId,
          imagePath: photo.original_path,
          sourceWidthPx: null,   // resolved from image bytes at generation time
          sourceHeightPx: null,
          fit: "contain",
        }
      : null;
    pages.push({ pageNumber: i + 1, item });
  }

  const cover: PrintCover = {
    imagePath: input.cover_original_path_snapshot,
    titleText: input.album_title_snapshot,
    fit: "cover",
  };

  return {
    orderId: input.orderId,
    title: input.album_title_snapshot,
    productId: input.productId,
    printWidthMm: input.printWidthMm,
    printHeightMm: input.printHeightMm,
    bleedMm: input.bleedMm,
    cover,
    pages,
    totalPageCount: input.pages,
  };
}
