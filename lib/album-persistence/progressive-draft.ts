import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDraft, signedPreviewUrls } from "./read-draft.ts";
import type { AlbumRequestContext, RequestDraftVersion } from "./request-context.ts";
import type { CoverEditorModel } from "./cover.ts";
import type { PersistedDraftView } from "./view.ts";
import type { DraftDelivery, DraftPin, DraftStage, DraftStream } from "./progressive-types.ts";
import { traceAlbumLoad } from "../album-load-trace.ts";
import { observeIo } from "../server-io-observer.ts";
import { baselineProgressiveDelivery } from "../auth-performance-core.ts";
import { streamBaselineDraft } from "./progressive-baseline.ts";

/** Caller authorizes album/route-pet first. Everything here belongs to this request/user. */
export function streamDraft(supabase: SupabaseClient, context: AlbumRequestContext, albumId: string, version: RequestDraftVersion, cover: CoverEditorModel | Promise<CoverEditorModel | null>, seed?: PersistedDraftView, prepared?: Promise<PersistedDraftView | null>, initialMetadataDelivered = false): DraftStream {
  if (baselineProgressiveDelivery() && !("then" in cover)) return streamBaselineDraft(supabase, context, albumId, version, cover, seed);
  const versionPin = Object.freeze({ versionId: version.id, revision: version.revision });
  const pinned = Promise.resolve(cover).then(value => {
    if (!value) throw Error("missing cover");
    return Object.freeze({ ...versionPin, coverRevision: value.revision, coverClientSeq: value.clientSeq }) satisfies DraftPin;
  });
  void pinned.catch(() => {});
  const fail = (): DraftDelivery => ({ ok: false, message: "アルバムが更新されたか、読み込みに失敗しました。再読み込みしてください。" });
  const metadata = (async () => {
    observeIo(supabase, "progressive.metadata");
    const view = seed ?? (prepared ? await prepared : await readDraft(supabase, albumId, { resolveUrls: false }, context));
    if (!view || view.versionId !== versionPin.versionId || view.revision !== versionPin.revision) throw Error("draft changed");
    const seen = new Set(Object.keys(view.thumbnailUrls ?? {}));
    const groups = [view.spreads.slice(0, 1), view.spreads.slice(1, 3), view.spreads.slice(3)].map(spreads => spreads.flatMap(spread => spread.sourceFrames.flatMap(frame => [frame.aiPhotoId, frame.userPhotoId].filter((id): id is string => Boolean(id)))).filter(id => { if (seen.has(id)) return false; seen.add(id); return true; }));
    // Populate all path promises in a single batch; subsequent signing never SELECTs paths again.
    await traceAlbumLoad("progressive.photo-metadata", () => context.photoRecords(groups.flat()));
    return { view, groups };
  })();
  const validate = async () => {
    const pin = await pinned;
    observeIo(supabase, "progressive.revision-check");
    // One fresh RLS-protected SELECT gives cover + active version from the same DB statement.
    const { data, error } = await traceAlbumLoad("progressive.revision", () => supabase.from("album_draft_covers")
      .select("revision, client_seq, album_draft_versions!inner(id, revision, is_active, album_id)")
      .eq("draft_version_id", pin.versionId).eq("album_draft_versions.album_id", albumId).eq("album_draft_versions.is_active", true)
      .abortSignal(new AbortController().signal).maybeSingle());
    const related = data?.album_draft_versions as unknown as { id: string; revision: number; is_active: boolean; album_id: string } | { id: string; revision: number; is_active: boolean; album_id: string }[] | null;
    const active = Array.isArray(related) ? related.length === 1 ? related[0] : null : related;
    return !error && active?.id === pin.versionId && active.revision === pin.revision && active.is_active === true && active.album_id === albumId && data?.revision === pin.coverRevision && data.client_seq === pin.coverClientSeq;
  };
  const sign = async (ids: string[], stage: DraftStage) => {
    const thumbnails = new Map<string, string>();
    const urls = await traceAlbumLoad(`progressive.${stage}.urls`, () => signedPreviewUrls(supabase, ids, false, context.userId, thumbnails, context));
    if (ids.some(id => !urls.get(id) || !thumbnails.get(id))) throw Error("missing private image");
    return { urls: Object.fromEntries(urls), thumbnails: Object.fromEntries(thumbnails) };
  };
  const primary = (async (): Promise<DraftDelivery> => {
    try {
      const { view, groups } = await metadata;
      const additions = await sign(groups[0], "primary");
      if (!await validate()) return fail();
      observeIo(supabase, "progressive.phase");
      return { ok: true, stage: "primary", pin: await pinned, base: seed || initialMetadataDelivered ? undefined : view, ...additions };
    } catch { return fail(); }
  })();
  const tail = (async () => {
    const first = await primary;
    if (!first.ok) return null;
    try {
      const { groups } = await metadata;
      // Exactly two bounded groups; neither waits for the other's network roundtrips.
      const [nearby, remaining] = await Promise.all([sign(groups[1], "nearby"), sign(groups[2], "complete")]);
      if (!await validate()) return null;
      return { nearby, remaining };
    } catch { return null; }
  })();
  const finish = async (stage: "nearby" | "complete"): Promise<DraftDelivery> => {
    const result = await tail;
    if (!result) return fail();
    observeIo(supabase, "progressive.phase");
    return { ok: true, stage, pin: await pinned, ...(stage === "nearby" ? result.nearby : result.remaining) };
  };
  return { primary, nearby: finish("nearby"), complete: finish("complete") };
}
