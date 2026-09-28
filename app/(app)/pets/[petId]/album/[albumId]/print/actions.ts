"use server";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadActiveDraft } from "@/app/(app)/album-draft-service";
import { mapDraftCoverRow } from "@/lib/album-persistence/cover";
import { FINALIZE_STALE_MESSAGE, decideFinalize } from "@/lib/album-order/finalize";
import { ORDERED_PRINT_MESSAGE } from "@/lib/album-print/config";
import { rememberPrintPdf, recallPrintPdf, takePrintFlight } from "@/lib/album-print/cache";
import { loadPrintFont } from "@/lib/album-print/fonts";
import { orientedPixelSize } from "@/lib/album-print/crop";
import { acceptOriginalPath, probeRaster } from "@/lib/album-print/images";
import { assessPrintQuality, printQualityBlocks } from "@/lib/album-print/quality";
import { renderDraftPrintPdf } from "@/lib/album-print/render-pdf";
import { buildAlbumPrintSnapshot, draftPrintIsStale, type PrintSnapshotInput } from "@/lib/album-print/snapshot";
import { selectPrintSource } from "@/lib/album-print/source";
import type { PrintIssue } from "@/lib/album-print/types";
import type { TextStyleId } from "@/lib/album-polish/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlbumPrintResult = {
  ok: boolean;
  message: string | null;
  issues: PrintIssue[];
  fingerprint: string | null;
  href: string | null;
  contentHash: string | null;
  ordered: boolean;
  stale: boolean;
  snapshotId: string | null;
};

function monthLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long" });
}

