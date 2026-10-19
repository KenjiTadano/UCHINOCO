import "server-only";
import { traceAlbumLoad } from "../album-load-trace.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapDraftCoverRow, toCoverEditor } from "./cover.ts";
import { signedPreviewUrls } from "./read-draft.ts";

/** Reuse this request's draft URLs; sign only cover photographs not already read. */
export async function readDraftCover(supabase: SupabaseClient, versionId: string, previewUrls: Record<string, string>, userId: string) {
  const { data } = await traceAlbumLoad("cover.row", () => supabase.from("album_draft_covers").select("*").eq("draft_version_id", versionId).maybeSingle());
  if (!data) return null;
  const source = mapDraftCoverRow(data);
  const ids = [source.aiPhotoId, source.userPhotoId].filter((id): id is string => Boolean(id));
  const missing = ids.filter(id => !previewUrls[id]);
  const extra = missing.length ? await traceAlbumLoad("cover.missing-urls", () => signedPreviewUrls(supabase, missing, false, userId)) : new Map<string, string>();
  return toCoverEditor(source, Object.fromEntries(ids.map(id => [id, previewUrls[id] ?? extra.get(id)]).filter((entry): entry is [string, string] => Boolean(entry[1]))));
}
