import "server-only";
import { ioVariant, ioWork, observeIo } from "../server-io-observer.ts";
import { traceAuthStage } from "@/lib/auth-performance";
import { loadActiveDraft } from "@/app/(app)/album-draft-service";
import { mapDraftCoverRow, toCoverEditor } from "@/lib/album-persistence/cover";
import { readDraft, signedPreviewUrls } from "@/lib/album-persistence/read-draft";
import { createAlbumRequestContext, type AlbumRequestContext } from "@/lib/album-persistence/request-context";
import type { PersistedDraftView } from "@/lib/album-persistence/view";
import { createClient } from "@/lib/supabase/server";
import { ORDERED_PRINT_MESSAGE } from "@/lib/album-print/config";
import { loadPrintFont } from "@/lib/album-print/fonts";
import { orientedPixelSize } from "@/lib/album-print/crop";
import { acceptOriginalPath, probeRaster } from "@/lib/album-print/images";
import { assessPrintQuality } from "@/lib/album-print/quality";
import { buildAlbumPrintSnapshot, draftPrintIsStale, type PrintSnapshotInput } from "@/lib/album-print/snapshot";
import { selectPrintSource } from "@/lib/album-print/source";
import type { TextStyleId } from "@/lib/album-polish/types";
import type { AlbumPrintResult } from "@/app/(app)/pets/[petId]/album/[albumId]/print/actions";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function monthLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long" });
}

export async function ownedAlbum(albumId: string, petId: string) {
  if (!UUID_PATTERN.test(albumId) || !UUID_PATTERN.test(petId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: album } = await supabase.from("albums").select("id, status, title, period_from, period_to, pet_id, owner_user_id").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!album) return null;
  const { data: paid } = await supabase.from("orders").select("id").eq("album_id", albumId).eq("owner_user_id", user.id).eq("status", "paid").limit(1);
  return { supabase, album, userId: user.id, hasPaidOrder: (paid ?? []).length > 0 };
}

export async function fontReadyMap(styleIds: TextStyleId[], observer?: object) {
  const ready: Partial<Record<TextStyleId, boolean>> = {};
  await Promise.all(
    styleIds.map(async (styleId) => {
      const font = await loadPrintFont(styleId, observer);
      ready[styleId] = font.bytes != null;
    }),
  );
  return ready;
}

export async function inspectAlbumPrint(petId: string, albumId: string): Promise<AlbumPrintResult> {
  const owned = await traceAuthStage("print.owned-album", async () => (await ownedAlbum(albumId, petId)));
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, issues: [], fingerprint: null, href: null, contentHash: null, ordered: true, stale: false, snapshotId: null };
  }
  const built = await traceAuthStage("print.active-draft-input", async () => (await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder)));
  if (!built.ok || !built.input) {
    return { ok: false, message: built.message, issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  }
  return inspectPrintInput(owned.supabase, built.input);
}

async function inspectPrintInput(supabase: Awaited<ReturnType<typeof createClient>>, input: PrintSnapshotInput, fontWarmup?: Promise<unknown>): Promise<AlbumPrintResult> {
  const snapshot = await traceAuthStage("print.snapshot", async () => buildAlbumPrintSnapshot(input));
  const imagesPromise = traceAuthStage("print.image-facts", () => imageFacts(input, supabase));
  const previousPromise = traceAuthStage("print.previous-snapshot", async () => await supabase.from("album_print_snapshots").select("id, fingerprint").eq("album_id", input.albumId).order("created_at", { ascending: false }).limit(1).maybeSingle());
  const hasCompositionText = snapshot.compositionPlan?.items.some((item) => item.kind === "title" || item.kind === "event") ?? false;
  const styles = [...new Set([...snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId)), ...snapshot.spreads.flatMap((spread) => spread.elements.filter((element) => element.type === "text").map((element) => element.fontId)), ...(hasCompositionText ? ["editorial" as const] : []), "handwritten" as const])];
  const [images, fontsReady, { data: previous }] = await Promise.all([imagesPromise, traceAuthStage("print.fonts", async () => { await fontWarmup; return fontReadyMap(styles, supabase); }), previousPromise]);
  const issues = await traceAuthStage("print.quality", async () => assessPrintQuality(snapshot, images.facts, { fontsReady }));
  const stale = previous ? draftPrintIsStale({ fingerprint: previous.fingerprint }, snapshot) : false;
  return {
    ok: true,
    message: stale ? "プレビュー作成後に編集されています" : null,
    issues,
    fingerprint: snapshot.fingerprint,
    href: null,
    contentHash: null,
    ordered: false,
    stale,
    snapshotId: stale ? null : ((previous as { id?: string } | null)?.id ?? null),
  };
}

