/**
 * Pure function: builds a Prodigi order request payload.
 * No API calls, no logging, no side effects.
 *
 * providerProductId is passed in from getProviderProductId() —
 * this builder never hardcodes SKUs.
 */

import type { PrintOrderParams, PrintAsset } from "../types.ts";

type ProdigiAsset = {
  printArea: string;
  url: string;
};

type ProdigiOrderItem = {
  merchantReference: string;
  sku: string;
  copies: 1;
  sizing: "fillPrintArea";
  attributes: { pageCount: number };
  assets: ProdigiAsset[];
};

export type ProdigiOrderRequest = {
  merchantReference: string;
  shippingMethod: "Standard";
  recipient: {
    name: string;
    address: {
      line1: string;
      line2?: string;
      postalOrZipCode: string;
      countryCode: "JP";
      townOrCity: string;
      stateOrCounty: string;
    };
  };
  items: ProdigiOrderItem[];
};

/**
 * Builds the Prodigi create-order request body from normalised params.
 *
 * @param params        - Provider-agnostic order params (from orders snapshot)
 * @param providerProductId - Confirmed Prodigi SKU (from product-mapping.ts)
 * @param assets        - Pre-resolved print asset URLs (cover + pages)
 */
export function buildProdigiOrderRequest(
  params: PrintOrderParams,
  providerProductId: string,
  assets: PrintAsset[],
): ProdigiOrderRequest {
  const idempotencyKey = params.idempotencyKey ?? params.orderId;
  // Full name in Western order for Prodigi (lastName + firstName in Japanese convention)
  const recipientName = `${params.recipient.lastName} ${params.recipient.firstName}`;

  const prodigiAssets: ProdigiAsset[] = assets.map((a) => ({
    printArea: a.type === "cover" ? "cover" : "pages",
    url: a.url,
  }));

  return {
    merchantReference: idempotencyKey,
    shippingMethod: "Standard",
    recipient: {
      name: recipientName,
      address: {
        line1: params.recipient.address1,
        ...(params.recipient.address2
          ? { line2: params.recipient.address2 }
          : {}),
        postalOrZipCode: params.recipient.postalCode,
        countryCode: "JP",
        townOrCity: params.recipient.city,
        stateOrCounty: params.recipient.prefecture,
      },
    },
    items: [
      {
        merchantReference: `${idempotencyKey}-item-1`,
        sku: providerProductId,
        copies: 1,
        sizing: "fillPrintArea",
        attributes: { pageCount: params.pages },
        assets: prodigiAssets,
      },
    ],
  };
}
