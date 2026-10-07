import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "./photo-analysis/constants.ts";
import { PHOTO_INTELLIGENCE_VERSION } from "./photo-intelligence/config.ts";
import { tokyoDateParts, tokyoRange, type UchinocoNowPhoto } from "./uchinoco-now.ts";
import { loadPhotosInRange } from "./uchinoco-now-data.ts";

export type AnniversaryPet = { id: string; name: string; birthday: string | null; adoption_date: string | null };
export type AnniversaryEvent = { petId: string; petName: string; kind: "birthday" | "adoption"; years: number | null; sourceDate: string };
export type GrowthComparison = { petId: string; before: UchinocoNowPhoto; after: UchinocoNowPhoto; yearsAgo: number; score: number };

export function anniversaryEventsToday(pets: AnniversaryPet[], now = new Date()) {
  const today = tokyoDateParts(now);
  const events: AnniversaryEvent[] = [];
  for (const pet of pets) {
    for (const [kind, sourceDate] of [["birthday", pet.birthday], ["adoption", pet.adoption_date]] as const) {
      if (!sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) continue;
      const [, month, day] = sourceDate.split("-").map(Number);
      if (month !== today.month || day !== today.day) continue;
      const sourceYear = Number(sourceDate.slice(0, 4));
      const years = today.year >= sourceYear ? today.year - sourceYear : null;
      events.push({ petId: pet.id, petName: pet.name, kind, years, sourceDate });
    }
  }
  return events;
}

export function growthCompatibility(input: { beforeOrientation: string | null; afterOrientation: string | null; beforeScore: number | null; afterScore: number | null; beforePetVisible: boolean; afterPetVisible: boolean }) {
  if (!input.beforePetVisible || !input.afterPetVisible) return null;
  if (!input.beforeOrientation || input.beforeOrientation !== input.afterOrientation) return null;
  if ((input.beforeScore ?? 0) < 55 || (input.afterScore ?? 0) < 55) return null;
  return Math.round((((input.beforeScore ?? 0) + (input.afterScore ?? 0)) / 2 + 10) * 100) / 100;
}

type Signals = { score: number | null; orientation: string | null; semanticPetVisible: boolean; geometryPetVisible: boolean };

async function storedSignals(supabase: SupabaseClient, photoIds: string[]) {
  const result = new Map<string, Signals>();
  if (!photoIds.length) return result;
  const { data } = await supabase.from("photo_analysis_results")
    .select("photo_id, analysis_type, analysis_version, result_status, result, updated_at")
    .in("photo_id", photoIds)
    .in("analysis_type", [PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY])
    .in("result_status", ["success", "fallback"])
    .order("updated_at", { ascending: false });
  for (const row of data ?? []) {
    const current = result.get(row.photo_id) ?? { score: null, orientation: null, semanticPetVisible: false, geometryPetVisible: false };
    const value = row.result as Record<string, unknown> | null;
    if (row.analysis_type === PHOTO_INTELLIGENCE_SEMANTIC && row.analysis_version === PHOTO_INTELLIGENCE_VERSION && current.score === null) {
      current.score = typeof value?.overallScore === "number" ? value.overallScore : null;
      current.semanticPetVisible = value?.petPresent === true;
    }
    if (row.analysis_type === SUBJECT_GEOMETRY && row.analysis_version === SUBJECT_GEOMETRY_VERSION && current.orientation === null) {
      current.orientation = typeof value?.orientation === "string" ? value.orientation : null;
      current.geometryPetVisible = Array.isArray(value?.pets) && value.pets.length > 0;
    }
    result.set(row.photo_id, current);
  }
  return result;
}

export async function loadAnniversaryMemory(input: { supabase: SupabaseClient; pets: AnniversaryPet[]; selectedPetIds: string[]; now?: Date; includeHistory?: boolean }) {
  const now = input.now ?? new Date();
  const today = tokyoDateParts(now);
  const events = anniversaryEventsToday(input.pets.filter((pet) => input.selectedPetIds.includes(pet.id)), now);
  const todayPhotos = (await loadPhotosInRange(input.supabase, input.selectedPetIds, tokyoRange(today.year, today.month, today.day), 12)).photos;
  const pastByYear = input.includeHistory === false ? [] : (await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const yearsAgo = index + 1;
    const range = tokyoRange(today.year - yearsAgo, today.month, today.day);
    const photos = (await loadPhotosInRange(input.supabase, input.selectedPetIds, range, 6)).photos;
    return { yearsAgo, photos };
  }))).filter((item) => item.photos.length > 0);
  const all = [...todayPhotos, ...pastByYear.flatMap((item) => item.photos)];
  const signals = await storedSignals(input.supabase, all.map((photo) => photo.id));
  const comparisons: GrowthComparison[] = [];
  for (const past of pastByYear) {
    for (const before of past.photos) {
      for (const after of todayPhotos.filter((photo) => photo.pet_id === before.pet_id)) {
        const left = signals.get(before.id);
        const right = signals.get(after.id);
        const score = growthCompatibility({
          beforeOrientation: left?.orientation ?? null,
          afterOrientation: right?.orientation ?? null,
          beforeScore: left?.score ?? null,
          afterScore: right?.score ?? null,
          beforePetVisible: Boolean(left?.semanticPetVisible && left.geometryPetVisible),
          afterPetVisible: Boolean(right?.semanticPetVisible && right.geometryPetVisible),
        });
        if (score !== null) comparisons.push({ petId: before.pet_id, before, after, yearsAgo: past.yearsAgo, score });
      }
    }
  }
  comparisons.sort((a, b) => b.score - a.score || a.before.id.localeCompare(b.before.id));
  return { events, todayPhotos, pastByYear, onThisDay: pastByYear[0]?.photos[0] ?? null, growthComparison: comparisons[0] ?? null };
}