export async function loadPrintInput(supabase: Awaited<ReturnType<typeof createClient>>, album: { id: string; status: string; period_to: string | null; period_from: string | null }, hasPaidOrder: boolean, shared?: { view: PersistedDraftView; coverRow: Record<string, unknown> | null; context?: AlbumRequestContext }): Promise<{ ok: boolean; message: string | null; input: PrintSnapshotInput | null }> {
  const loaded = shared ? { view: shared.view, message: null } : await traceAuthStage("print.read-draft", () => loadActiveDraft(album.id));
  if (!loaded.view) return { ok: false, message: loaded.message ?? "保存された初稿がありません。", input: null };
  const { data: coverRow } = shared ? { data: shared.coverRow } : await traceAuthStage("print.cover", async () => await supabase.from("album_draft_covers").select("*").eq("draft_version_id", loaded.view!.versionId).maybeSingle());
  const photoIds = [...loaded.view.spreads.flatMap((spread) => spread.sourceFrames.map((frame) => frame.aiPhotoId)), ...loaded.view.spreads.flatMap((spread) => spread.sourceFrames.map((frame) => frame.userPhotoId).filter((id): id is string => Boolean(id)))];
  if (coverRow?.ai_photo_id) photoIds.push(String(coverRow.ai_photo_id));
  if (coverRow?.user_photo_id) photoIds.push(String(coverRow.user_photo_id));
  const { data: photos } = await traceAuthStage("print.photos", async () => shared?.context ? { data: await shared.context.photoRecords(photoIds) } : await supabase
    .from("photos")
    .select("id, storage_path")
    .in("id", [...new Set(photoIds)]));
  const originals: PrintSnapshotInput["originals"] = {};
  for (const photo of photos ?? []) originals[photo.id] = { storagePath: photo.storage_path };
  return {
    ok: true,
    message: null,
    input: {
      albumId: album.id,
      albumStatus: album.status,
      hasPaidOrder,
      draftVersionId: loaded.view.versionId,
      draftRevision: loaded.view.revision,
      generatedAt: new Date().toISOString(),
      dateLabel: monthLabel(album.period_to ?? album.period_from),
      cover: coverRow ? mapDraftCoverRow(coverRow as unknown as Record<string, unknown>) : null,
      compositionPlan: loaded.view.compositionPlan,
      spreads: loaded.view.spreads.map((spread) => ({
        source: spread.source,
        frames: spread.sourceFrames,
        texts: spread.texts,
        decorations: spread.decorations,
        elements: spread.elements,
        backgrounds: spread.backgrounds,
      })),
      originals,
    },
  };
}

