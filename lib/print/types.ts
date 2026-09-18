import "server-only";

/**
 * Provider-agnostic types for the print fulfillment layer.
 * Implementations live in lib/print/providers/.
 */

export type PrintProviderName = "mock" | "prodigi" | "gelato" | "fujifilm";

export type PrintOrderItem = {
  position: number;
  /** original_path from order_photos snapshot */
  storagePath: string;
  takenAt: string | null;
  caption: string | null;
};

/**
 * Provider-agnostic asset type.
 * URL is a signed URL or hosted URL for the provider to fetch.
 * PDF generation and signed URL creation are handled upstream.
 */
export type PrintAsset = {
  type: "cover" | "content" | "book";
  url: string;
};

export type PrintOrderParams = {
  orderId: string;
  /** Explicit idempotency key; falls back to orderId if omitted. */
  idempotencyKey?: string;
  productId: string;
  productSize: string;
  coverType: "soft" | "hard";
  pages: number;
  items: PrintOrderItem[];
  recipient: {
    lastName: string;
    firstName: string;
    postalCode: string;
    prefecture: string;
    city: string;
    address1: string;
    address2?: string | null;
    phone: string;
  };
};

export type PrintJobResult = {
  providerOrderId: string;
  status: "submitted" | "queued";
};

export type PrintJobStatus = {
  status: "queued" | "submitted" | "processing" | "shipped" | "failed" | "cancelled";
  trackingNumber?: string;
};

/**
 * Future cost quote from the provider (separate from user-facing orders.total).
 * Do not mix with the user billing amount.
 */
export type ProviderQuote = {
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
};

export interface PrintProvider {
  submitOrder(params: PrintOrderParams): Promise<PrintJobResult>;
  getJobStatus(providerOrderId: string): Promise<PrintJobStatus>;
  cancelJob(providerOrderId: string): Promise<void>;
}
