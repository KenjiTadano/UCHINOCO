"use server";

import { createClient } from "@/lib/supabase/server";
import { parseAlbumSetup } from "@/lib/album-setup";
import { albumReadiness, summarizeAlbumPreparation, type AlbumReadiness } from "@/lib/album-readiness";
import { loadStoredGenerationInputs, type GenerationSourcePhoto } from "@/lib/album-generation/stored-inputs";
import { rankStoredAlbumInputs } from "@/lib/album-generation/ranked-inputs";
import { ALBUM_INTENT_TTL_MS } from "@/lib/album-readiness";
import { isTerminalAnalysisError } from "@/lib/photo-analysis-policy";

export async function checkAlbumReadiness(petId: string, form: FormData): Promise<AlbumReadiness> {
  const unavailable: AlbumReadiness = { state: "unavailable", total: 0, ready: 0, pending: 0, failed: 0, required: 24, missingPhotos: 0, suggestedPages: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...unavailable, state: "action_required", action: "login" };
  const { data: pets, error } = await supabase.from("pets").select("id").eq("owner_user_id", user.id);
  if (error) return unavailable;
  if (!pets?.some((pet) => pet.id === petId)) return { ...unavailable, state: "action_required" };
  let setup;
  let requestedAt = new Date();
  try {
    requestedAt = form.get("requestedAt") ? new Date(String(form.get("requestedAt"))) : new Date();
    if (!Number.isFinite(requestedAt.getTime()) || Date.now() - requestedAt.getTime() >= ALBUM_INTENT_TTL_MS || requestedAt.getTime() - Date.now() > 60_000) return { ...unavailable, state: "action_required" };
    setup = parseAlbumSetup(
      form,
      pets.map((pet) => pet.id),
      requestedAt,
    );
  } catch {
    return { ...unavailable, state: "action_required" };
  }
  try {
    const photos: GenerationSourcePhoto[] = [];
    for (const selectedPet of setup.petIds) {
      for (let offset = 0; ; offset += 200) {
        const result = await supabase
          .from("photos")
          .select("id,pet_id,storage_path,updated_at,content_hash,taken_at,created_at")
          .eq("pet_id", selectedPet)
          .eq("uploader_user_id", user.id)
          .gte("timeline_at", setup.from.toISOString())
          .lte("timeline_at", setup.to.toISOString())
          .order("id", { ascending: true })
          .range(offset, offset + 199);
        if (result.error) return unavailable;
        photos.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 200) break;
      }
    }
    const inputs = await loadStoredGenerationInputs(supabase, photos);
    const queueRows: Array<{ photo_id: string; status: string; attempts: number; updated_at: string; error_code: string | null }> = [];
    let queueStatusAvailable = true;
    for (let offset = 0; offset < photos.length; offset += 200) {
      const result = await supabase
        .from("photo_ai_analyses")
        .select("photo_id,status,attempts,updated_at,error_code")
        .in("photo_id", photos.slice(offset, offset + 200).map((photo) => photo.id));
      if (result.error) {
        queueStatusAvailable = false;
        break;
      }
      queueRows.push(...(result.data ?? []));
    }
    const queueByPhoto = new Map(queueRows.map((row) => [row.photo_id, row]));
    const eligibleReady = rankStoredAlbumInputs(inputs, photos, setup.petIds)
      .filter((photo) => photo.candidate.role !== "alternate" && photo.candidate.scores.technical >= 25)
      .length;
    const preparationPhotos = photos.map((photo) => {
      const analysis = inputs.preparationByPhoto.get(photo.id)!;
      const queue = queueByPhoto.get(photo.id);
      const retryableFailure = queue?.status === "failed" && queue.attempts < 3 && !isTerminalAnalysisError(queue.error_code);
      const retryable = !queueStatusAvailable || !queue || queue.status === "pending" || queue.status === "processing" || retryableFailure;
      const failed = queueStatusAvailable && (queue?.status === "failed" && !retryableFailure || analysis.failed && !retryable);
      const progressAt = [analysis.lastProgressAt, queue?.updated_at]
        .filter((timestamp): timestamp is string => timestamp != null && Date.parse(timestamp) >= requestedAt.getTime())
        .sort()
        .at(-1) ?? null;
      return {
        ...analysis,
        failed,
        queueMissing: queueStatusAvailable && !queue,
        lastProgressAt: progressAt,
      };
    });
    const preparation = summarizeAlbumPreparation({
      photos: preparationPhotos,
      eligibleReady,
      requiredEligible: setup.pageCount / 2,
      requestedAt: requestedAt.toISOString(),
      queueStatusAvailable,
    });
    console.info("albumPreparation", preparation);
    const ready = inputs.grouping.length;
    const eligible = ready === photos.length ? eligibleReady : undefined;
    return albumReadiness({ total: photos.length, ready, failed: inputs.failedAnalysisCount, pages: setup.pageCount, eligible });
  } catch {
    return unavailable;
  }
}
