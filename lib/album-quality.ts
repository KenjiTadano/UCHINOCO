export const ALBUM_QUALITY_CONFIG = {
  minimumSample: 10,
  targets: {
    directAcceptRate: 0.6,
    averageEditDistance: 2,
    layoutKeepRate: 0.8,
    cropKeepRate: 0.9,
    decorationApplyRate: 0.3,
    printPreviewRate: 0.25,
  },
  attention: {
    directAcceptRate: 0.45,
    layoutKeepRate: 0.65,
    cropKeepRate: 0.75,
    photoSwapRate: 0.25,
    heavyEditRate: 0.25,
    decorationApplyRate: 0.15,
    decorationResetRate: 0.35,
    printPreviewRate: 0.12,
  },
} as const;

export const ALBUM_QUALITY_HISTORY = [
  { task: "Task055", label: "Smart Layout v2" },
  { task: "Task058", label: "Album Rhythm v2" },
  { task: "Task059", label: "Decoration Recommendation" },
  { task: "Task060", label: "Acceptance & Edit Distance Analytics" },
] as const;

export type QualityDateRange = "7d" | "30d" | "90d" | "all";
export type QualityStatus = "INSUFFICIENT_DATA" | "HEALTHY" | "WATCH" | "NEEDS_ATTENTION";
export type QualitySignal =
  | "LOW_DIRECT_ACCEPT" | "HIGH_LAYOUT_CHANGE" | "HIGH_CROP_CHANGE"
  | "HIGH_PHOTO_SWAP" | "LOW_DECORATION_ACCEPT" | "HIGH_DECORATION_RESET"
  | "HIGH_HEAVY_EDIT" | "LOW_PRINT_INTENT";

export type QualityEvent = {
  album_id?: string | null;
  draft_version_id?: string | null;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
};

type Metric = { value: number | null; sample: number; status: QualityStatus; target: number | null };

export type AlbumQualitySummary = {
  empty: boolean;
  range: QualityDateRange;
  measuredEventCount: number;
  funnel: Array<{ key: string; label: string; count: number; rateFromPrevious: number | null }>;
  acceptance: Record<"DIRECT_ACCEPT" | "LIGHT_EDIT_ACCEPT" | "MEDIUM_EDIT_ACCEPT" | "HEAVY_EDIT_ACCEPT", number>;
  edits: Record<"photoSwap" | "layout" | "crop" | "text" | "stamp" | "decoration" | "background", Metric>;
  primary: Metric;
  acceptRate: Metric;
  averageEditDistance: Metric;
  averageTimeToAcceptSeconds: Metric;
  regenerateRate: Metric;
  layout: { keep: Metric; ranks: Record<"1" | "2" | "3" | "4" | "other", number> };
  crop: { keep: Metric; modified: number; reset: number };
  decoration: { shown: number; previewed: number; applied: number; rejected: number; reset: number; previewRate: Metric; applyRate: Metric; resetRate: Metric; byStyle: Record<string, { shown: number; applied: number; reset: number }> };
  print: { preview: Metric; checkout: Metric };
  signals: Array<{ code: QualitySignal; status: QualityStatus; recommendation: string }>;
};

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : 0;
const data = (event: QualityEvent) => event.event_data ?? {};
const ratio = (part: number, total: number) => total > 0 ? part / total : null;

function statusFor(value: number | null, sample: number, target: number, attention: number, higherIsBetter = true): QualityStatus {
  if (sample < ALBUM_QUALITY_CONFIG.minimumSample || value == null) return "INSUFFICIENT_DATA";
  if (higherIsBetter) return value >= target ? "HEALTHY" : value < attention ? "NEEDS_ATTENTION" : "WATCH";
  return value <= target ? "HEALTHY" : value > attention ? "NEEDS_ATTENTION" : "WATCH";
}

function metric(value: number | null, sample: number, target: number | null, attention = target ?? 0, higherIsBetter = true): Metric {
  return { value, sample, target, status: target == null ? (sample < ALBUM_QUALITY_CONFIG.minimumSample ? "INSUFFICIENT_DATA" : "HEALTHY") : statusFor(value, sample, target, attention, higherIsBetter) };
}

export function qualityRangeStart(range: QualityDateRange, now = new Date()): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function parseQualityRange(value: string | undefined): QualityDateRange {
  return value === "7d" || value === "30d" || value === "90d" ? value : "all";
}

