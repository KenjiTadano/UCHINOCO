import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlbumPhotoEligibility } from "./photo-eligibility";
import { traceAlbumLoad } from "../album-load-trace";

export type RouteAlbum = { id: string; pet_id: string; owner_user_id: string; status: string; title: string | null; period_from: string | null; period_to: string | null; cover_photo_id: string | null };
export type RouteVersion = { id: string; album_id: string; status: string; revision: number; created_at: string; generation_metadata: unknown };
export type RoutePhoto = { id: string; storage_path: string; thumbnail_path: string | null };

/** Server-render context only: construct after getUser; never pass to a Server Action. */
export function createRouteReadContext(supabase: SupabaseClient, userId: string, album: RouteAlbum) {
  let version: Promise<RouteVersion | null> | undefined;
  let links: Promise<string[] | null> | undefined;
  let eligibility: Promise<AlbumPhotoEligibility | null> | undefined;
  const photos = new Map<string, RoutePhoto>();
  const photoLoads = new Map<string, Promise<RoutePhoto | null>>();
  return {
    userId, album,
    version() {
      return version ??= traceAlbumLoad("draft.version", async () => {
        const { data, error } = await supabase.from("album_draft_versions").select("id, album_id, status, revision, created_at, generation_metadata").eq("album_id", album.id).eq("is_active", true).maybeSingle();
        return error ? null : data as RouteVersion | null;
      });
    },
    petIds() {
      return links ??= (async () => {
        const { data, error } = await supabase.from("album_pets").select("pet_id").eq("album_id", album.id);
        return error ? null : [...new Set((data ?? []).map(row => String(row.pet_id)))];
      })();
    },
    eligibility() {
      return eligibility ??= (async () => {
        if (album.owner_user_id !== userId) return null;
        const ids = await this.petIds();
        if (!ids?.length || !ids.includes(album.pet_id)) return null;
        const { data, error } = await supabase.from("pets").select("id").in("id", ids).eq("owner_user_id", userId);
        return error || data?.length !== ids.length ? null : { ownerUserId: userId, allowedPetIds: ids };
      })();
    },
    remember(rows: RoutePhoto[]) { for (const row of rows) photos.set(row.id, row); },
    photoRecords(photoIds: string[]) {
      const ids = [...new Set(photoIds)];
      const missing = ids.filter(id => !photos.has(id) && !photoLoads.has(id));
      // Register every promise before awaiting; concurrent body/candidate reads share in-flight IDs.
      // Serial 64-ID batches bound PostgREST URL length and concurrency for larger books.
      let prior: Promise<unknown> = Promise.resolve();
      for (let offset = 0; offset < missing.length; offset += 64) {
        const batchIds = missing.slice(offset, offset + 64);
        const batch = prior.then(async () => {
          const { data, error } = await supabase.from("photos").select("id, storage_path, thumbnail_path").in("id", batchIds);
          return new Map<string, RoutePhoto>(error ? [] : (data ?? []).map(row => [row.id, row]));
        });
        for (const id of batchIds) photoLoads.set(id, batch.then(rows => rows.get(id) ?? null));
        prior = batch;
      }
      return Promise.all(ids.map(id => photos.has(id) ? Promise.resolve(photos.get(id)!) : photoLoads.get(id)!))
        .then(rows => rows.filter((row): row is RoutePhoto => row !== null));

    },
  };
}
export type RouteReadContext = ReturnType<typeof createRouteReadContext>;
