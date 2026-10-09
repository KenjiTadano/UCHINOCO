export type AlbumReadiness = {
  state: "ready" | "preparing" | "shortage" | "action_required" | "unavailable";
  total: number;
  ready: number;
  pending: number;
  failed: number;
  required: number;
  missingPhotos: number;
  suggestedPages: 24 | 48 | null;
  action?: "login";
};

export function albumReadiness(input: { total: number; ready: number; failed: number; pages: number; eligible?: number }): AlbumReadiness {
  const required = input.pages / 2;
  const pending = Math.max(0, input.total - input.ready - input.failed);
  const available = input.eligible ?? input.total;
  const missingPhotos = Math.max(0, required - available);
  return {
    state: input.total < required || (pending === 0 && input.failed === 0 && available < required) ? "shortage" : input.failed > 0 ? "action_required" : pending > 0 ? "preparing" : "ready",
    total: input.total,
    ready: input.ready,
    pending,
    failed: input.failed,
    required,
    missingPhotos,
    suggestedPages: available >= 24 && input.pages > 48 ? 48 : available >= 12 && input.pages > 24 ? 24 : null,
  };
}

export type AlbumIntent = {
  id: string;
  petId: string;
  petIds: string[];
  period: string;
  periodFrom: string;
  periodTo: string;
  pageCount: number;
  requestedAt: string;
  phase: "preparing" | "generating";
};
export const ALBUM_INTENT_TTL_MS = 30 * 60_000;
export const ALBUM_PREPARE_MAX_POLLS = 180;
export const ALBUM_RECOVERY_MAX_RETRIES = 3;

export function validAlbumIntent(value: unknown, petId: string, ownedPetIds: string[], now = Date.now()): value is AlbumIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as AlbumIntent;
  const age = now - Date.parse(intent.requestedAt);
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intent.id) &&
    intent.petId === petId &&
    Array.isArray(intent.petIds) &&
    intent.petIds.length > 0 &&
    intent.petIds.every((id) => ownedPetIds.includes(id)) &&
    [24, 48, 72].includes(intent.pageCount) &&
    ["3months", "6months", "1year", "all", "custom"].includes(intent.period) &&
    typeof intent.periodFrom === "string" &&
    typeof intent.periodTo === "string" &&
    ["preparing", "generating"].includes(intent.phase) &&
    Number.isFinite(age) &&
    age >= -60_000 &&
    age < ALBUM_INTENT_TTL_MS
  );
}

export function intentFormData(intent: AlbumIntent) {
  const data = new FormData();
  data.set("intentId", intent.id);
  data.set("requestedAt", intent.requestedAt);
  data.set("petSelection", "selected");
  intent.petIds.forEach((id) => data.append("petIds", id));
  data.set("period", intent.period);
  data.set("periodFrom", intent.periodFrom);
  data.set("periodTo", intent.periodTo);
  data.set("pageCount", String(intent.pageCount));
  return data;
}

export function nextAlbumIntentStep(intent: AlbumIntent, readiness: AlbumReadiness, executing: boolean) {
  if (Date.now() - Date.parse(intent.requestedAt) >= ALBUM_INTENT_TTL_MS) return "recover";
  if (executing) return "wait";
  if (readiness.state === "ready") return "generate";
  if (readiness.state === "preparing") return "wait";
  return "recover";
}

export async function boundedAlbumRecovery<T>(operation: () => Promise<T>, delay: (attempt: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch {
      if (attempt >= ALBUM_RECOVERY_MAX_RETRIES) throw new Error("album_recovery_exhausted");
      await delay(attempt);
    }
  }
}
