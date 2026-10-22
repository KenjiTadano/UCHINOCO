import type { DraftDelivery, DraftPin } from "./progressive-types.ts";
import type { PersistedDraftView } from "./view.ts";
import { applyPreviewUrls } from "./editor.ts";
export type ProgressiveState = { view: PersistedDraftView | null; rank: number; error: string | null; mask: number; pin?: DraftPin; urls: Record<string, string>; thumbnails: Record<string, string> };
export function initialProgressiveState(view: PersistedDraftView | null, streaming: boolean): ProgressiveState {
  return { view, rank: streaming ? 0 : 3, mask: streaming ? 0 : 7, error: null, urls: view?.previewUrls ?? {}, thumbnails: view?.thumbnailUrls ?? {} };
}
/** Order-independent data merge, using the same effective-state projection as the editor. */
export function mergeDraftDelivery(current: ProgressiveState, value: DraftDelivery, expected: PersistedDraftView | null): ProgressiveState {
  const fail = (message: string): ProgressiveState => ({ ...current, view: null, rank: 0, error: message });
  if (current.error) return current;
  if (!value.ok) return fail(value.message);
  const stage = { primary: 1, nearby: 2, complete: 4 }[value.stage];
  if (current.mask & stage) return current;
  const pin = "view" in value ? { versionId: value.view.versionId, revision: value.view.revision } : value.pin;
  if (!expected || pin.versionId !== expected.versionId || pin.revision !== expected.revision || (current.pin && "coverRevision" in pin && (pin.coverRevision !== current.pin.coverRevision || pin.coverClientSeq !== current.pin.coverClientSeq))) return fail("アルバムが更新されました。再読み込みしてください。");
  const mask = current.mask | stage;
  if ("view" in value) {
    const rank = { primary: 1, nearby: 2, complete: 3 }[value.stage];
    return rank > current.rank ? { ...current, view: value.view, mask, rank } : current;
  }
  const urls = { ...current.urls, ...value.urls };
  const thumbnails = { ...current.thumbnails, ...value.thumbnails };
  const base = value.base ?? current.view;
  const projected = base ? applyPreviewUrls(base, urls) : null;
  const view = projected && base ? { ...projected, thumbnailUrls: thumbnails, spreads: projected.spreads.map((spread, i) => ({ ...spread, layoutRanking: base.spreads[i].layoutRanking })) } : null;
  return { view, urls, thumbnails, pin: value.pin, mask, error: null, rank: mask === 7 ? 3 : mask & 1 ? (mask & 2 ? 2 : 1) : 0 };
}