export async function imageFacts(input: PrintSnapshotInput, supabase: Awaited<ReturnType<typeof createClient>>) {
  // Original reads use the verified owner session and Storage RLS, including secondary pets.
  const ids = new Set<string>();
  for (const spread of input.spreads) {
    for (const frame of spread.frames) {
      const photoId = frame.userPhotoId || frame.aiPhotoId;
      if (photoId) ids.add(photoId);
    }
  }
  if (input.cover?.userPhotoId || input.cover?.aiPhotoId) ids.add((input.cover.userPhotoId || input.cover.aiPhotoId) as string);
  const facts: Record<string, { width: number; height: number; broken: boolean } | null> = {};
  const bytes: Record<string, Uint8Array> = {};
  const downloads = new Map<string, Promise<{ data: Blob | null; error: unknown }>>();
  let activeDownloads = 0;
  await Promise.all(
    [...ids].map(async (photoId) => {
      const storagePath = acceptOriginalPath(input.originals[photoId]?.storagePath);
      if (!storagePath) {
        facts[photoId] = null;
        return;
      }
      let download = downloads.get(storagePath);
      if (download) observeIo(supabase, "print.original.local.hit");
      else {
        download = ioWork(supabase, "print.original.download", 1, async () => {
          activeDownloads++; observeIo(supabase, "print.original.active", activeDownloads);
          try { return await traceAuthStage("print.image-download", async () => (await supabase.storage.from("pet-photos").download(storagePath))); }
          finally { activeDownloads--; }
        });
        downloads.set(storagePath, download);
      }
      const downloaded = await download;
      if (downloaded.error || !downloaded.data) {
        facts[photoId] = null;
        return;
      }
      const file = new Uint8Array(await downloaded.data.arrayBuffer());
      const probe = await ioWork(supabase, "print.original.probe", 1, () => traceAuthStage("print.raster-orientation", async () => probeRaster(file)));
      if (!probe) {
        facts[photoId] = { width: 0, height: 0, broken: true };
        return;
      }
      const oriented = orientedPixelSize(probe.width, probe.height, probe.orientation);
      bytes[photoId] = file;
      facts[photoId] = { width: oriented.width, height: oriented.height, broken: false };
    }),
  );
  return { facts, bytes };
}
/** Server-internal GET loader. No trusted input is accepted from a Server Action. */
export async function loadPrintPreviewData(petId: string, albumId: string) {
  const owned = await traceAuthStage("print.owned-album", () => ownedAlbum(albumId, petId));
  if (!owned) return null;
  const { supabase, album, userId } = owned;
  // Static build assets only; overlap cold font I/O with the verified draft reads.
  const fontWarmup = ioVariant(supabase) === "candidate" ? traceAuthStage("print.font-warmup", () => fontReadyMap(["editorial", "warm", "minimal", "handwritten"], supabase)) : undefined;
  const context = createAlbumRequestContext(supabase, userId);
  const [petResult, { view, coverRow }] = await Promise.all([
    traceAuthStage("print.pet", async () => await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", userId).maybeSingle()),
    (async () => {
      const version = await context.version(albumId);
      if (!version) return { view: null, coverRow: null };
      // One pinned version for both reads. Cover does not depend on URL signing.
      const [view, { data: coverRow }] = await Promise.all([
        traceAuthStage("print.read-draft", () => readDraft(supabase, albumId, undefined, context)),
        traceAuthStage("print.cover", async () => await supabase.from("album_draft_covers").select("*").eq("draft_version_id", version.id).maybeSingle()),
      ]);
      return { view, coverRow };
    })(),
  ]);
  if (!petResult.data) return null;
  const coverPromise = traceAuthStage("print.cover-urls", async () => {
    if (!coverRow || !view) return null;
    const row = mapDraftCoverRow(coverRow);
    const ids = [row.aiPhotoId, row.userPhotoId].filter((id): id is string => Boolean(id));
    const missing = ids.filter(id => !view.previewUrls[id]);
    observeIo(supabase, "draft.cover", new Set(ids).size);
    observeIo(supabase, "draft.cover.missing", new Set(missing).size);
    const extra = missing.length ? await signedPreviewUrls(supabase, missing, false, userId) : new Map<string, string>();
    return toCoverEditor(row, { ...view.previewUrls, ...Object.fromEntries(extra) });
  });
  const inspectionPromise = (async (): Promise<AlbumPrintResult> => {
    if (selectPrintSource({ albumStatus: album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
      return { ok: false, message: ORDERED_PRINT_MESSAGE, issues: [], fingerprint: null, href: null, contentHash: null, ordered: true, stale: false, snapshotId: null };
    }
    if (!view) return { ok: false, message: "保存された初稿がありません。", issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    const built = await traceAuthStage("print.input", () => loadPrintInput(supabase, album, owned.hasPaidOrder, { view, coverRow, context }));
    if (!built.input) return { ok: false, message: built.message, issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    return inspectPrintInput(supabase, built.input, fontWarmup);
  })();
  const [cover, inspection] = await Promise.all([coverPromise, inspectionPromise]);
  return { supabase, userId, album, pet: petResult.data, view, cover, inspection };
}