export function buildAlbumQualitySummary(events: QualityEvent[], range: QualityDateRange): AlbumQualitySummary {
  const byType = (type: string) => events.filter((event) => event.event_type === type);
  const generated = byType("album_generated");
  const viewed = byType("album_viewed");
  const accepted = byType("album_accepted");
  const printPreview = byType("print_preview_opened");
  const checkout = byType("checkout_started");
  const regenerated = byType("album_regenerated");
  const eventIdentity = (event: QualityEvent) => event.draft_version_id ?? event.album_id ?? `${event.event_type}:${event.created_at}`;
  const uniqueCount = (items: QualityEvent[]) => new Set(items.map(eventIdentity)).size;
  const generatedCount = uniqueCount(generated);
  const viewedCount = uniqueCount(viewed);
  const acceptedCount = uniqueCount(accepted);
  const printPreviewCount = uniqueCount(printPreview);
  const checkoutCount = uniqueCount(checkout);
  const acceptance = { DIRECT_ACCEPT: 0, LIGHT_EDIT_ACCEPT: 0, MEDIUM_EDIT_ACCEPT: 0, HEAVY_EDIT_ACCEPT: 0 };
  for (const event of accepted) {
    const category = String(data(event).category ?? "");
    if (category in acceptance) acceptance[category as keyof typeof acceptance] += 1;
  }
  const editDefinitions = {
    photoSwap: "photo_swap_count", layout: "layout_change_count", crop: "crop_change_count",
    text: "text_change_count", stamp: "stamp_change_count", decoration: "decoration_change_count", background: "background_change_count",
  } as const;
  const edits = Object.fromEntries(Object.entries(editDefinitions).map(([key, field]) => {
    const changed = accepted.filter((event) => num(data(event)[field]) > 0).length;
    const value = ratio(changed, accepted.length);
    return [key, metric(value, accepted.length, null)];
  })) as AlbumQualitySummary["edits"];
  const sum = (field: string) => accepted.reduce((total, event) => total + num(data(event)[field]), 0);
  const avg = (field: string) => {
    const values = accepted
      .map((event) => data(event)[field])
      .filter((value): value is number | string => (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))))
      .map(Number);
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  };
  const layoutTotal = sum("ai_layout_total");
  const cropTotal = sum("ai_crop_total");
  const ranks = { "1": 0, "2": 0, "3": 0, "4": 0, other: 0 };
  for (const event of accepted) {
    const counts = data(event).selected_rank_counts;
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) continue;
    for (const key of Object.keys(ranks)) ranks[key as keyof typeof ranks] += num((counts as Record<string, unknown>)[key]);
  }
  const shown = byType("decoration_recommendation_shown");
  const previewed = byType("decoration_previewed");
  const applied = byType("decoration_applied");
  const rejected = byType("decoration_rejected");
  const reset = byType("decoration_reset");
  const byStyle: AlbumQualitySummary["decoration"]["byStyle"] = {};
  for (const event of [...shown, ...applied, ...reset]) {
    const style = String(data(event).style_id ?? "UNKNOWN");
    byStyle[style] ??= { shown: 0, applied: 0, reset: 0 };
    if (event.event_type === "decoration_recommendation_shown") byStyle[style].shown += 1;
    if (event.event_type === "decoration_applied") byStyle[style].applied += 1;
    if (event.event_type === "decoration_reset") byStyle[style].reset += 1;
  }
  const primary = metric(ratio(acceptance.DIRECT_ACCEPT, generatedCount), generatedCount, ALBUM_QUALITY_CONFIG.targets.directAcceptRate, ALBUM_QUALITY_CONFIG.attention.directAcceptRate);
  const layoutKeep = metric(ratio(sum("ai_layout_kept_count"), layoutTotal), accepted.length, ALBUM_QUALITY_CONFIG.targets.layoutKeepRate, ALBUM_QUALITY_CONFIG.attention.layoutKeepRate);
  const cropKeep = metric(ratio(sum("ai_crop_kept_count"), cropTotal), accepted.length, ALBUM_QUALITY_CONFIG.targets.cropKeepRate, ALBUM_QUALITY_CONFIG.attention.cropKeepRate);
  const decorationApply = metric(ratio(applied.length, shown.length), shown.length, ALBUM_QUALITY_CONFIG.targets.decorationApplyRate, ALBUM_QUALITY_CONFIG.attention.decorationApplyRate);
  const decorationReset = metric(ratio(reset.length, applied.length), applied.length, 0.2, ALBUM_QUALITY_CONFIG.attention.decorationResetRate, false);
  const printMetric = metric(ratio(printPreviewCount, generatedCount), generatedCount, ALBUM_QUALITY_CONFIG.targets.printPreviewRate, ALBUM_QUALITY_CONFIG.attention.printPreviewRate);
  const heavyRate = ratio(acceptance.HEAVY_EDIT_ACCEPT, accepted.length);
  const signals: AlbumQualitySummary["signals"] = [];
  const add = (condition: boolean, code: QualitySignal, recommendation: string, status: QualityStatus = "NEEDS_ATTENTION") => { if (condition) signals.push({ code, recommendation, status }); };
  if (generatedCount >= ALBUM_QUALITY_CONFIG.minimumSample) {
    add(primary.status === "NEEDS_ATTENTION", "LOW_DIRECT_ACCEPT", "Accept前の変更内訳を確認し、最大の編集理由から改善してください。");
    add(layoutKeep.status === "NEEDS_ATTENTION", "HIGH_LAYOUT_CHANGE", "Smart Layoutの候補順位と写真枚数別の適合を確認してください。");
    add(cropKeep.status === "NEEDS_ATTENTION", "HIGH_CROP_CHANGE", "Smart Cropの顔・耳・被写体安全域を確認してください。");
    add((edits.photoSwap.value ?? 0) > ALBUM_QUALITY_CONFIG.attention.photoSwapRate, "HIGH_PHOTO_SWAP", "Photo Selection / Best Shotの選定理由を確認してください。");
    add((heavyRate ?? 0) > ALBUM_QUALITY_CONFIG.attention.heavyEditRate, "HIGH_HEAVY_EDIT", "複数変更が同時に起きるDraftを優先して再現確認してください。");
    add(printMetric.status === "NEEDS_ATTENTION", "LOW_PRINT_INTENT", "Accept後から印刷プレビューまでの導線を確認してください。", "WATCH");
  }
  if (shown.length >= ALBUM_QUALITY_CONFIG.minimumSample) add(decorationApply.status === "NEEDS_ATTENTION", "LOW_DECORATION_ACCEPT", "Decoration Recommendationのstyle別Apply率を確認してください。");
  if (applied.length >= ALBUM_QUALITY_CONFIG.minimumSample) add(decorationReset.status === "NEEDS_ATTENTION", "HIGH_DECORATION_RESET", "適用後にresetされるstyleと余白条件を確認してください。");
  return {
    empty: events.length === 0, range, measuredEventCount: events.length,
    funnel: [
      { key: "generated", label: "Album Generated", count: generatedCount, rateFromPrevious: null },
      { key: "viewed", label: "Viewed", count: viewedCount, rateFromPrevious: ratio(viewedCount, generatedCount) },
      { key: "accepted", label: "Accepted", count: acceptedCount, rateFromPrevious: ratio(acceptedCount, viewedCount) },
      { key: "print", label: "Print Preview", count: printPreviewCount, rateFromPrevious: ratio(printPreviewCount, acceptedCount) },
      { key: "checkout", label: "Checkout Started", count: checkoutCount, rateFromPrevious: ratio(checkoutCount, printPreviewCount) },
    ],
    acceptance, edits, primary,
    acceptRate: metric(ratio(acceptedCount, generatedCount), generatedCount, null),
    averageEditDistance: metric(avg("edit_distance"), accepted.length, ALBUM_QUALITY_CONFIG.targets.averageEditDistance, 5, false),
    averageTimeToAcceptSeconds: metric(avg("time_to_accept_seconds"), accepted.length, null),
    regenerateRate: metric(ratio(uniqueCount(regenerated), generatedCount), generatedCount, null),
    layout: { keep: layoutKeep, ranks },
    crop: { keep: cropKeep, modified: byType("album_crop_changed").filter((event) => data(event).state === "modified").length, reset: byType("album_crop_changed").filter((event) => data(event).state === "reset").length },
    decoration: {
      shown: shown.length, previewed: previewed.length, applied: applied.length, rejected: rejected.length, reset: reset.length,
      previewRate: metric(ratio(previewed.length, shown.length), shown.length, null), applyRate: decorationApply, resetRate: decorationReset, byStyle,
    },
    print: { preview: printMetric, checkout: metric(ratio(checkoutCount, generatedCount), generatedCount, null) },
    signals,
  };
}
