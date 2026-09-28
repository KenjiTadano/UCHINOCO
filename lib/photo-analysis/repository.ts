import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types.ts";
import type { AnalysisType, ResultStatus } from "./constants.ts";
import { decideAnalysisWrite } from "./policy.ts";

type Client = SupabaseClient<Database>;

export type LoadedAnalysis = {
  result: unknown;
  resultStatus: ResultStatus;
  createdAt: string;
  analysisVersion: string;
  sourceFingerprint: string;
};

export async function readAnalysis(
  supabase: Client,
  photoId: string,
  analysisType: AnalysisType,
  analysisVersion: string,
  sourceFingerprint: string,
): Promise<LoadedAnalysis | null> {
  const { data, error } = await supabase
    .from("photo_analysis_results")
    .select("result, result_status, created_at, analysis_version, source_fingerprint")
    .eq("photo_id", photoId)
    .eq("analysis_type", analysisType)
    .eq("analysis_version", analysisVersion)
    .eq("source_fingerprint", sourceFingerprint)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.result_status;
  if (status !== "success" && status !== "fallback" && status !== "failed") return null;
  return {
    result: data.result,
    resultStatus: status,
    createdAt: data.created_at,
    analysisVersion: data.analysis_version,
    sourceFingerprint: data.source_fingerprint,
  };
}

export async function saveAnalysis(
  supabase: Client,
  input: {
    photoId: string;
    analysisType: AnalysisType;
    analysisVersion: string;
    sourceFingerprint: string;
    resultStatus: ResultStatus;
    result: Json;
    existingStatus: ResultStatus | null;
  },
): Promise<{ stored: boolean; reason: string }> {
  const decision = decideAnalysisWrite(
    input.existingStatus ? { resultStatus: input.existingStatus } : null,
    input.resultStatus,
  );
  if (decision.action === "keep") return { stored: false, reason: decision.reason };

  const { data, error } = await supabase.rpc("save_photo_analysis_result", {
    p_photo_id: input.photoId,
    p_analysis_type: input.analysisType,
    p_analysis_version: input.analysisVersion,
    p_source_fingerprint: input.sourceFingerprint,
    p_result_status: input.resultStatus,
    p_result: input.result,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    console.error("Photo analysis save failed", { message: error?.message ?? "empty" });
    return { stored: false, reason: "save_failed" };
  }
  const reason = typeof data.reason === "string" ? data.reason : "unknown";
  return { stored: data.stored === true, reason };
}
