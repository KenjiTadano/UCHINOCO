/**
 * Shipping address type and validation for the checkout form.
 * Extracted to a pure module so it can be tested without React.
 */

export type ShippingAddress = {
  lastName: string;
  firstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address1: string;
  address2: string; // optional — excluded from required validation
  phone: string;
};

export type AddressErrors = {
  lastName?: string;
  firstName?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  address1?: string;
  phone?: string;
};

export const EMPTY_ADDRESS: ShippingAddress = {
  lastName: "",
  firstName: "",
  postalCode: "",
  prefecture: "",
  city: "",
  address1: "",
  address2: "",
  phone: "",
};

/**
 * Validates a shipping address.
 * Intentionally lenient: accepts common Japanese input variations.
 * Returns an object of field → error message.
 */
export function validateAddress(addr: ShippingAddress): AddressErrors {
  const errors: AddressErrors = {};

  if (!addr.lastName.trim()) {
    errors.lastName = "姓を入力してください";
  }
  if (!addr.firstName.trim()) {
    errors.firstName = "名を入力してください";
  }

  // Allow with or without hyphen: 123-4567 or 1234567
  const zip = addr.postalCode.replace(/-/g, "").trim();
  if (!/^\d{7}$/.test(zip)) {
    errors.postalCode = "7桁の郵便番号を入力してください（例：123-4567）";
  }

  if (!addr.prefecture.trim()) {
    errors.prefecture = "都道府県を選択してください";
  }
  if (!addr.city.trim()) {
    errors.city = "市区町村を入力してください";
  }
  if (!addr.address1.trim()) {
    errors.address1 = "番地・号を入力してください";
  }

  // address2 is optional — no validation

  // Remove hyphens / spaces for digit check; accept 10–11 digit numbers starting with 0
  const tel = addr.phone.replace(/[-\s]/g, "").trim();
  if (!/^0\d{9,10}$/.test(tel)) {
    errors.phone = "電話番号を正しく入力してください（例：090-1234-5678）";
  }

  return errors;
}

export function hasAddressErrors(errors: AddressErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function isValidAddress(addr: ShippingAddress): boolean {
  return !hasAddressErrors(validateAddress(addr));
}
