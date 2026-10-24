/** Preview-only, fixed 380x715 experiment. First two grid rows (cover + five bodies) stays eager. */
export function imageLoadingExperiment(environment: string | undefined, mode: unknown) {
  return environment === "preview" && mode === "lazy";
}
export function experimentalBodyLoading(enabled: boolean, pageIndex: number, selected: boolean): "lazy" | undefined {
  return enabled && pageIndex >= 6 && !selected ? "lazy" : undefined;
}
