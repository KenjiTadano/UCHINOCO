"use server";

import { traceAuthStage } from "@/lib/auth-performance";
import { ownedAlbum, loadPrintInput, imageFacts, fontReadyMap, inspectAlbumPrint as inspectPrint } from "@/lib/album-print/inspection";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FINALIZE_STALE_MESSAGE, decideFinalize } from "@/lib/album-order/finalize";
import { ORDERED_PRINT_MESSAGE } from "@/lib/album-print/config";
import { rememberPrintPdf, recallPrintPdf, takePrintFlight } from "@/lib/album-print/cache";
import { assessPrintQuality, printQualityBlocks } from "@/lib/album-print/quality";
import { persistPrintPdf, type PrintPersistenceError, type PrintPersistenceStage } from "@/lib/album-print/persist";
import { renderDraftPrintPdf } from "@/lib/album-print/render-pdf";
import { buildAlbumPrintSnapshot } from "@/lib/album-print/snapshot";
import { selectPrintSource } from "@/lib/album-print/source";
import type { PrintIssue } from "@/lib/album-print/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

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

function storageError(error: unknown): PrintPersistenceError {
  if (!error || typeof error !== "object") return { code: "UNKNOWN_PRINT_ERROR", message: "Unknown print persistence error" };
  const value = error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };
  const rawStatus = value.status ?? value.statusCode;
  const status = typeof rawStatus === "number" ? rawStatus : typeof rawStatus === "string" ? Number.parseInt(rawStatus, 10) : undefined;
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    status: Number.isFinite(status) ? status : undefined,
  };
}

function logPrintFailure(input: { stage: PrintPersistenceStage | "pdf_render"; error: PrintPersistenceError; pdfBytes: number; uploadTargetPath: string }) {
  if (process.env.NODE_ENV === "production") return;
  console.error("Album print persistence failed", {
    stage: input.stage,
    code: input.error.code,
    message: input.error.message,
    storageStatus: input.error.status,
    generatedPdfByteSize: input.pdfBytes,
    uploadTargetPath: input.uploadTargetPath,
  });
}

async function publicAsset(relative: string) {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", relative)));
  } catch {
    return undefined;
  }
}

