import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AlbumAnalyticsEventType =
  | "album_generated" | "album_viewed" | "album_accepted" | "album_edit_started"
  | "album_layout_changed" | "album_crop_changed" | "album_photo_swapped"
  | "album_text_changed" | "album_decoration_changed" | "album_background_changed"
  | "album_regenerated" | "print_preview_opened" | "checkout_started"
  | "decoration_recommendation_shown" | "decoration_previewed" | "decoration_applied"
  | "decoration_rejected" | "decoration_reset"
  | "new_photos_suggested" | "new_photos_reviewed" | "new_photos_added" | "new_photos_dismissed"
  | "new_photo_placement_previewed" | "new_photo_placement_applied"
  | "new_photo_placement_alternative" | "new_photo_placement_skipped";

export async function recordAlbumAnalyticsEvent(input: {
  supabase: SupabaseClient;
  userId: string;
  albumId: string;
  draftVersionId?: string | null;
  eventType: AlbumAnalyticsEventType;
  eventKey?: string | null;
  eventData?: Record<string, boolean | number | string | null | Record<string, number>>;
}) {
  try {
    const client = input.supabase as SupabaseClient;
    const result = await client.from("album_analytics_events").insert({
      user_id: input.userId,
      album_id: input.albumId,
      draft_version_id: input.draftVersionId ?? null,
      event_type: input.eventType,
      event_key: input.eventKey ?? null,
      event_data: input.eventData ?? {},
    });
    if (result.error && result.error.code !== "23505" && process.env.NODE_ENV !== "production") {
      console.info("Album analytics event", { eventType: input.eventType, albumId: input.albumId, draftVersionId: input.draftVersionId ?? null, result: "failed", code: result.error.code });
    }
    return !result.error || result.error.code === "23505";
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.info("Album analytics event", { eventType: input.eventType, albumId: input.albumId, draftVersionId: input.draftVersionId ?? null, result: "failed" });
    }
    return false;
  }
}
