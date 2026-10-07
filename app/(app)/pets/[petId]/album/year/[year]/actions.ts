"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { parseAnnualYear, ANNUAL_ALBUM_VERSION } from "@/lib/annual-album";
import { preparePassiveAnnualCandidate } from "@/lib/passive-annual-candidate-server";
import { buildDraftSavePayload, toPersistableSpread } from "@/lib/album-persistence/payload";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import type { Json } from "@/lib/supabase/database.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type MaterializeAnnualCandidateState = { error: string | null };

export async function materializeAnnualCandidate(petId: string, rawYear: number, _previous: MaterializeAnnualCandidateState, formData: FormData): Promise<MaterializeAnnualCandidateState> {
  const year = parseAnnualYear(rawYear);
  const expectedFingerprint = String(formData.get("fingerprint") ?? "");
  if (!UUID.test(petId) || !year || !/^[0-9a-f]{64}$/.test(expectedFingerprint)) return { error: "年間アルバム候補を確認できませんでした。" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const entitlements = await loadUserEntitlements(supabase as unknown as SupabaseClient, user.id);
  if (!entitlements.canUseAnnualMemory) return { error: "年間アルバムはUCHINOCO PLUSで利用できます。" };
  const { data: pet } = await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) return { error: "年間アルバム候補を確認できませんでした。" };
  const candidate = await preparePassiveAnnualCandidate({ supabase, userId: user.id, petId, petName: pet.name, year, expectedFingerprint });
  if (!candidate) return { error: "写真が増えたため候補を更新しました。アルバム一覧からもう一度お試しください。" };

  const persistable = candidate.draft.spreads.map(toPersistableSpread);
  const payload = buildDraftSavePayload(persistable, [], candidate.composition, {
    annual_candidate_version: ANNUAL_ALBUM_VERSION,
    annual_candidate_fingerprint: candidate.fingerprint,
    annual_candidate_year: candidate.year,
    annual_candidate_source_photo_ids: candidate.sourcePhotoIds,
    annual_candidate_analyzed_photo_ids: candidate.analyzedPhotoIds,
    annual_candidate_selected_photo_ids: candidate.selectedPhotoIds,
    annual_candidate_period: candidate.period,
    annual_seasons: candidate.seasons,
    annual_monthly_source_album_ids: candidate.monthlySourceAlbumIds,
    annual_print: candidate.print,
    materialized_on_open: true,
  });
  const result = await (supabase as unknown as SupabaseClient).rpc("materialize_passive_annual_candidate", {
    p_album_id: candidate.albumId,
    p_pet_id: petId,
    p_candidate_fingerprint: candidate.fingerprint,
    p_year: year,
    p_title: candidate.title,
    p_period_from: candidate.period.start,
    p_period_to: candidate.period.end,
    p_source_photo_ids: candidate.sourcePhotoIds,
    p_selected_photo_ids: candidate.selectedPhotoIds,
    p_cover_photo_id: candidate.coverPhotoId,
    p_payload: payload as unknown as Json,
    p_cover_title: candidate.title,
    p_cover_subtitle: formatAlbumPeriodLabels(candidate.period.start, candidate.period.end).coverDateLabel,
  });
  if (result.error) return { error: /stale/i.test(result.error.message) ? "写真が増えたため候補を更新しました。" : "年間アルバムを準備できませんでした。もう一度お試しください。" };
  revalidatePath("/home");
  revalidatePath(`/pets/${petId}/album`);
  redirect(`/pets/${petId}/album/${candidate.albumId}?view=complete`);
}
