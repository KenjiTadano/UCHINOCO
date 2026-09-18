/**
 * Photobook shipping options — mock / local config for Task045.
 * Replace with real carrier API / DB config in a future task.
 */

export type ShippingOption = {
  id: string;
  name: string;
  description: string;
  price: number;
  estimatedDays: string;
};

/**
 * Available shipping options.
 * Server must re-validate at order confirmation — never trust client-side shipping choice alone.
 */
export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: "standard",
    name: "標準配送",
    description: "ヤマト運輸または佐川急便",
    price: 550,
    estimatedDays: "3〜7営業日",
  },
];

export const DEFAULT_SHIPPING_ID = "standard";

export function getShippingOption(id: string): ShippingOption | undefined {
  return SHIPPING_OPTIONS.find((o) => o.id === id);
}

export function getDefaultShipping(): ShippingOption {
  return SHIPPING_OPTIONS[0];
}
