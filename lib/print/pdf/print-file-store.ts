import "server-only";

import { createAdminClient } from "@/lib/supabase/admin.ts";
import type { GeneratedPrintFile } from "../document-types.ts";
import { PrintFileUploadError } from "./errors.ts";

export type StoredPrintFile = {
  type: "cover" | "content" | "book";
  path: string;
  mimeType: "application/pdf";
  pageCount: number;
};

export interface PrintFileStore {
  save(orderId: string, file: GeneratedPrintFile): Promise<StoredPrintFile>;
}

/**
 * Stores generated PDFs in the private print-files bucket.
 * Only the service-role pipeline can access this bucket — no client access.
 * File paths follow orders/{orderId}/cover.pdf and orders/{orderId}/content.pdf.
 */
export class SupabasePrintFileStore implements PrintFileStore {
  async save(orderId: string, file: GeneratedPrintFile): Promise<StoredPrintFile> {
    const client = createAdminClient();
    const { error } = await client.storage
      .from("print-files")
      .upload(file.filename, file.bytes, { contentType: file.mimeType, upsert: true });
    if (error) {
      throw new PrintFileUploadError(file.type, orderId);
    }
    return {
      type: file.type,
      path: file.filename,
      mimeType: file.mimeType,
      pageCount: file.pageCount,
    };
  }
}
