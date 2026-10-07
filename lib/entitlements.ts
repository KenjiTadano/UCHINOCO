export const USER_PLANS = ["FREE", "PLUS"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const STRIPE_SUBSCRIPTION_STATUSES = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;
export type SubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

export type UserEntitlements = {
  plan: UserPlan;
  canPrint: true;
  canAddPhotos: true;
  canUsePhotoIntelligence: true;
  canUseNow: true;
  canCreateAlbum: true;
  canEditAlbum: true;
  canUseBasicSearch: true;
  canUseFamilySharing: boolean;
  canUseMultiplePets: boolean;
  canUseAnnualMemory: boolean;
  canUseLongTermSearch: boolean;
  canUseAdvancedSearch: boolean;
  canUseOnThisDayHistory: boolean;
  canRegenerateAlbum: boolean;
  hasLongTermAlbumPreservation: boolean;
  isAdFree: boolean;
};

export type AdSurface =
  | "home"
  | "album-list"
  | "search-list"
  | "viewer"
  | "editor"
  | "anniversary"
  | "print-preview"
  | "checkout"
  | "order"
  | "memorial";

const AD_ELIGIBLE_SURFACES = new Set<AdSurface>([
  "home",
  "album-list",
  "search-list",
]);

export function isPlusSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function planFromSubscriptionStatus(status: string | null | undefined): UserPlan {
  return isPlusSubscriptionStatus(status) ? "PLUS" : "FREE";
}

export function resolvePlan(input: {
  subscriptionStatus?: string | null;
  devOverride?: string | null;
  nodeEnv?: string | null;
}): UserPlan {
  const override = input.devOverride?.trim().toUpperCase();
  if (input.nodeEnv !== "production" && (override === "FREE" || override === "PLUS")) {
    return override;
  }
  return planFromSubscriptionStatus(input.subscriptionStatus);
}

export function getUserEntitlements(plan: UserPlan): UserEntitlements {
  const plus = plan === "PLUS";
  return {
    plan,
    canPrint: true,
    canAddPhotos: true,
    canUsePhotoIntelligence: true,
    canUseNow: true,
    canCreateAlbum: true,
    canEditAlbum: true,
    canUseBasicSearch: true,
    canUseFamilySharing: plus,
    canUseMultiplePets: plus,
    canUseAnnualMemory: plus,
    canUseLongTermSearch: plus,
    canUseAdvancedSearch: plus,
    canUseOnThisDayHistory: plus,
    canRegenerateAlbum: plus,
    hasLongTermAlbumPreservation: plus,
    isAdFree: plus,
  };
}

export function canShowAds(surface: AdSurface, entitlements: UserEntitlements): boolean {
  return !entitlements.isAdFree && AD_ELIGIBLE_SURFACES.has(surface);
}

export function isAdvancedSearchSelection(value: {
  from?: string;
  to?: string;
  year?: string;
  month?: string;
  season?: string;
  best?: boolean;
  anniversary?: string;
  story?: string;
}): boolean {
  return Boolean(
    value.from ||
      value.to ||
      value.year ||
      value.month ||
      value.season ||
      value.best ||
      value.anniversary ||
      value.story,
  );
}

export function freeSearchSelection<T extends {
  from: string;
  to: string;
  year: string;
  month: string;
  season: string;
  best: boolean;
  anniversary: string;
  story: string;
}>(value: T): T {
  return {
    ...value,
    from: "",
    to: "",
    year: "",
    month: "",
    season: "",
    best: false,
    anniversary: "",
    story: "",
  };
}
