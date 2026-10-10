import { albumCapacities, albumCapacityState, recommendAlbumPageCount, requiredEligiblePhotos, type AlbumPageCount } from "./album-capacity.ts";

export type AlbumReadiness = {
  state: "ready" | "preparing" | "shortage" | "action_required" | "unavailable";
  total: number;
  ready: number;
  pending: number;
  eligibleReady: number;
  required: number;
  missingPhotos: number;
  suggestedPages: AlbumPageCount | null;
  recommendedPageCount: AlbumPageCount | null;
  capacities: ReturnType<typeof albumCapacities>;
  action?: "login";
};

export type AlbumPreparationPhoto = {
  ready: boolean;
  failed: boolean;
  staleVersion: boolean;
  staleFingerprint: boolean;
  missingSemantic: boolean;
  missingGeometry: boolean;
  queueMissing: boolean;
  lastProgressAt: string | null;
};

export function summarizeAlbumPreparation(input: {
  photos: AlbumPreparationPhoto[];
  eligibleReady: number;
  requiredEligible: number;
  requestedAt: string;
  queueStatusAvailable?: boolean;
}) {
  const requestedAt = Date.parse(input.requestedAt);
  const progress = input.photos
    .map((photo) => photo.lastProgressAt)
    .filter((timestamp): timestamp is string => timestamp !== null && Date.parse(timestamp) >= requestedAt);
  return {
    totalSource: input.photos.length,
    ready: input.photos.filter((photo) => photo.ready).length,
    pending: input.photos.filter((photo) => !photo.ready && !photo.failed).length,
    failed: input.photos.filter((photo) => photo.failed).length,
    stale: input.photos.filter((photo) => photo.staleVersion || photo.staleFingerprint).length,
    staleVersion: input.photos.filter((photo) => photo.staleVersion).length,
    staleFingerprint: input.photos.filter((photo) => photo.staleFingerprint).length,
    missingSemantic: input.photos.filter((photo) => photo.missingSemantic).length,
    missingGeometry: input.photos.filter((photo) => photo.missingGeometry).length,
    queueMissing: input.photos.filter((photo) => photo.queueMissing).length,
    eligibleReady: input.eligibleReady,
    requiredEligible: input.requiredEligible,
    runnerWorkCount: progress.length,
    lastProgressAt: progress.reduce<string | null>((latest, timestamp) => !latest || timestamp > latest ? timestamp : latest, null),
    queueStatusAvailable: input.queueStatusAvailable ?? true,
  };
}

export function albumReadiness(input: { total: number; ready: number; pending: number; pages: AlbumPageCount; eligible: number }): AlbumReadiness {
  const required = requiredEligiblePhotos(input.pages);
  const available = input.eligible;
  const missingPhotos = Math.max(0, required - available);
  const capacities = albumCapacities(available);
  return {
    state: albumCapacityState(available, required, input.pending),
    total: input.total,
    ready: input.ready,
    pending: input.pending,
    eligibleReady: available,
    required,
    missingPhotos,
    suggestedPages: [...capacities].reverse().find((capacity) => capacity.pageCount < input.pages && capacity.available)?.pageCount ?? null,
    recommendedPageCount: recommendAlbumPageCount(available),
    capacities,
  };
}

export type AlbumIntent = {
  id: string;
  petId: string;
  petIds: string[];
  period: string;
  periodFrom: string;
  periodTo: string;
  pageCount: AlbumPageCount;
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
