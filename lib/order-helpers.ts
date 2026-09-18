/**
 * Pure helpers for order history UI.
 * No DB or Next.js imports — fully testable.
 */

/** Short UI-friendly order label based on status. */
export function getOrderStatusLabel(status: string): string {
  switch (status) {
    case "paid":      return "ご注文確定";
    case "pending":   return "お支払い確認中";
    case "failed":    return "お支払い未完了";
    case "cancelled": return "キャンセル";
    default:          return "確認中";
  }
}

/** Returns #XXXXXXXX (last 8 chars of UUID, uppercase). */
export function getShortOrderId(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}

/** Formats an ISO timestamp as YYYY.MM.DD in Asia/Tokyo. */
export function formatOrderDate(isoString: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}.${m}.${day}`;
}

/** True when the order status has an order_photos snapshot to display. */
export function hasOrderPhotoPreview(status: string): boolean {
  return status === "paid";
}

/**
 * Returns the bucket name and path to use for a single order_photos entry.
 * Prefers thumbnail to avoid loading full originals for list/grid views.
 */
export function getOrderPhotoDisplayPath(photo: {
  thumbnail_path: string | null;
  original_path: string;
}): { path: string; bucket: "pet-photo-thumbnails" | "pet-photos" } {
  if (photo.thumbnail_path) {
    return { path: photo.thumbnail_path, bucket: "pet-photo-thumbnails" };
  }
  return { path: photo.original_path, bucket: "pet-photos" };
}

/** Returns the preferred display title for an order (snapshot first). */
export function getOrderDisplayTitle(
  snapshotTitle: string | null | undefined,
  fallback: string | null | undefined,
): string {
  return snapshotTitle?.trim() || fallback?.trim() || "（タイトル未設定）";
}