export async function generateAlbumPrint(petId: string, albumId: string): Promise<AlbumPrintResult> {
  const owned = await traceAuthStage("print.owned-album", async () => (await ownedAlbum(albumId, petId)));
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, issues: [], fingerprint: null, href: null, contentHash: null, ordered: true, stale: false, snapshotId: null };
  }
  const built = await traceAuthStage("print.active-draft-input", async () => (await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder)));
  if (!built.ok || !built.input) {
    return { ok: false, message: built.message, issues: [], fingerprint: null, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
  }
  const snapshot = buildAlbumPrintSnapshot(built.input);
  return takePrintFlight(albumId, snapshot.fingerprint, async () => {
    const cached = recallPrintPdf(albumId, snapshot.fingerprint);
    if (cached) {
      const { data: row } = await owned.supabase.from("album_print_snapshots").select("id, pdf_path, content_hash").eq("album_id", albumId).eq("fingerprint", snapshot.fingerprint).maybeSingle();
      if (row?.id && row.pdf_path && row.content_hash) {
        return {
          ok: true,
          message: null,
          issues: [],
          fingerprint: snapshot.fingerprint,
          href: fileHref(petId, albumId, snapshot.fingerprint),
          contentHash: row.content_hash,
          ordered: false,
          stale: false,
          snapshotId: row.id,
        };
      }
    }
    const images = await traceAuthStage("print.image-facts", async () => (await imageFacts(built.input!, owned.supabase)));
    const hasCompositionText = snapshot.compositionPlan?.items.some((item) => item.kind === "title" || item.kind === "event") ?? false;
    const styles = [...new Set([...snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId)), ...snapshot.spreads.flatMap((spread) => spread.elements.filter((element) => element.type === "text").map((element) => element.fontId)), ...(hasCompositionText ? ["editorial" as const] : []), "handwritten" as const])];
    const issues = assessPrintQuality(snapshot, images.facts, { fontsReady: await fontReadyMap(styles) });
    if (printQualityBlocks(issues)) {
      return { ok: false, message: "印刷できない項目があります。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    }
    const { data: existingRow } = await owned.supabase.from("album_print_snapshots").select("id, pdf_path, content_hash").eq("album_id", albumId).eq("fingerprint", snapshot.fingerprint).maybeSingle();
    if (existingRow?.pdf_path && existingRow.content_hash) {
      const existing = await downloadPrintFile(existingRow.pdf_path);
      if (existing) {
        rememberPrintPdf(albumId, snapshot.fingerprint, existing);
        return {
          ok: true,
          message: null,
          issues,
          fingerprint: snapshot.fingerprint,
          href: fileHref(petId, albumId, snapshot.fingerprint),
          contentHash: existingRow.content_hash,
          ordered: false,
          stale: false,
          snapshotId: existingRow.id ?? null,
        };
      }
    }
    const overlayName = snapshot.cover.templateId === "simple" ? "simple-overlay.png" : `${snapshot.cover.templateId}-overlay.png`;
    const pdfPath = `drafts/${albumId}/${snapshot.fingerprint}.pdf`;
    let rendered: Awaited<ReturnType<typeof renderDraftPrintPdf>>;
    try {
      rendered = await renderDraftPrintPdf(snapshot, images.bytes, {
        spreadBackground: await publicAsset("album/06_3_album_preview_blank_spread_taller.png"),
        coverBackground: await publicAsset("album/monthly_book_blank_cover.png"),
        coverOverlay: await publicAsset(`album/cover-overlays/${overlayName}`),
      });
    } catch (error) {
      const safe = storageError(error);
      logPrintFailure({ stage: "pdf_render", error: safe, pdfBytes: 0, uploadTargetPath: pdfPath });
      return { ok: false, message: "PDFを作成できません。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
    }
    const admin = createAdminClient();
    const persisted = await persistPrintPdf(
      { byteSize: rendered.bytes.byteLength, pdfPath, contentHash: rendered.contentHash },
      {
        upload: async () => {
          const { data, error } = await admin.storage.from("print-files").upload(pdfPath, rendered.bytes, { contentType: "application/pdf", cacheControl: "3600", upsert: true });
          return { data, error: error ? storageError(error) : null };
        },
        saveSnapshot: async () => {
          const { data, error } = await owned.supabase.rpc("save_album_print_snapshot", {
            p_album_id: albumId,
            p_draft_version_id: snapshot.draftVersionId,
            p_schema_version: snapshot.schemaVersion,
            p_source_revision: snapshot.sourceRevision,
            p_fingerprint: snapshot.fingerprint,
            p_revision_digest: snapshot.revisionDigest,
            p_snapshot: snapshot as unknown as Json,
          });
          return { data: data as { id?: string } | null, error: error ? storageError(error) : null };
        },
        attachPdf: async (snapshotId) => {
          const { data, error } = await owned.supabase.rpc("attach_album_print_pdf", { p_snapshot_id: snapshotId, p_pdf_path: pdfPath, p_content_hash: rendered.contentHash });
          return { data: data as { pdf_path?: string | null; content_hash?: string | null } | null, error: error ? storageError(error) : null };
        },
        removeObject: async () => {
          await admin.storage.from("print-files").remove([pdfPath]);
        },
        removeSnapshot: async (snapshotId) => {
          await admin.from("album_print_snapshots").delete().eq("id", snapshotId).is("pdf_path", null);
        },
      },
    );
    if (!persisted.ok) {
      logPrintFailure({ stage: persisted.stage, error: persisted.error, pdfBytes: rendered.bytes.byteLength, uploadTargetPath: pdfPath });
      return { ok: false, message: "PDFを保存できません。", issues, fingerprint: snapshot.fingerprint, href: null, contentHash: null, ordered: false, stale: false, snapshotId: null };
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
      snapshotId: persisted.snapshotId,
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

export async function startAlbumCheckout(petId: string, albumId: string): Promise<{ ok: boolean; message: string | null; href: string | null }> {
  const owned = await traceAuthStage("print.owned-album", async () => (await ownedAlbum(albumId, petId)));
  if (!owned) return { ok: false, message: "アルバムが見つかりません。", href: null };
  if (selectPrintSource({ albumStatus: owned.album.status, hasPaidOrder: owned.hasPaidOrder }) === "order-snapshot") {
    return { ok: false, message: ORDERED_PRINT_MESSAGE, href: null };
  }
  const built = await traceAuthStage("print.active-draft-input", async () => (await loadPrintInput(owned.supabase, owned.album, owned.hasPaidOrder)));
  if (!built.ok || !built.input) return { ok: false, message: built.message, href: null };
  const snapshot = buildAlbumPrintSnapshot(built.input);
  const images = await traceAuthStage("print.image-facts", async () => (await imageFacts(built.input!, owned.supabase)));
  const styles = [...new Set(snapshot.spreads.flatMap((spread) => spread.texts.map((text) => text.styleId))), "handwritten" as const];
  const issues = assessPrintQuality(snapshot, images.facts, { fontsReady: await fontReadyMap(styles) });
  const { data: row } = await owned.supabase.from("album_print_snapshots").select("id, album_id, draft_version_id, fingerprint, finalized_at, pdf_path").eq("album_id", albumId).eq("fingerprint", snapshot.fingerprint).maybeSingle();
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
    const message = decision.code === "STALE" || decision.code === "MISSING_SNAPSHOT" ? FINALIZE_STALE_MESSAGE : decision.code === "BLOCKING" ? "印刷できない項目があるため、この内容では注文できません。" : "この内容では注文できません。";
    return { ok: false, message, href: null };
  }
  const { error } = await owned.supabase.rpc("finalize_album_print_snapshot", { p_snapshot_id: row!.id });
  if (error) return { ok: false, message: "注文内容を確定できません。", href: null };
  const { recordAlbumAnalyticsEvent } = await import("@/lib/album-analytics-server");
  await recordAlbumAnalyticsEvent({ supabase: owned.supabase, userId: owned.album.owner_user_id, albumId, draftVersionId: snapshot.draftVersionId, eventType: "checkout_started", eventKey: row!.id });
  return { ok: true, message: null, href: `/pets/${petId}/album/${albumId}/product?snapshot=${row!.id}` };
}

export async function inspectAlbumPrint(petId: string, albumId: string): Promise<AlbumPrintResult> {
  return inspectPrint(petId, albumId);
}
