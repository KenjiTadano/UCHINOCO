import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDraft, signedPreviewUrls } from "./read-draft.ts";
import type { AlbumRequestContext, RequestDraftVersion } from "./request-context.ts";
import type { CoverEditorModel } from "./cover.ts";
import type { PersistedDraftView } from "./view.ts";
import type { DraftDelivery, DraftStream } from "./progressive-types.ts";
import { applyPreviewUrls } from "./editor.ts";
import { traceAlbumLoad } from "../album-load-trace.ts";

/** Server-internal: caller must verify album/route-pet access before starting this stream. */
export function streamDraft(supabase: SupabaseClient, context: AlbumRequestContext, albumId: string, version: RequestDraftVersion, cover: CoverEditorModel, seed?: PersistedDraftView): DraftStream {
  const metadata = seed ? Promise.resolve(seed) : readDraft(supabase, albumId, { resolveUrls: false }, context);
  const fail = (): DraftDelivery => ({ ok: false, message: "アルバムが更新されたか、読み込みに失敗しました。再読み込みしてください。" });
  const deliver = async (previous: Promise<DraftDelivery> | null, count: number, stage: "primary" | "nearby" | "complete"): Promise<DraftDelivery> => {
    try {
      const prior = previous ? await previous : null;
      if (prior && !prior.ok) return prior;
      const view = prior?.ok ? prior.view : await metadata;
      if (!view || view.versionId !== version.id || view.revision !== version.revision) return fail();
      const wanted = view.spreads.slice(0, count).flatMap(spread => spread.sourceFrames.flatMap(frame => [frame.aiPhotoId, frame.userPhotoId].filter((id): id is string => Boolean(id))));
      const ids = [...new Set(wanted)].filter(id => !view.thumbnailUrls?.[id]);
      const thumbs = new Map<string, string>();
      const urls = await traceAlbumLoad(`progressive.${stage}.urls`, () => signedPreviewUrls(supabase, ids, false, context.userId, thumbs, context));
      if (ids.some(id => !urls.get(id) || !thumbs.get(id))) return fail();
      // A request cache pins identity; a fresh read detects concurrent edits/version swaps.
      // Explicit signals opt these consistency checks out of Next request fetch deduplication.
      const checkSignal = new AbortController().signal;
      const [current, currentCover] = await traceAlbumLoad(`progressive.${stage}.revision`, () => Promise.all([
        supabase.from("album_draft_versions").select("id, revision").eq("album_id", albumId).eq("is_active", true).abortSignal(checkSignal).maybeSingle(),
        supabase.from("album_draft_covers").select("revision, client_seq").eq("draft_version_id", version.id).abortSignal(checkSignal).maybeSingle(),
      ]));
      if (current.error || currentCover.error || current.data?.id !== version.id || current.data.revision !== version.revision || currentCover.data?.revision !== cover.revision || currentCover.data.client_seq !== cover.clientSeq) return fail();
      const updated = applyPreviewUrls(view, Object.fromEntries(urls));
      return { ok: true, stage, view: { ...updated, thumbnailUrls: { ...view.thumbnailUrls, ...Object.fromEntries(thumbs) }, spreads: updated.spreads.map((spread, index) => ({ ...spread, layoutRanking: view.spreads[index].layoutRanking })) } };
    } catch { return fail(); }
  };
  const primary = deliver(null, 1, "primary");
  const nearby = deliver(primary, 3, "nearby");
  const complete = deliver(nearby, Infinity, "complete");
  return { primary, nearby, complete };
}
