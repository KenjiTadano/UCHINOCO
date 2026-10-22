import type { PersistedDraftView } from "./view.ts";
export type DraftStage = "primary" | "nearby" | "complete";
export type DraftPin = Readonly<{ versionId: string; revision: number; coverRevision: number; coverClientSeq: number }>;
export type DraftDelivery =
  | { ok: true; stage: DraftStage; view: PersistedDraftView } // Preview-only baseline comparison.
  | { ok: true; stage: DraftStage; pin: DraftPin; base?: PersistedDraftView; urls: Record<string, string>; thumbnails: Record<string, string> }
  | { ok: false; message: string };
export type DraftStream = { primary: Promise<DraftDelivery>; nearby: Promise<DraftDelivery>; complete: Promise<DraftDelivery> };
