export const PRODUCT_ANALYTICS_EVENT_TYPES = [
  "upgrade_viewed",
  "upgrade_started",
  "subscription_activated",
  "subscription_canceled",
  "payment_success",
  "print_order_created",
  "search_opened",
  "search_result_opened",
  "search_empty",
  "family_invite_sent",
  "family_invite_accepted",
  "family_photo_added",
  "family_activity_viewed",
] as const;

export type ProductAnalyticsEventType = (typeof PRODUCT_ANALYTICS_EVENT_TYPES)[number];
export type AnalyticsRange = "7d" | "30d" | "all";

export const ANALYTICS_MINIMUM_SAMPLE = 10;

export const FORBIDDEN_ANALYTICS_KEYS = [
  "email", "pet_name", "member_name", "caption", "query", "search_query",
  "signed_url", "storage_path", "payment_method", "shipping_address",
  "invite_token", "provider_credentials", "photo_id",
] as const;

export type ProductionKpiRaw = {
  active_users: number;
  free_active_users: number;
  plus_active_users: number;
  album_generated: number;
  album_viewed: number;
  album_accepted: number;
  direct_accepted: number;
  average_edit_distance: number | null;
  layout_kept: number;
  layout_total: number;
  crop_kept: number;
  crop_total: number;
  photo_swap_accepted: number;
  text_edited_accepted: number;
  decoration_applied_accepted: number;
  print_preview: number;
  checkout_started: number;
  payment_success: number;
  print_order_created: number;
  fulfillment_ready: number;
  upgrade_viewed: number;
  upgrade_started: number;
  subscription_activated: number;
  subscription_canceled: number;
  search_opened: number;
  search_result_opened: number;
  search_empty: number;
  family_invite_sent: number;
  family_invite_accepted: number;
  family_photo_added: number;
  family_activity_viewed: number;
};

export type KpiMetric = {
  value: number | null;
  numerator: number;
  denominator: number;
  sample: number;
  sufficient: boolean;
};

const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export function analyticsRangeStart(range: AnalyticsRange, now = new Date()): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function parseAnalyticsRange(value: string | undefined): AnalyticsRange {
  return value === "7d" || value === "30d" ? value : "all";
}

function rate(numerator: number, denominator: number, sample = denominator): KpiMetric {
  return {
    value: denominator > 0 ? numerator / denominator : null,
    numerator,
    denominator,
    sample,
    sufficient: sample >= ANALYTICS_MINIMUM_SAMPLE,
  };
}

export function hasForbiddenAnalyticsPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenAnalyticsPayload);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    (FORBIDDEN_ANALYTICS_KEYS as readonly string[]).includes(key.toLowerCase()) || hasForbiddenAnalyticsPayload(child),
  );
}

export function buildProductionKpis(input: Partial<ProductionKpiRaw>) {
  const raw = Object.fromEntries(
    Object.keys(PRODUCTION_KPI_ZERO).map((key) => [key, count(input[key as keyof ProductionKpiRaw])]),
  ) as unknown as ProductionKpiRaw;
  return {
    raw,
    album: {
      directAccept: rate(raw.direct_accepted, raw.album_generated),
      completionViewed: rate(raw.album_viewed, raw.album_generated),
      completionAccepted: rate(raw.album_accepted, raw.album_generated),
      averageEditDistance: {
        value: typeof input.average_edit_distance === "number" && Number.isFinite(input.average_edit_distance) ? input.average_edit_distance : null,
        sample: raw.album_accepted,
        sufficient: raw.album_accepted >= ANALYTICS_MINIMUM_SAMPLE,
      },
      layoutKeep: rate(raw.layout_kept, raw.layout_total, raw.album_accepted),
      cropKeep: rate(raw.crop_kept, raw.crop_total, raw.album_accepted),
      swapRate: rate(raw.photo_swap_accepted, raw.album_accepted),
      textEditRate: rate(raw.text_edited_accepted, raw.album_accepted),
      decorationApplyRate: rate(raw.decoration_applied_accepted, raw.album_accepted),
    },
    print: {
      preview: rate(raw.print_preview, raw.album_accepted),
      checkout: rate(raw.checkout_started, raw.print_preview),
      payment: rate(raw.payment_success, raw.checkout_started),
      orderCreated: rate(raw.print_order_created, raw.payment_success),
      fulfillmentReadiness: rate(raw.fulfillment_ready, raw.print_order_created),
    },
    monetization: {
      plusShare: rate(raw.plus_active_users, raw.active_users),
      upgradeStart: rate(raw.upgrade_started, raw.upgrade_viewed),
      activation: rate(raw.subscription_activated, raw.upgrade_started),
    },
    search: {
      resultOpen: rate(raw.search_result_opened, raw.search_opened),
      empty: rate(raw.search_empty, raw.search_opened),
    },
    family: {
      inviteAccept: rate(raw.family_invite_accepted, raw.family_invite_sent),
      photoAdded: raw.family_photo_added,
      activityViewed: raw.family_activity_viewed,
    },
  };
}

export const PRODUCTION_KPI_ZERO: ProductionKpiRaw = {
  active_users: 0, free_active_users: 0, plus_active_users: 0,
  album_generated: 0, album_viewed: 0, album_accepted: 0, direct_accepted: 0,
  average_edit_distance: 0, layout_kept: 0, layout_total: 0, crop_kept: 0,
  crop_total: 0, photo_swap_accepted: 0, text_edited_accepted: 0,
  decoration_applied_accepted: 0, print_preview: 0, checkout_started: 0,
  payment_success: 0, print_order_created: 0, fulfillment_ready: 0,
  upgrade_viewed: 0, upgrade_started: 0, subscription_activated: 0,
  subscription_canceled: 0, search_opened: 0, search_result_opened: 0,
  search_empty: 0, family_invite_sent: 0, family_invite_accepted: 0,
  family_photo_added: 0, family_activity_viewed: 0,
};
