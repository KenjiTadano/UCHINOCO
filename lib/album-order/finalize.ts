/**
 * Binds a finalized print snapshot to an order.
 * The order's source of truth is that snapshot, not the live draft.
 */

export const FINALIZE_STALE_MESSAGE =
  "編集内容が変更されています。最新の印刷プレビューを作り直してください。";

export type SaveState = "idle" | "saving" | "saved" | "error";

export type FinalizeCode =
  | "OK"
  | "OWNER"
  | "ORDERED"
  | "NO_DRAFT"
  | "UNSAVED"
  | "SAVE_ERROR"
  | "MISSING_SNAPSHOT"
  | "STALE"
  | "BLOCKING"
  | "CROSS_BINDING";

export type PrintSnapshotRef = {
  id: string;
  albumId: string;
  ownerId: string;
  draftVersionId: string;
  fingerprint: string;
  finalizedAt: string | null;
  pdfPath: string | null;
};

export type FinalizeInput = {
  actorId: string;
  albumId: string;
  albumStatus: string;
  hasActiveDraft: boolean;
  saveState: SaveState;
  blocking: boolean;
  currentFingerprint: string | null;
  currentDraftVersionId: string | null;
  snapshot: PrintSnapshotRef | null;
};

export function decideFinalize(input: FinalizeInput): { ok: boolean; code: FinalizeCode } {
  if (input.snapshot && (input.snapshot.ownerId !== input.actorId || input.snapshot.albumId !== input.albumId)) {
    return { ok: false, code: "OWNER" };
  }
  if (input.albumStatus === "ordered") return { ok: false, code: "ORDERED" };
  if (!input.hasActiveDraft) return { ok: false, code: "NO_DRAFT" };
  if (input.saveState === "saving") return { ok: false, code: "UNSAVED" };
  if (input.saveState === "error") return { ok: false, code: "SAVE_ERROR" };
  if (input.blocking) return { ok: false, code: "BLOCKING" };
  if (!input.snapshot || !input.snapshot.pdfPath) return { ok: false, code: "MISSING_SNAPSHOT" };
  if (
    input.snapshot.fingerprint !== input.currentFingerprint ||
    input.snapshot.draftVersionId !== input.currentDraftVersionId
  ) {
    return { ok: false, code: "STALE" };
  }
  return { ok: true, code: "OK" };
}

/** Warnings never block. Blocking codes do. */
export function warningsAllowOrder(codes: string[]): boolean {
  const blocking = new Set(["MISSING_IMAGE", "BROKEN_IMAGE", "FONT_MISSING", "TEXT_OVERFLOW", "INVALID_PRINT_GEOMETRY", "INVALID_DECORATION"]);
  return codes.every((code) => !blocking.has(code));
}

export type OrderPrintBinding = {
  albumId: string;
  draftVersionId: string;
  printSnapshotId: string;
  printFingerprint: string;
  price: number;
};

export function bindOrderToSnapshot(input: {
  actorId: string;
  albumId: string;
  snapshot: PrintSnapshotRef;
  serverPrice: number;
  clientPrice: number | null;
}): { ok: true; binding: OrderPrintBinding } | { ok: false; code: "OWNER" | "CROSS_BINDING" | "NOT_FINAL" } {
  if (input.snapshot.ownerId !== input.actorId || input.snapshot.albumId !== input.albumId) {
    return { ok: false, code: "OWNER" };
  }
  if (!input.snapshot.finalizedAt) return { ok: false, code: "NOT_FINAL" };
  if (input.clientPrice != null && input.clientPrice !== input.serverPrice) {
    // The client figure is discarded. The binding keeps the server price.
  }
  return {
    ok: true,
    binding: {
      albumId: input.snapshot.albumId,
      draftVersionId: input.snapshot.draftVersionId,
      printSnapshotId: input.snapshot.id,
      printFingerprint: input.snapshot.fingerprint,
      price: input.serverPrice,
    },
  };
}

export function reusePendingOrder(
  existing: { printSnapshotId: string | null; status: string } | null,
  snapshotId: string | null,
): "reuse" | "replace" | "create" {
  if (!existing || existing.status !== "pending") return "create";
  if ((existing.printSnapshotId ?? null) === (snapshotId ?? null)) return "reuse";
  return "replace";
}

/** Metadata and the success URL do not decide the snapshot or paid state. */
export function webhookKeepsBinding(input: {
  orderAlbumId: string;
  orderSnapshotId: string | null;
  orderFingerprint: string | null;
  storedSnapshotAlbumId: string | null;
  storedFingerprint: string | null;
  metadataSnapshotId: string | null;
  successUrlClaimsPaid: boolean;
}): boolean {
  if (input.successUrlClaimsPaid) return false;
  if (!input.orderSnapshotId) return input.metadataSnapshotId == null;
  if (input.metadataSnapshotId && input.metadataSnapshotId !== input.orderSnapshotId) return false;
  return (
    input.storedSnapshotAlbumId === input.orderAlbumId &&
    input.storedFingerprint === input.orderFingerprint
  );
}

export function orderedPrintSource(order: { printSnapshotId: string | null }): "final-print-snapshot" | "order-photos" {
  return order.printSnapshotId ? "final-print-snapshot" : "order-photos";
}

export function orderFingerprintAfterDraftEdit(orderFingerprint: string, _nextDraftFingerprint: string): string {
  return orderFingerprint;
}

export function snapshotUpdateAllowed(
  finalizedAt: string | null,
  change: "content" | "pdf" | "finalize",
): boolean {
  if (change === "content") return false;
  if (change === "finalize") return finalizedAt == null;
  return finalizedAt == null;
}
