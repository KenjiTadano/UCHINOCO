import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlbumPhotoEligibility } from "./photo-eligibility.ts";
import { traceAlbumLoad } from "../album-load-trace.ts";

export type RequestAlbum = { id: string; pet_id: string; owner_user_id: string; status: string; title: string | null; period_from: string; period_to: string; cover_photo_id: string | null };
export type RequestPhotoRecord = { id: string; storage_path: string; thumbnail_path: string | null };
export type RequestDraftVersion = { id: string; album_id: string; status: string; revision: number; created_at: string; generation_metadata: unknown };

/** Server-internal only. Construct after authentication, once per request; never accept from an Action argument. */
export function createAlbumRequestContext(supabase: SupabaseClient, userId: string) {
  const albums = new Map<string, Promise<RequestAlbum | null>>();
  const versions = new Map<string, Promise<RequestDraftVersion | null>>();
  const links = new Map<string, Promise<string[] | null>>();
  const ownedPets = new Map<string, Promise<string[] | null>>();
  const photoRows = new Map<string, Promise<RequestPhotoRecord | null>>();
  const eligibility = new Map<string, Promise<AlbumPhotoEligibility | null>>();
  const context = {
    userId,
    album(albumId: string) {
      if (!albums.has(albumId)) albums.set(albumId, (async () => {
        const { data, error } = await supabase.from("albums").select("id, pet_id, owner_user_id, status, title, period_from, period_to, cover_photo_id").eq("id", albumId).maybeSingle();
        return error ? null : data as RequestAlbum | null;
      })());
      return albums.get(albumId)!;
    },
    version(albumId: string) {
      if (!versions.has(albumId)) versions.set(albumId, traceAlbumLoad("draft.version", async () => {
        const { data, error } = await supabase.from("album_draft_versions").select("id, album_id, status, revision, created_at, generation_metadata").eq("album_id", albumId).eq("is_active", true).maybeSingle();
        return error ? null : data as RequestDraftVersion | null;
      }));
      return versions.get(albumId)!;
    },
    petIds(albumId: string) {
      if (!links.has(albumId)) links.set(albumId, (async () => {
        const { data, error } = await supabase.from("album_pets").select("pet_id").eq("album_id", albumId);
        return error ? null : [...new Set((data ?? []).map((row) => String(row.pet_id)))];
      })());
      return links.get(albumId)!;
    },
    ownedPetIds(petIds: string[]) {
      const key = [...new Set(petIds)].sort().join(",");
      if (!ownedPets.has(key)) ownedPets.set(key, (async () => {
        const { data, error } = await supabase.from("pets").select("id").in("id", petIds).eq("owner_user_id", userId);
        return error ? null : (data ?? []).map(row => String(row.id));
      })());
      return ownedPets.get(key)!;
    },
    photoRecords(photoIds: string[]) {
      const ids = [...new Set(photoIds)];
      const missing = ids.filter(id => !photoRows.has(id));
      if (missing.length) {
        const batch = (async () => {
          const { data } = await supabase.from("photos").select("id, storage_path, thumbnail_path").in("id", missing);
          return new Map((data ?? []).map(row => [row.id, row as RequestPhotoRecord]));
        })();
        for (const id of missing) photoRows.set(id, batch.then(rows => rows.get(id) ?? null));
      }
      return Promise.all(ids.map(id => photoRows.get(id)!)).then(rows => rows.filter((row): row is RequestPhotoRecord => row !== null));
    },
    eligibility(albumId: string) {
      if (!eligibility.has(albumId)) eligibility.set(albumId, (async () => {
        const album = await context.album(albumId);
        if (!album || album.owner_user_id !== userId) return null;
        const petIds = await context.petIds(albumId);
        if (!petIds?.length || !petIds.includes(album.pet_id)) return null;
        const owned = await context.ownedPetIds(petIds);
        if (owned?.length !== petIds.length) return null;
        return { ownerUserId: userId, allowedPetIds: petIds };
      })());
      return eligibility.get(albumId)!;
    },
  };
  return context;
}
export type AlbumRequestContext = ReturnType<typeof createAlbumRequestContext>;
