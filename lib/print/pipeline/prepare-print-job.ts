import "server-only";

import { createAdminClient } from "@/lib/supabase/admin.ts";
import { PHOTOBOOK_PRODUCTS } from "@/lib/photobook-products.ts";
import { buildPrintDocument } from "../document-builder.ts";
import { generatePrintPdfs } from "../pdf/pdf-generator.ts";
import { SupabaseImageLoader } from "../pdf/supabase-image-loader.ts";
import { SupabasePrintFileStore } from "../pdf/print-file-store.ts";
import { SAFE_ERROR_CODES } from "../pdf/errors.ts";
import type { DpiWarning } from "../document-types.ts";
import type { StoredPrintFile } from "../pdf/print-file-store.ts";

export type PrepareResult = {
  jobId: string;
  orderId: string;
  cover: StoredPrintFile;
  content: StoredPrintFile;
  warnings: DpiWarning[];
};

// Worker holds a lease for this long before another worker may re-claim.
export const LEASE_TIMEOUT_MINUTES = 15;
const LEASE_TIMEOUT_MS = LEASE_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Prepare a queued print job: load images → generate PDFs → store in print-files.
 * Does NOT submit to the print provider.
 *
 * Security: server-only, service-role. Never called directly by clients.
 *
 * Concurrency / crash recovery:
 *   Claim  — atomically sets preparation_started_at (claim token) when the job is
 *             unclaimed or its lease has expired. prepared_at stays NULL.
 *   Success — sets prepared_at (the true "done" marker), clears preparation_started_at.
 *             Guarded by .eq("preparation_started_at", claimedAt) so a stale worker
 *             that finished after lease expiry cannot overwrite the new holder's work.
 *   Failure — resets both to NULL so the same row can be retried externally.
 *   Retry   — caller sets status back to 'queued'; no new row is created.
 */
export async function preparePrintJob(printJobId: string): Promise<PrepareResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const leaseExpiry = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();

  // Atomic claim: set preparation_started_at when:
  //   status = 'queued'  AND  prepared_at IS NULL  AND
  //   (preparation_started_at IS NULL  OR  preparation_started_at < leaseExpiry)
  const { data: claimed } = await admin
    .from("print_jobs")
    .update({
      preparation_started_at: now,
      updated_at: now,
    })
    .eq("id", printJobId)
    .eq("status", "queued")
    .is("prepared_at", null)
    .or(`preparation_started_at.is.null,preparation_started_at.lt.${leaseExpiry}`)
    .select("id, order_id, preparation_started_at")
    .maybeSingle();

  if (!claimed) {
    throw new Error(
      `Print job ${printJobId} could not be claimed — already processing or not in queued state`,
    );
  }

  const orderId = claimed.order_id;
  // Stale-worker guard token: the value we just wrote.
  const claimedAt = claimed.preparation_started_at as string;

  try {
    // Load order snapshot (admin client — ownership established at payment time)
    const { data: order } = await admin
      .from("orders")
      .select("id, product_id, pages, album_title_snapshot, cover_original_path_snapshot")
      .eq("id", orderId)
      .single();

    if (!order) throw new Error(`Order ${orderId} not found`);

    const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === order.product_id);
    if (!product) throw new Error(`Product ${order.product_id} not found in config`);

    // order_photos only — never album_photos
    const { data: rawPhotos } = await admin
      .from("order_photos")
      .select("photo_id, position, original_path")
      .eq("order_id", orderId)
      .order("position", { ascending: true });

    const photos = rawPhotos ?? [];

    const spec = buildPrintDocument({
      orderId,
      album_title_snapshot: order.album_title_snapshot,
      cover_original_path_snapshot: order.cover_original_path_snapshot,
      pages: order.pages,
      productId: product.id,
      printWidthMm: product.printWidthMm,
      printHeightMm: product.printHeightMm,
      bleedMm: product.bleedMm,
      orderPhotos: photos.map((p) => ({
        photoId: p.photo_id,
        position: p.position,
        original_path: p.original_path,
      })),
    });

    const loader = new SupabaseImageLoader();
    const { result, warnings } = await generatePrintPdfs(spec, { loader });

    const store = new SupabasePrintFileStore();
    const [cover, content] = await Promise.all([
      store.save(orderId, result.cover),
      store.save(orderId, result.content),
    ]);

    const completionTime = new Date().toISOString();
    // Stale-worker guard: only write back if we still hold the lease.
    // If our lease expired and another worker re-claimed, this update touches 0 rows.
    await admin
      .from("print_jobs")
      .update({
        cover_file_path: cover.path,
        content_file_path: content.path,
        prepared_at: completionTime,
        preparation_started_at: null,
        updated_at: completionTime,
      })
      .eq("id", printJobId)
      .eq("preparation_started_at", claimedAt);

    return { jobId: printJobId, orderId, cover, content, warnings };
  } catch (err) {
    // Sanitize error code — never persist PII, paths, or stack traces
    const rawCode = (err as { code?: string }).code ?? "";
    const safeCode = SAFE_ERROR_CODES.has(rawCode) ? rawCode : "PDF_GENERATION_FAILED";

    await admin
      .from("print_jobs")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_code: safeCode,
        prepared_at: null,
        preparation_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", printJobId)
      .eq("preparation_started_at", claimedAt);

    throw err;
  }
}
