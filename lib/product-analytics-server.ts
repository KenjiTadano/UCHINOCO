import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasForbiddenAnalyticsPayload,
  type ProductAnalyticsEventType,
} from "./product-analytics";

type EventData = Record<string, boolean | number | string | null>;

export async function analyticsEventKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function recordProductAnalyticsEvent(input: {
  supabase: SupabaseClient;
  userId: string;
  eventType: ProductAnalyticsEventType;
  eventKey?: string | null;
  eventData?: EventData;
  source?: "server" | "webhook";
}) {
  const eventData = input.eventData ?? {};
  if (hasForbiddenAnalyticsPayload(eventData)) return false;
  try {
    const { error } = await (input.supabase as SupabaseClient)
      .from("product_analytics_events")
      .insert({
        user_id: input.userId,
        event_type: input.eventType,
        event_key: input.eventKey ?? null,
        event_data: eventData,
        event_source: input.source ?? "server",
      });
    if (error && error.code !== "23505" && process.env.NODE_ENV !== "production") {
      console.info("Product analytics event failed", { eventType: input.eventType, code: error.code });
    }
    return !error || error.code === "23505";
  } catch {
    return false;
  }
}
