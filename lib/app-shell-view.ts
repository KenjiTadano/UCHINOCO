/** Album complete / preview flags from the page query. Checkout queries stay null. */
export function shellViewParam(
  searchParams: { get(name: string): string | null },
): "complete" | "preview" | null {
  if (searchParams.get("view") === "complete" || searchParams.get("preview") === "complete") {
    return "complete";
  }
  if (searchParams.get("view") === "preview" || searchParams.get("preview") === "preview") {
    return "preview";
  }
  return null;
}
