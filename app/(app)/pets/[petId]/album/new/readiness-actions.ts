"use server";

import { createClient } from "@/lib/supabase/server";
import { parseAlbumSetup } from "@/lib/album-setup";
import { albumReadiness, type AlbumReadiness } from "@/lib/album-readiness";
import { loadStoredGenerationInputs, type GenerationSourcePhoto } from "@/lib/album-generation/stored-inputs";
import { rankStoredAlbumInputs } from "@/lib/album-generation/ranked-inputs";
import { ALBUM_INTENT_TTL_MS } from "@/lib/album-readiness";

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
  try {
    const now = form.get("requestedAt") ? new Date(String(form.get("requestedAt"))) : new Date();
    if (!Number.isFinite(now.getTime()) || Date.now() - now.getTime() >= ALBUM_INTENT_TTL_MS || now.getTime() - Date.now() > 60_000) return { ...unavailable, state: "action_required" };
    setup = parseAlbumSetup(
      form,
      pets.map((pet) => pet.id),
      now,
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
    const ready = inputs.grouping.length;
    const eligible = ready === photos.length ? rankStoredAlbumInputs(inputs, photos, setup.petIds).filter((photo) => photo.candidate.role !== "alternate" && photo.candidate.scores.technical >= 25).length : undefined;
    return albumReadiness({ total: photos.length, ready, failed: inputs.failedAnalysisCount, pages: setup.pageCount, eligible });
  } catch {
    return unavailable;
  }
}
