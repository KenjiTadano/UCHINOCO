export const ALBUM_PAGE_COUNTS = [24, 48, 72] as const;
export type AlbumPageCount = (typeof ALBUM_PAGE_COUNTS)[number];

export const ALBUM_CAPACITIES = {
  24: { pageCount: 24, requiredEligible: 12, recommendedEligibleRange: { min: 12, max: 23 }, description: "コンパクトに残す" },
  48: { pageCount: 48, requiredEligible: 24, recommendedEligibleRange: { min: 36, max: 59 }, description: "思い出をしっかり残す" },
  72: { pageCount: 72, requiredEligible: 36, recommendedEligibleRange: { min: 60, max: null }, description: "たっぷり残す" },
} as const satisfies Record<AlbumPageCount, { pageCount: AlbumPageCount; requiredEligible: number; recommendedEligibleRange: { min: number; max: number | null }; description: string }>;

export function requiredEligiblePhotos(pageCount: AlbumPageCount) {
  return ALBUM_CAPACITIES[pageCount].requiredEligible;
}

export function albumCapacityState(eligible: number, required: number, pending: number): "ready" | "preparing" | "shortage" {
  return eligible >= required ? "ready" : pending > 0 ? "preparing" : "shortage";
}

export function recommendAlbumPageCount(eligible: number): AlbumPageCount | null {
  return [...ALBUM_PAGE_COUNTS].reverse().find((pageCount) => {
    const range = ALBUM_CAPACITIES[pageCount].recommendedEligibleRange;
    return eligible >= range.min && (range.max === null || eligible <= range.max);
  }) ?? null;
}

export function initialAlbumPageCount(current: AlbumPageCount, recommended: AlbumPageCount | null, manuallySelected: boolean) {
  return manuallySelected || recommended === null ? current : recommended;
}

export function albumCapacities(eligible: number) {
  const recommended = recommendAlbumPageCount(eligible);
  return ALBUM_PAGE_COUNTS.map((pageCount) => {
    const requiredEligible = requiredEligiblePhotos(pageCount);
    return {
      pageCount,
      requiredEligible,
      available: eligible >= requiredEligible,
      shortage: Math.max(0, requiredEligible - eligible),
      recommended: pageCount === recommended,
    };
  });
}