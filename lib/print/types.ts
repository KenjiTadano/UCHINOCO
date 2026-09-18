import "server-only";

/**
 * Provider-agnostic types for the print fulfillment layer.
 * Actual provider implementations live in lib/print/providers/.
 * No real API is connected in Task046-2.
 */

export type PrintOrderItem = {
  position: number;
  /** original_path from order_photos snapshot */
  storagePath: string;
  takenAt: string | null;
  caption: string | null;
};

export type PrintOrderParams = {
  /** Used as idempotency key base */
  orderId: string;
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

export interface PrintProvider {
  submitOrder(params: PrintOrderParams): Promise<PrintJobResult>;
  getJobStatus(providerOrderId: string): Promise<PrintJobStatus>;
  cancelJob(providerOrderId: string): Promise<void>;
}
