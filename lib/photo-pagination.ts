import type { SupabaseClient } from "@supabase/supabase-js";

export type PaginatedPhoto = {
  id: string;
  /** Registration/primary pet ID, never the current list filter. */
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  caption: string | null;
  favorite: boolean;
  timeline_at: string;
};

export type PhotoCursor = { at: string; id: string } | null;

export function parsePhotoCursor(at?: string, id?: string): PhotoCursor {
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

export async function getPhotoPage(
  supabase: SupabaseClient,
  petId: string,
  limit: number,
  cursor: PhotoCursor,
  favoriteOnly = false,
  scope: "primary" | "memories" = "primary",
) {
  const result = await supabase.rpc(scope === "memories" ? "get_pet_memories_page" : "get_pet_photos_page", {
    p_pet_id: petId,
    p_limit: limit + 1,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_favorite_only: favoriteOnly,
  });
  const rows = (result.data ?? []) as PaginatedPhoto[];
  return { photos: rows.slice(0, limit), hasMore: rows.length > limit, error: result.error };
}

// Album keeps getPhotoPage's primary-only default; opt in explicitly here.
export function getMemoryPhotoPage(
  supabase: SupabaseClient, petId: string, limit: number,
  cursor: PhotoCursor, favoriteOnly = false,
) {
  return getPhotoPage(supabase, petId, limit, cursor, favoriteOnly, "memories");
}

export function nextPhotoCursor(photos: PaginatedPhoto[]) {
  const last = photos.at(-1);
  return last ? { at: last.timeline_at, id: last.id } : null;
}

export function paginationHref(path: string, cursor: PhotoCursor, values: Record<string, string> = {}) {
  const params = new URLSearchParams(values);
  if (cursor) {
    params.set("before", cursor.at);
    params.set("beforeId", cursor.id);
  }
  return `${path}?${params.toString()}`;
}
