import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDraft, signedPreviewUrls } from "./read-draft";
import { applyPreviewUrls } from "./editor";
import { mapDraftCoverRow, toCoverEditor } from "./cover";
import { traceRouteLoader } from "./route-loader-trace";
import type { RouteReadContext } from "./route-read-context";

/** One active version, concurrent body/cover metadata, one union of effective/reset paths. */
export async function loadRouteDraft(supabase: SupabaseClient, context: RouteReadContext, includeLegacyCover = false) {
  const version = await context.version();
  if (!version) return { draft: null, cover: null, coverSrc: null };
  const [draft, coverResult] = await Promise.all([
    traceRouteLoader("body-metadata", () => readDraft(supabase, context.album.id, { resolveUrls: false }, context)),
    traceRouteLoader("cover", () => supabase.from("album_draft_covers").select("*").eq("draft_version_id", version.id).maybeSingle()),
  ]);
  if (!draft) return { draft: null, cover: null, coverSrc: null };
  const source = coverResult.data ? mapDraftCoverRow(coverResult.data) : null;
  const coverIds = (source ? [source.aiPhotoId, source.userPhotoId] : includeLegacyCover ? [context.album.cover_photo_id] : []).filter((id): id is string => Boolean(id));
  const ids = [...draft.spreads.flatMap(spread => spread.sourceFrames.flatMap(frame => [frame.aiPhotoId, frame.userPhotoId])),
    ...coverIds].filter((id): id is string => Boolean(id));
  const urls = await traceRouteLoader("signing", () => signedPreviewUrls(supabase, ids, false, context));
  const coverUrls = new Map(coverIds.flatMap(id => urls.has(id) ? [[id, urls.get(id)!] as const] : []));
  const cover = source ? toCoverEditor(source, Object.fromEntries(coverUrls)) : null;
  const resolved = applyPreviewUrls(draft, Object.fromEntries(urls));
  resolved.spreads = resolved.spreads.map((spread, index) => ({ ...spread, layoutRanking: draft.spreads[index].layoutRanking }));
  return { draft: resolved, cover,
    coverSrc: cover?.previewUrl ?? (context.album.cover_photo_id ? coverUrls.get(context.album.cover_photo_id) : null) ?? null };
}
