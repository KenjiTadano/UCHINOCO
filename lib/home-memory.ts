import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeMemoryPhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
  caption: string | null;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function jstDateRange(year: number, month: number, day: number) {
  const start = new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
  return { start: start.toISOString(), end: new Date(start.getTime() + DAY_MS).toISOString() };
}

function jstMonthRange(year: number, month: number) {
  const start = jstDateRange(year, month, 1).start;
  const next = month === 12 ? jstDateRange(year + 1, 1, 1).start : jstDateRange(year, month + 1, 1).start;
  return { start, end: next };
}

async function findInRange(
  supabase: SupabaseClient,
  petIds: string[],
  range: { start: string; end: string },
  limit = 1,
) {
  const selected = "id, pet_id, storage_path, thumbnail_path, taken_at, created_at, favorite, caption";
  const taken = await supabase
    .from("photos")
    .select(selected)
    .in("pet_id", petIds)
    .gte("taken_at", range.start)
    .lt("taken_at", range.end)
    .order("taken_at", { ascending: false })
    .limit(limit);
  if (taken.error || taken.data?.length) return taken;

  return supabase
    .from("photos")
    .select(selected)
    .in("pet_id", petIds)
    .is("taken_at", null)
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function findMemoryCandidate(supabase: SupabaseClient, petIds: string[], now = new Date()) {
  if (!petIds.length) return { photo: null, label: null, error: null };
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const parts = Object.fromEntries(today.map(({ type, value }) => [type, Number(value)]));

  for (let yearsAgo = 1; yearsAgo <= 10; yearsAgo += 1) {
    const result = await findInRange(supabase, petIds, jstDateRange(parts.year - yearsAgo, parts.month, parts.day));
    if (result.error) return { photo: null, label: null, error: result.error };
    if (result.data?.[0]) return { photo: result.data[0] as HomeMemoryPhoto, label: `${yearsAgo}年前の今日`, error: null };
  }

  for (let yearsAgo = 1; yearsAgo <= 10; yearsAgo += 1) {
    const result = await findInRange(supabase, petIds, jstMonthRange(parts.year - yearsAgo, parts.month), 2);
    if (result.error) return { photo: null, label: null, error: result.error };
    if (result.data?.[0]) return { photo: result.data[0] as HomeMemoryPhoto, label: "この時期の思い出", error: null };
  }

  const oldRange = { start: "1970-01-01T00:00:00.000Z", end: new Date(Date.now() - 90 * DAY_MS).toISOString() };
  const old = await findInRange(supabase, petIds, oldRange);
  return { photo: old.data?.[0] ? old.data[0] as HomeMemoryPhoto : null, label: old.data?.[0] ? "懐かしい思い出" : null, error: old.error };
}
