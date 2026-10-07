export const PRINT_PDF_MAX_BYTES = 50 * 1024 * 1024;

export type PrintPersistenceError = {
  code?: string;
  message?: string;
  status?: number;
};

export type PrintPersistenceStage = "size_check" | "storage_upload" | "snapshot_save" | "snapshot_attach";

type Result<T> = { data: T | null; error: PrintPersistenceError | null };

export type PrintPersistenceDependencies = {
  upload: () => Promise<Result<{ path?: string }>>;
  saveSnapshot: () => Promise<Result<{ id?: string }>>;
  attachPdf: (snapshotId: string) => Promise<Result<{ pdf_path?: string | null; content_hash?: string | null }>>;
  removeObject: () => Promise<void>;
  removeSnapshot: (snapshotId: string) => Promise<void>;
};

export type PrintPersistenceResult =
  | { ok: true; snapshotId: string }
  | { ok: false; stage: PrintPersistenceStage; error: PrintPersistenceError };

async function bestEffort(run: () => Promise<void>) {
  try {
    await run();
  } catch {
    // Preserve the primary failure. Cleanup remains best-effort and idempotent.
  }
}

/**
 * Storage and Postgres cannot share a transaction. Upload first, then create
 * and attach the snapshot. Every later failure compensates the earlier writes.
 */
export async function persistPrintPdf(
  input: { byteSize: number; pdfPath: string; contentHash: string },
  dependencies: PrintPersistenceDependencies,
): Promise<PrintPersistenceResult> {
  if (input.byteSize <= 0 || input.byteSize > PRINT_PDF_MAX_BYTES) {
    return {
      ok: false,
      stage: "size_check",
      error: { code: "PDF_SIZE_INVALID", status: 413, message: `PDF bytes ${input.byteSize} exceed the configured limit` },
    };
  }

  const uploaded = await dependencies.upload();
  if (uploaded.error) return { ok: false, stage: "storage_upload", error: uploaded.error };

  const saved = await dependencies.saveSnapshot();
  if (saved.error || !saved.data?.id) {
    await bestEffort(dependencies.removeObject);
    return {
      ok: false,
      stage: "snapshot_save",
      error: saved.error ?? { code: "SNAPSHOT_ID_MISSING", message: "Snapshot save returned no id" },
    };
  }

  const snapshotId = saved.data.id;
  const attached = await dependencies.attachPdf(snapshotId);
  if (
    attached.error ||
    attached.data?.pdf_path !== input.pdfPath ||
    attached.data?.content_hash !== input.contentHash
  ) {
    await bestEffort(dependencies.removeObject);
    await bestEffort(() => dependencies.removeSnapshot(snapshotId));
    return {
      ok: false,
      stage: "snapshot_attach",
      error: attached.error ?? { code: "SNAPSHOT_ATTACH_MISMATCH", message: "Snapshot did not persist the generated PDF identity" },
    };
  }

  return { ok: true, snapshotId };
}
