import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_INTELLIGENCE_SEMANTIC } from "./photo-analysis/constants.ts";
import { sourceFingerprint } from "./photo-analysis/fingerprint.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";

type IntakePhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  updated_at: string;
  content_hash: string | null;
};

/**
 * Finds recent, owner-scoped photos whose current bytes/version have not gone
 * through Photo Intelligence yet. Any persisted terminal result counts as an
 * attempt, so provider fallback cannot become an infinite retry loop.
 */
export async function findPhotoIntelligenceWork(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: photos, error } = await supabase
    .from("photos")
    .select("id, pet_id, storage_path, updated_at, content_hash, pets!photos_pet_id_fkey!inner(owner_user_id), photo_ai_analyses!inner(status)")
    .eq("uploader_user_id", userId)
    .eq("pets.owner_user_id", userId)
    .eq("photo_ai_analyses.status", "completed")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("photo_intake_unavailable");

  const candidates = (photos ?? []) as unknown as IntakePhoto[];
  if (!candidates.length) return { photo: null, reusedCount: 0 };
  const { data: results, error: resultError } = await supabase
    .from("photo_analysis_results")
    .select("photo_id, analysis_version, source_fingerprint, result_status")
    .in("photo_id", candidates.map((photo) => photo.id))
    .eq("analysis_type", PHOTO_INTELLIGENCE_SEMANTIC)
    .eq("analysis_version", PHOTO_INTELLIGENCE_VERSION);
  if (resultError) throw new Error("photo_intake_unavailable");

  const completed = new Set(
    (results ?? []).map((row) => `${row.photo_id}|${row.analysis_version}|${row.source_fingerprint}`),
  );
  const isCompleted = (candidate: IntakePhoto) => completed.has(
    `${candidate.id}|${PHOTO_INTELLIGENCE_VERSION}|${sourceFingerprint(candidate)}`,
  );
  const photo = candidates.find((candidate) => !isCompleted(candidate));
  return {
    photo: photo ? { id: photo.id, pet_id: photo.pet_id } : null,
    reusedCount: candidates.filter(isCompleted).length,
  };
}
