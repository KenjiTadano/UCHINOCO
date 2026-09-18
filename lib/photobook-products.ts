/**
 * Photobook product catalog — mock / local config for Task045.
 * Move to DB / API in a future task; keep this shape as the contract.
 *
 * IMPORTANT: calcPrice is display-only.
 * Server must re-calculate price at order confirmation — never trust the UI value.
 */

export type PhotobookProduct = {
  id: string;
  name: string;
  tagline: string;
  size: string;
  coverType: "soft" | "hard";
  coverTypeLabel: string;
  basePages: number;
  maxPages: number;
  basePrice: number;
  /** Price increment per PAGE_STEP extra pages */
  extraPagePrice: number;
  /** Print dimensions in mm (trimmed size, excluding bleed) */
  printWidthMm: number;
  printHeightMm: number;
  /** Bleed in mm — 0 until confirmed via Provider Sandbox specs */
  bleedMm: number;
};

/** Pages increment between selectable options */
export const PAGE_STEP = 10;

export const PHOTOBOOK_PRODUCTS: PhotobookProduct[] = [
  {
    id: "standard",
    name: "スタンダード",
    tagline: "日常の思い出を、気軽に残す一冊",
    size: "180 × 180mm",
    coverType: "soft",
    coverTypeLabel: "ソフトカバー",
    basePages: 20,
    maxPages: 40,
    basePrice: 2980,
    extraPagePrice: 800,
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
  },
  {
    id: "premium",
    name: "プレミアム",
    tagline: "大切な思い出を、丁寧に残す一冊",
    size: "210 × 210mm",
    coverType: "hard",
    coverTypeLabel: "ハードカバー",
    basePages: 30,
    maxPages: 60,
    basePrice: 4980,
    extraPagePrice: 1000,
    printWidthMm: 210,
    printHeightMm: 210,
    bleedMm: 0,
  },
  {
    id: "premium-plus",
    name: "プレミアムプラス",
    tagline: "思い出のすべてを、贅沢に残す一冊",
    size: "210 × 210mm",
    coverType: "hard",
    coverTypeLabel: "ハードカバー",
    basePages: 40,
    maxPages: 80,
    basePrice: 6980,
    extraPagePrice: 1200,
    printWidthMm: 210,
    printHeightMm: 210,
    bleedMm: 0,
  },
];

/**
 * Display-only price calculation (client-safe).
 * Server must re-verify at checkout — do not use as billing source of truth.
 */
export function calcPrice(product: PhotobookProduct, pages: number): number {
  const extraSteps = Math.max(0, Math.floor((pages - product.basePages) / PAGE_STEP));
  return product.basePrice + extraSteps * product.extraPagePrice;
}

/** Selectable page counts from basePages to maxPages in PAGE_STEP increments */
export function getPageOptions(product: PhotobookProduct): number[] {
  const opts: number[] = [];
  for (let p = product.basePages; p <= product.maxPages; p += PAGE_STEP) {
    opts.push(p);
  }
  return opts;
}

export function formatPrice(yen: number): string {
  return `¥${yen.toLocaleString("ja-JP")}`;
}
