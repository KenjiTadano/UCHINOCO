import type { PersistedDraftView } from "./view.ts";
export type DraftDelivery = { ok: true; stage: "primary" | "nearby" | "complete"; view: PersistedDraftView } | { ok: false; message: string };
export type DraftStream = { primary: Promise<DraftDelivery>; nearby: Promise<DraftDelivery>; complete: Promise<DraftDelivery> };
