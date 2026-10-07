import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canClaimAnalysis } from "@/lib/photo-analysis-policy";

// Queries are always bounded. Photo RLS verifies pet access, while the explicit
// uploader filter ensures a family member only runs analysis for their uploads.
// The claim filter stays in canClaimAnalysis. A nested or() with comma-separated
// not.in values is rejected by PostgREST and turned the queue GET into a 503.
export async function findAnalysisWork(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string,
) {
  const now = Date.now();
  const ownedAnalyses = () => supabase.from("photo_ai_analyses")
    .select("id, status, attempts, updated_at, error_code, photos!inner(id, pet_id, uploader_user_id, pets!photos_pet_id_fkey!inner(owner_user_id))")
    .eq("photos.uploader_user_id", userId);
  const { data: candidates, error } = await ownedAnalyses()
    .or("status.eq.pending,status.eq.failed,status.eq.processing")
    .lt("attempts", 3)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(30);
  if (error) throw new Error("analysis_queue_unavailable");
  const queued = (candidates ?? []).find((row) => canClaimAnalysis({
    status: row.status,
    attempts: row.attempts,
    updated_at: row.updated_at,
    error_code: row.error_code,
  }, now));
  if (queued) return { photo: queued.photos, waitMs: 1000 };

  // Anti-join finds legacy photos and repairs a failed post-upload queue insert.
  const { data: legacy, error: legacyError } = await supabase.from("photos")
    .select("id, pet_id, pets!photos_pet_id_fkey!inner(owner_user_id), photo_ai_analyses(id)")
    .eq("uploader_user_id", userId)
    .is("photo_ai_analyses", null).order("created_at").order("id").limit(1).maybeSingle();
  if (legacyError) throw new Error("analysis_queue_unavailable");
  if (legacy) return { photo: legacy, waitMs: 1000 };

  const waiting = (candidates ?? []).some((row) => !canClaimAnalysis({
    status: row.status,
    attempts: row.attempts,
    updated_at: row.updated_at,
    error_code: row.error_code,
  }, now));
  // Poll only while a retry/lease remains; an empty queue stops completely.
  return { photo: null, waitMs: waiting ? 30_000 : 0 };
}