async function ownedAlbum(albumId: string, petId: string) {
  if (!UUID_PATTERN.test(albumId) || !UUID_PATTERN.test(petId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: album } = await supabase
    .from("albums")
    .select("id, status, title, period_from, period_to, pet_id, owner_user_id")
    .eq("id", albumId)
    .eq("pet_id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!album) return null;
  const { data: paid } = await supabase
    .from("orders")
    .select("id")
    .eq("album_id", albumId)
    .eq("owner_user_id", user.id)
    .eq("status", "paid")
    .limit(1);
  return { supabase, album, hasPaidOrder: (paid ?? []).length > 0 };
}

async function publicAsset(relative: string) {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", relative)));
  } catch {
    return undefined;
  }
}

async function fontReadyMap(styleIds: TextStyleId[]) {
  const ready: Partial<Record<TextStyleId, boolean>> = {};
  await Promise.all(
    styleIds.map(async (styleId) => {
      const font = await loadPrintFont(styleId);
      ready[styleId] = font.bytes != null;
    }),
  );
  return ready;
}

export async function inspectAlbumPrint(petId: string, albumId: string): Promise<AlbumPrintResult> {
  const owned = await ownedAlbum(albumId, petId);
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, issues: [], fingerprint: null, href: null, contentHash: null, ordered: true, stale: false, snapshotId: null };
  }
  const built = await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder);
  if (!built.ok || !built.input) {
    return { ok: false, message: built.message, issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  }
  const snapshot = buildAlbumPrintSnapshot(built.input);
  const images = await imageFacts(built.input);
  const styles = [...new Set(snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId))), "handwritten" as const];
  const issues = assessPrintQuality(snapshot, images.facts, { fontsReady: await fontReadyMap(styles) });
  const { data: previous } = await owned.supabase
    .from("album_print_snapshots")
    .select("id, fingerprint")
    .eq("album_id", albumId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

export async function generateAlbumPrint(petId: string, albumId: string): Promise<AlbumPrintResult> {
  const owned = await ownedAlbum(albumId, petId);
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, issues: [], fingerprint: null, href: null, contentHash: null, ordered: true, stale: false, snapshotId: null };
  }
  const built = await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder);
  if (!built.ok || !built.input) {
    return { ok: false, message: built.message, issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  }
  const snapshot = buildAlbumPrintSnapshot(built.input);
  return takePrintFlight(albumId, snapshot.fingerprint, async () => {
    const cached = recallPrintPdf(albumId, snapshot.fingerprint);
    if (cached) {
      const { data: row } = await owned.supabase
        .from("album_print_snapshots")
        .select("id")
        .eq("album_id", albumId)
        .eq("fingerprint", snapshot.fingerprint)
        .maybeSingle();
      return {
        ok: true,
        message: null,
        issues: [],
        fingerprint: snapshot.fingerprint,
        href: fileHref(petId, albumId, snapshot.fingerprint),
        contentHash: null,
        ordered: false,
        stale: false,
        snapshotId: row?.id ?? null,
      };
    }
    const images = await imageFacts(built.input!);
    const styles = [...new Set(snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId))), "handwritten" as const];
    const issues = assessPrintQuality(snapshot, images.facts, { fontsReady: await fontReadyMap(styles) });
    if (printQualityBlocks(issues)) {
      return { ok: false, message: "印刷できない項目があります。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    }
    const { data: saved, error: saveError } = await owned.supabase.rpc("save_album_print_snapshot", {
      p_album_id: albumId,
      p_draft_version_id: snapshot.draftVersionId,
      p_schema_version: snapshot.schemaVersion,
      p_source_revision: snapshot.sourceRevision,
      p_fingerprint: snapshot.fingerprint,
      p_revision_digest: snapshot.revisionDigest,
      p_snapshot: snapshot as unknown as Json,
    });
    if (saveError) {
      return { ok: false, message: "印刷スナップショットを保存できません。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    }
    const savedRow = saved as { id?: string; pdf_path?: string | null; content_hash?: string | null } | null;
    if (savedRow?.pdf_path && savedRow.content_hash) {
      const existing = await downloadPrintFile(savedRow.pdf_path);
      if (existing) {
        rememberPrintPdf(albumId, snapshot.fingerprint, existing);
        return {
          ok: true,
          message: null,
          issues,
          fingerprint: snapshot.fingerprint,
          href: fileHref(petId, albumId, snapshot.fingerprint),
          contentHash: savedRow.content_hash,
          ordered: false,
          stale: false,
          snapshotId: savedRow.id ?? null,
        };
      }
    }
    const overlayName = snapshot.cover.templateId === "simple" ? "simple-overlay.png" : `${snapshot.cover.templateId}-overlay.png`;
    const rendered = await renderDraftPrintPdf(snapshot, images.bytes, {
      spreadBackground: await publicAsset("album/06_3_album_preview_blank_spread_taller.png"),
      coverBackground: await publicAsset("album/monthly_book_blank_cover.png"),
      coverOverlay: await publicAsset(`album/cover-overlays/${overlayName}`),
    });
    const pdfPath = `drafts/${albumId}/${snapshot.fingerprint}.pdf`;
    const admin = createAdminClient();
    const uploaded = await admin.storage.from("print-files").upload(pdfPath, rendered.bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploaded.error) {
      return { ok: false, message: "PDFを保存できません。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    }
    if (savedRow?.id) {
      await owned.supabase.rpc("attach_album_print_pdf", {
        p_snapshot_id: savedRow.id,
        p_pdf_path: pdfPath,
        p_content_hash: rendered.contentHash,
      });
    }
    rememberPrintPdf(albumId, snapshot.fingerprint, rendered.bytes);
    if (process.env.NODE_ENV !== "production") {
      await writeFile(path.join(process.cwd(), "docs", "print-064-book.pdf"), rendered.bytes);
    }
    return {
      ok: true,
      message: null,
      issues,
      fingerprint: snapshot.fingerprint,
      href: fileHref(petId, albumId, snapshot.fingerprint),
      contentHash: rendered.contentHash,
      ordered: false,
      stale: false,
      snapshotId: savedRow?.id ?? null,
    };
  });
}

function fileHref(petId: string, albumId: string, fingerprint: string) {
  return `/pets/${petId}/album/${albumId}/print/file?fingerprint=${fingerprint}`;
}

async function downloadPrintFile(pdfPath: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("print-files").download(pdfPath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function loadPrintInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  album: { id: string; status: string; period_to: string | null; period_from: string | null },
  hasPaidOrder: boolean,
): Promise<{ ok: boolean; message: string | null; input: PrintSnapshotInput | null }> {
  const loaded = await loadActiveDraft(album.id);
  if (!loaded.view) return { ok: false, message: loaded.message ?? "保存された初稿がありません。", input: null };
  const { data: coverRow } = await supabase
    .from("album_draft_covers")
    .select("*")
    .eq("draft_version_id", loaded.view.versionId)
    .maybeSingle();
  const photoIds = [
    ...loaded.view.spreads.flatMap((spread) => spread.sourceFrames.map((frame) => frame.aiPhotoId)),
    ...loaded.view.spreads.flatMap((spread) => spread.sourceFrames.map((frame) => frame.userPhotoId).filter((id): id is string => Boolean(id))),
  ];
  if (coverRow?.ai_photo_id) photoIds.push(coverRow.ai_photo_id);
  if (coverRow?.user_photo_id) photoIds.push(coverRow.user_photo_id);
  const { data: photos } = await supabase.from("photos").select("id, storage_path").in("id", [...new Set(photoIds)]);
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
      spreads: loaded.view.spreads.map((spread) => ({
        source: spread.source,
        frames: spread.sourceFrames,
        texts: spread.texts,
        decorations: spread.decorations,
      })),
      originals,
    },
  };
}

async function imageFacts(input: PrintSnapshotInput) {
  const admin = createAdminClient();
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
  await Promise.all(
    [...ids].map(async (photoId) => {
      const storagePath = acceptOriginalPath(input.originals[photoId]?.storagePath);
      if (!storagePath) {
        facts[photoId] = null;
        return;
      }
      const downloaded = await admin.storage.from("pet-photos").download(storagePath);
      if (downloaded.error || !downloaded.data) {
        facts[photoId] = null;
        return;
      }
      const file = new Uint8Array(await downloaded.data.arrayBuffer());
      const probe = probeRaster(file);
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

export async function startAlbumCheckout(petId: string, albumId: string): Promise<{ ok: boolean; message: string | null; href: string | null }> {
  const owned = await ownedAlbum(albumId, petId);
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", href: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, href: null };
  }
  const built = await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder);
  if (!built.ok || !built.input) return { ok: false, message: built.message, href: null };
  const snapshot = buildAlbumPrintSnapshot(built.input);
  const images = await imageFacts(built.input);
  const styles = [...new Set(snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId))), "handwritten" as const];
  const issues = assessPrintQuality(snapshot, images.facts, { fontsReady: await fontReadyMap(styles) });
  const { data: row } = await owned.supabase
    .from("album_print_snapshots")
    .select("id, album_id, draft_version_id, fingerprint, finalized_at, pdf_path")
    .eq("album_id", albumId)
    .eq("fingerprint", snapshot.fingerprint)
    .maybeSingle();
  const decision = decideFinalize({
    actorId: owned.album.owner_user_id,
    albumId,
    albumStatus: owned.album.status,
    hasActiveDraft: true,
    saveState: "saved",
    blocking: printQualityBlocks(issues),
    currentFingerprint: snapshot.fingerprint,
    currentDraftVersionId: snapshot.draftVersionId,
    snapshot: row
      ? {
          id: row.id,
          albumId: row.album_id,
          ownerId: owned.album.owner_user_id,
          draftVersionId: row.draft_version_id,
          fingerprint: row.fingerprint,
          finalizedAt: row.finalized_at,
          pdfPath: row.pdf_path,
        }
      : null,
  });
  if (!decision.ok) {
    const message = decision.code === "STALE" || decision.code === "MISSING_SNAPSHOT"
      ? FINALIZE_STALE_MESSAGE
      : decision.code === "BLOCKING"
        ? "印刷できない項目があるため、この内容では注文できません。"
        : "この内容では注文できません。";
    return { ok: false, message, href: null };
  }
  const { error } = await owned.supabase.rpc("finalize_album_print_snapshot", { p_snapshot_id: row!.id });
  if (error) return { ok: false, message: "注文内容を確定できません。", href: null };
  return { ok: true, message: null, href: `/pets/${petId}/album/${albumId}/product?snapshot=${row!.id}` };
}
