"use server";

import { redirect } from "next/navigation";
import { analyticsAcceptData, calculateAlbumEditMetrics } from "@/lib/album-analytics";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";
import { readDraft } from "@/lib/album-persistence/read-draft";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function acceptAlbumDraft(petId: string, albumId: string) {
  if (!UUID.test(petId) || !UUID.test(albumId)) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!album) return;
  const view = await readDraft(supabase, albumId);
  if (view) {
    const { data: generated } = await (supabase as never as import("@supabase/supabase-js").SupabaseClient)
      .from("album_analytics_events")
      .select("created_at")
      .eq("album_id", albumId)
      .eq("draft_version_id", view.versionId)
      .eq("event_type", "album_generated")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const generatedAt = generated?.created_at ? new Date(generated.created_at).getTime() : NaN;
    const seconds = Number.isFinite(generatedAt) ? Math.max(0, Math.round((Date.now() - generatedAt) / 1000)) : null;
    await recordAlbumAnalyticsEvent({
      supabase,
      userId: user.id,
      albumId,
      draftVersionId: view.versionId,
      eventType: "album_accepted",
      eventKey: view.versionId,
      eventData: analyticsAcceptData(calculateAlbumEditMetrics(view), seconds),
    });
  }
  redirect(`/pets/${petId}/album/${albumId}?view=preview`);
}

const DECORATION_EVENTS = ["decoration_recommendation_shown", "decoration_previewed", "decoration_applied", "decoration_rejected", "decoration_reset"] as const;

export async function trackDecorationRecommendation(albumId: string, eventType: (typeof DECORATION_EVENTS)[number], eventKey: string, styleId?: string | null) {
  if (!UUID.test(albumId) || !DECORATION_EVENTS.includes(eventType) || eventKey.length > 120) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).eq("owner_user_id", user.id).maybeSingle();
  if (!album) return;
  const { data: version } = await supabase.from("album_draft_versions").select("id").eq("album_id", albumId).eq("is_active", true).maybeSingle();
  await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: version?.id ?? null, eventType, eventKey, eventData: { style_id: styleId ?? null } });
}

export async function regenerateAlbumDraft(petId: string, albumId: string) {
  if (!UUID.test(petId) || !UUID.test(albumId)) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!album) return;
  const entitlements = await loadUserEntitlements(supabase, user.id);
  if (!entitlements.canRegenerateAlbum) redirect(`/plus?next=${encodeURIComponent(`/pets/${petId}/album/${albumId}?view=complete`)}`);
  const { data: version } = await supabase.from("album_draft_versions").select("id").eq("album_id", albumId).eq("is_active", true).maybeSingle();
  await recordAlbumAnalyticsEvent({ supabase, userId: user.id, albumId, draftVersionId: version?.id ?? null, eventType: "album_regenerated", eventKey: version?.id ?? albumId });
  redirect(`/pets/${petId}/album/new`);
}
