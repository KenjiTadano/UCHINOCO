"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { preparePassiveCandidate } from "@/lib/passive-album-candidate-server";
import { buildDraftSavePayload, toPersistableSpread } from "@/lib/album-persistence/payload";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import type { Json } from "@/lib/supabase/database.types";
import { passiveCandidateAlbumId } from "@/lib/passive-album-candidate";
import { parseTokyoMonthKey } from "@/lib/album-monthly-lifecycle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MaterializeCandidateState = { error: string | null };

export async function materializePassiveCandidate(petId: string, _previous: MaterializeCandidateState, formData: FormData): Promise<MaterializeCandidateState> {
  if (!UUID.test(petId)) return { error: "アルバム候補を確認できませんでした。" };
  const expectedFingerprint = String(formData.get("fingerprint") ?? "");
  const monthKey = String(formData.get("monthKey") ?? "");
  if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) return { error: "アルバム候補を確認できませんでした。" };
  if (!parseTokyoMonthKey(monthKey)) return { error: "アルバム候補を確認できませんでした。" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: pet } = await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) return { error: "アルバム候補を確認できませんでした。" };

  const expectedAlbumId = passiveCandidateAlbumId(expectedFingerprint);
  const alreadyMaterialized = await supabase.from("albums").select("id, status").eq("id", expectedAlbumId).eq("owner_user_id", user.id).eq("pet_id", petId).maybeSingle();
  if (alreadyMaterialized.data) {
    const active = await supabase.from("album_draft_versions").select("status, generation_metadata").eq("album_id", expectedAlbumId).eq("is_active", true).maybeSingle();
    const metadata = active.data?.generation_metadata as Record<string, unknown> | null;
    if (metadata?.passive_candidate_fingerprint === expectedFingerprint || active.data?.status === "editing" || alreadyMaterialized.data.status === "ordered") {
      redirect(`/pets/${petId}/album/${expectedAlbumId}?view=complete`);
    }
  }

  const candidate = await preparePassiveCandidate({ supabase, userId: user.id, petId, petName: pet.name, expectedFingerprint, monthKey });
  if (!candidate) return { error: "写真が増えたため候補を更新しました。アルバム一覧からもう一度お試しください。" };

  const persistable = candidate.draft.spreads.map(toPersistableSpread);
  const selectedIds = [...new Set(persistable.flatMap((spread) => spread.assignments.map((item) => item.photoId)))];
  const payload = buildDraftSavePayload(persistable, [], candidate.composition, {
    passive_candidate_version: "passive-album-candidate-v1",
    passive_candidate_fingerprint: candidate.fingerprint,
    passive_candidate_photo_ids: candidate.photoIds,
    passive_candidate_period: candidate.period,
    materialized_on_open: true,
  });
  const coverPhotoId = candidate.coverPhotoId ?? selectedIds[0] ?? null;
  const materialized = await (supabase as unknown as SupabaseClient).rpc("materialize_passive_album_candidate", {
    p_album_id: candidate.albumId,
    p_pet_id: petId,
    p_candidate_fingerprint: candidate.fingerprint,
    p_title: candidate.title,
    p_period_from: candidate.period.start,
    p_period_to: candidate.period.end,
    p_candidate_photo_ids: candidate.photoIds,
    p_selected_photo_ids: selectedIds,
    p_cover_photo_id: coverPhotoId,
    p_payload: payload as unknown as Json,
    p_cover_title: candidate.title,
    p_cover_subtitle: formatAlbumPeriodLabels(candidate.period.start, candidate.period.end).coverDateLabel,
  });
  if (materialized.error) {
    const stale = /stale candidate|metadata mismatch/i.test(materialized.error.message);
    return { error: stale ? "写真が増えたため候補を更新しました。アルバム一覧からもう一度お試しください。" : "アルバムを準備できませんでした。もう一度お試しください。" };
  }
  revalidatePath("/home");
  revalidatePath(`/pets/${petId}/album`);
  redirect(`/pets/${petId}/album/${candidate.albumId}?view=complete`);
}
