import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ANALYSIS_RETRY_DELAY_MS, ANALYSIS_STALE_MS, TERMINAL_ANALYSIS_ERRORS } from "@/lib/photo-analysis-policy";

// Queries are always bounded. RLS and explicit photo AND pet ownership both apply.
export async function findAnalysisWork(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string,
) {
  const now = Date.now();
  const retryableError = "or(error_code.is.null,error_code.not.in.(" + TERMINAL_ANALYSIS_ERRORS.join(",") + "))";
  const retryBefore = new Date(now - ANALYSIS_RETRY_DELAY_MS).toISOString();
  const staleBefore = new Date(now - ANALYSIS_STALE_MS).toISOString();
  const ownedAnalyses = () => supabase.from("photo_ai_analyses")
    .select("id, photos!inner(id, pet_id, uploader_user_id, pets!inner(owner_user_id))")
    .eq("photos.uploader_user_id", userId).eq("photos.pets.owner_user_id", userId);
  const { data: queued, error } = await ownedAnalyses()
    .or("and(status.eq.pending,attempts.lt.3),and(status.eq.failed,attempts.lt.3," + retryableError + ",updated_at.lte." + retryBefore + "),and(status.eq.processing,updated_at.lte." + staleBefore + ")")
    .order("updated_at").order("id").limit(1).maybeSingle();
  if (error) throw new Error("analysis_queue_unavailable");
  if (queued) return { photo: queued.photos, waitMs: 1000 };

  // Anti-join finds legacy photos and repairs a failed post-upload queue insert.
  const { data: legacy, error: legacyError } = await supabase.from("photos")
    .select("id, pet_id, pets!inner(owner_user_id), photo_ai_analyses(id)")
    .eq("uploader_user_id", userId).eq("pets.owner_user_id", userId)
    .is("photo_ai_analyses", null).order("created_at").order("id").limit(1).maybeSingle();
  if (legacyError) throw new Error("analysis_queue_unavailable");
  if (legacy) return { photo: legacy, waitMs: 1000 };

  const { data: waiting, error: waitingError } = await ownedAnalyses()
    .or("status.eq.processing,and(status.eq.failed,attempts.lt.3," + retryableError + ")").limit(1).maybeSingle();
  if (waitingError) throw new Error("analysis_queue_unavailable");
  // Poll only while a retry/lease remains; an empty queue stops completely.
  return { photo: null, waitMs: waiting ? 30_000 : 0 };
}
