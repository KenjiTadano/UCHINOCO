import "server-only";

import type {
  PrintProvider,
  PrintOrderParams,
  PrintJobResult,
  PrintJobStatus,
  PrintAsset,
} from "../types.ts";
import { getProviderProductId } from "../product-mapping.ts";
import {
  ProviderNotConfiguredError,
  ProviderProductUnavailableError,
} from "../errors.ts";
import { getProdigiApiKey, getProdigiBaseUrl } from "./prodigi-config.ts";
import { buildProdigiOrderRequest } from "./prodigi-request-builder.ts";
import { buildProdigiJobStatus } from "./prodigi-status.ts";

/**
 * ProdigiProvider — skeleton implementation.
 *
 * submitOrder, getJobStatus, cancelJob are stubbed.
 * Full implementation requires:
 *   1. Real SKUs confirmed via Prodigi Sandbox (PRODUCT_MAPPING populated)
 *   2. PDF / print asset generation (Task047-4)
 *   3. Prodigi API fetch integration
 *
 * All methods throw ProviderNotConfiguredError until implemented.
 */
export class ProdigiProvider implements PrintProvider {
  async submitOrder(params: PrintOrderParams): Promise<PrintJobResult> {
    // 1. Resolve provider SKU — null means no confirmed mapping yet
    const sku = getProviderProductId(params.productId, params.pages, "prodigi");
    if (!sku) {
      throw new ProviderProductUnavailableError(
        params.productId,
        params.pages,
        "prodigi",
      );
    }

    // 2. Assets — signed URLs not yet generated (Task047-4)
    const assets: PrintAsset[] = [];

    // 3. Build request payload (pure — validates structure; result used when fetch is implemented)
    buildProdigiOrderRequest(params, sku, assets);

    // 4. API fetch — not yet implemented
    void getProdigiApiKey();    // validates key exists (throws if missing)
    void getProdigiBaseUrl();   // validates env config
    throw new ProviderNotConfiguredError(
      "prodigi",
      "ProdigiProvider.submitOrder: API fetch not yet implemented. " +
      "Requires real SKU confirmation and print asset generation.",
    );
  }

  async getJobStatus(providerOrderId: string): Promise<PrintJobStatus> {
    void getProdigiApiKey();
    void getProdigiBaseUrl();
    // Reference buildProdigiJobStatus to satisfy the import
    void buildProdigiJobStatus;
    void providerOrderId;
    throw new ProviderNotConfiguredError(
      "prodigi",
      "ProdigiProvider.getJobStatus: not yet implemented.",
    );
  }

  async cancelJob(providerOrderId: string): Promise<void> {
    void getProdigiApiKey();
    void getProdigiBaseUrl();
    void providerOrderId;
    throw new ProviderNotConfiguredError(
      "prodigi",
      "ProdigiProvider.cancelJob: not yet implemented.",
    );
  }
}
