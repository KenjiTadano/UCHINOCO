// Static, self-contained diagnostic. No credentials, storage, fetch, or user content are serialized.
export function bootPlacementDiagnostic() {
  const started = performance.timeOrigin;
  const root = document.documentElement;
  const result: { route: string; shell?: number; primary?: number; full?: number; failure?: string } = { route: "other" };
  const path = location.pathname;
  const search = new URLSearchParams(location.search);
  if (path === "/home") result.route = "home";
  else if (path.endsWith("/pages/edit")) result.route = "page-editor";
  else if (path.endsWith("/print")) result.route = "print";
  else if (path.endsWith("/edit")) result.route = "edit";
  else if (search.get("view") === "preview") result.route = "preview";
  else if (search.get("view") === "complete") result.route = "complete";
  const selectors: Record<string, string> = { home: ".home-now-hero", preview: ".album-preview-stage", edit: ".album-edit-page-grid", "page-editor": ".page-edit-stage", complete: ".ai-complete-book-wrap", print: "main" };
  let queued = false; let done = false;
  const publish = () => { root.setAttribute("data-placement-measurement", JSON.stringify(result)); };
  function inspect() {
    queued = false; if (done) return;
    const now = Math.round(performance.now());
    if (!result.shell && document.querySelector("header,main,.app-loading")) result.shell = now;
    const element = document.querySelector(selectors[result.route] ?? "main");
    const ready = element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0 && (result.route !== "print" || document.querySelector("h1")?.textContent?.includes("印刷プレビュー"));
    if (ready && !result.primary) result.primary = now;
    const images = [...document.images].filter(image => image.loading !== "lazy");
    if (result.primary && document.readyState === "complete" && root.getAttribute("data-placement-hydrated") === "true" && images.every(image => image.complete && image.naturalWidth > 0)) { result.full = now; done = true; }
    if (now > 45000 && !done) { result.failure = result.primary ? "delivery-incomplete" : "primary-not-reached"; done = true; }
    publish();
    if (done) { observer.disconnect(); clearInterval(timer); }
  }
  const schedule = () => { if (!queued && !done) { queued = true; requestAnimationFrame(inspect); } };
  const observer = new MutationObserver(records => { if (records.some(record => record.type !== "attributes" || !["data-placement-measurement"].includes(record.attributeName ?? ""))) schedule(); });
  observer.observe(document, { childList: true, subtree: true, attributes: true });
  document.addEventListener("load", schedule, true);
  const timer = setInterval(schedule, 100);
  schedule();
  void started;
}
export const PLACEMENT_BROWSER_SCRIPT = `(${bootPlacementDiagnostic.toString()})();`;
