export type PrintSourceKind = "draft" | "order-snapshot";

/** Editing albums print from the active draft. Ordered or paid albums do not. */
export function selectPrintSource(input: {
  albumStatus: string | null | undefined;
  hasPaidOrder?: boolean;
}): PrintSourceKind {
  if (input.albumStatus === "ordered" || input.hasPaidOrder) return "order-snapshot";
  return "draft";
}
