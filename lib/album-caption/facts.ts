import { CAPTION_EXPRESSION_CONFIDENCE, CAPTION_EXPRESSION_SCORE, CAPTION_MIN_CONFIDENCE, ALBUM_CAPTION_VERSION } from "./config.ts";
import type {
  CaptionActivity,
  CaptionDayPart,
  CaptionFacts,
  CaptionKind,
  CaptionScene,
} from "./types.ts";

const SCENES = new Set<CaptionScene>(["home", "outdoors", "travel", "cafe", "park", "unknown"]);
const ACTIVITIES = new Set<CaptionActivity>([
  "sleeping",
  "playing",
  "eating",
  "looking_camera",
  "cuddling",
  "walking",
  "other",
  "none",
  "unknown",
]);

const OBJECTS = new Set(["toy", "food", "bowl", "bed", "blanket", "window", "box", "ball", "yarn", "fish", "sofa", "floor"]);

const KNOWN_ACTIVITIES = new Set<CaptionActivity>([
  "sleeping",
  "playing",
  "eating",
  "looking_camera",
  "cuddling",
  "walking",
]);

export const EXPLICIT_EVENTS = new Set(["birthday"]);

type VisionFact = {
  confidence: number;
  expressionScore: number;
  scene: CaptionScene;
  activity: CaptionActivity;
  expressionTags: string[];
  memoryTags: string[];
  memoryValue: number | null;
};

export function describeCapturedAt(iso: string | null): {
  dateKey: string | null;
  dateLabel: string | null;
  month: number | null;
  year: number | null;
  dayPart: CaptionDayPart | null;
} {
  const empty = { dateKey: null, dateLabel: null, month: null, year: null, dayPart: null };
  if (!iso) return empty;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return empty;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const hour = Number(pick("hour"));
  if (!year || !month || !day || Number.isNaN(hour)) return empty;
  const dayPart: CaptionDayPart | null =
    hour >= 5 && hour <= 10
      ? "morning"
      : hour >= 11 && hour <= 14
        ? "midday"
        : hour >= 15 && hour <= 17
          ? "evening"
          : hour >= 18 && hour <= 23
            ? "night"
            : null;
  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dateLabel: `${month}月${day}日`,
    month,
    year,
    dayPart,
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Reads a stored Photo Intelligence semantic object. Unknown shapes contribute nothing. */
export function readVisionFact(raw: unknown): VisionFact | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const confidence = asNumber(row.confidence);
  if (confidence == null) return null;
  const sceneValue = row.scene;
  const activityValue = row.petActivity ?? row.pet_activity;
  const scene = typeof sceneValue === "string" && SCENES.has(sceneValue as CaptionScene) ? (sceneValue as CaptionScene) : "unknown";
  const activity =
    typeof activityValue === "string" && ACTIVITIES.has(activityValue as CaptionActivity)
      ? (activityValue as CaptionActivity)
      : "unknown";
  return {
    confidence,
    expressionScore: asNumber(row.expressionScore ?? row.expression_score) ?? 0,
    scene,
    activity,
    expressionTags: asStringList(row.expressionTags ?? row.expression_tags),
    memoryTags: asStringList(row.memoryTags ?? row.memory_tags),
    memoryValue: asNumber(row.memoryValueScore ?? row.memory_value_score),
  };
}

function expressionFor(fact: VisionFact, activity: CaptionActivity): string | null {
  if (fact.confidence < CAPTION_EXPRESSION_CONFIDENCE) return null;
  if (fact.expressionScore < CAPTION_EXPRESSION_SCORE) return null;
  const tag = fact.expressionTags.find((item) => item === "happy" || item === "playful" || item === "relaxed" || item === "calm" || item === "sleepy");
  if (!tag) return null;
  if ((tag === "happy" || tag === "playful") && activity !== "playing" && activity !== "looking_camera") return null;
  if ((tag === "relaxed" || tag === "calm") && activity !== "sleeping" && activity !== "looking_camera" && activity !== "cuddling") return null;
  if (tag === "sleepy" && activity !== "sleeping") return null;
  return tag;
}

export function emptyCaptionFacts(spreadId: string, storySpreadId: string): CaptionFacts {
  return {
    spreadId,
    storySpreadId,
    photoIds: [],
    petName: null,
    dateKey: null,
    dateLabel: null,
    month: null,
    year: null,
    dayPart: null,
    scene: "unknown",
    activity: "unknown",
    event: null,
    expression: null,
    objects: [],
    memoryValue: null,
    confidence: 0,
    locale: "ja",
    userText: null,
    priorTexts: [],
  };
}

export function buildCaptionFacts(input: {
  spreadId: string;
  storySpreadId: string;
  photoIds: string[];
  petName?: string | null;
  capturedAt?: string | null;
  visions?: unknown[];
  event?: string | null;
  userText?: string | null;
  priorTexts?: string[];
  locale?: CaptionFacts["locale"];
}): CaptionFacts {
  const facts = emptyCaptionFacts(input.spreadId, input.storySpreadId);
  facts.photoIds = [...new Set(input.photoIds.filter(Boolean))];
  facts.petName = input.petName?.trim() || null;
  facts.userText = input.userText?.trim() || null;
  facts.priorTexts = (input.priorTexts ?? []).map((item) => item.trim()).filter(Boolean);
  facts.locale = input.locale ?? "ja";
  facts.event = input.event && EXPLICIT_EVENTS.has(input.event) ? input.event : null;
  const clock = describeCapturedAt(input.capturedAt ?? null);
  facts.dateKey = clock.dateKey;
  facts.dateLabel = clock.dateLabel;
  facts.month = clock.month;
  facts.year = clock.year;
  facts.dayPart = clock.dayPart;

  const usable = (input.visions ?? [])
    .map((item) => readVisionFact(item))
    .filter((item): item is VisionFact => item != null && item.confidence >= CAPTION_MIN_CONFIDENCE);
  const weak = (input.visions ?? []).map((item) => readVisionFact(item)).filter((item): item is VisionFact => item != null);

  if (usable.length === 0) {
    facts.confidence = weak.length > 0 ? Math.max(...weak.map((item) => item.confidence)) : 0;
    return facts;
  }

  const activityCounts = new Map<CaptionActivity, { count: number; confidence: number }>();
  const sceneCounts = new Map<CaptionScene, { count: number; confidence: number }>();
  const objects = new Set<string>();
  let memoryValue: number | null = null;
  for (const fact of usable) {
    if (KNOWN_ACTIVITIES.has(fact.activity)) {
      const current = activityCounts.get(fact.activity) ?? { count: 0, confidence: 0 };
      activityCounts.set(fact.activity, {
        count: current.count + 1,
        confidence: Math.max(current.confidence, fact.confidence),
      });
    }
    if (fact.scene !== "unknown") {
      const current = sceneCounts.get(fact.scene) ?? { count: 0, confidence: 0 };
      sceneCounts.set(fact.scene, {
        count: current.count + 1,
        confidence: Math.max(current.confidence, fact.confidence),
      });
    }
    for (const tag of fact.memoryTags) {
      if (OBJECTS.has(tag)) objects.add(tag);
    }
    if (fact.memoryValue != null) memoryValue = memoryValue == null ? fact.memoryValue : Math.max(memoryValue, fact.memoryValue);
  }

  const activity = [...activityCounts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence)[0]?.[0] ?? "unknown";
  const scene = [...sceneCounts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence)[0]?.[0] ?? "unknown";
  facts.activity = activity;
  facts.scene = scene;
  facts.objects = [...objects].sort().slice(0, 4);
  facts.memoryValue = memoryValue;
  facts.confidence = Math.max(...usable.map((item) => item.confidence));
  const expressionSource = [...usable].sort((a, b) => b.confidence - a.confidence).find((item) => expressionFor(item, activity));
  facts.expression = expressionSource ? expressionFor(expressionSource, activity) : null;
  return facts;
}

export function hasCaptionMaterial(facts: CaptionFacts): boolean {
  if (facts.locale !== "ja") return false;
  if (facts.event) return true;
  if (KNOWN_ACTIVITIES.has(facts.activity)) return true;
  if (facts.scene !== "unknown") return true;
  return false;
}

export function captionConfidenceGate(facts: CaptionFacts): "ok" | "low_confidence" | "insufficient" {
  const sawWeak = facts.confidence > 0 && facts.confidence < CAPTION_MIN_CONFIDENCE;
  if (!hasCaptionMaterial(facts)) return sawWeak ? "low_confidence" : "insufficient";
  if (facts.confidence < CAPTION_MIN_CONFIDENCE) return "low_confidence";
  return "ok";
}

export function captionSourceFacts(facts: CaptionFacts): string[] {
  const lines: string[] = [];
  if (KNOWN_ACTIVITIES.has(facts.activity)) lines.push(`activity: ${facts.activity}`);
  if (facts.scene !== "unknown") lines.push(`scene: ${facts.scene}`);
  for (const object of facts.objects) lines.push(`object: ${object}`);
  if (facts.event) lines.push(`event: ${facts.event}`);
  if (facts.expression) lines.push(`expression: ${facts.expression}`);
  if (facts.dateKey) lines.push(`capturedAt: ${facts.dateKey}`);
  if (facts.dayPart) lines.push(`dayPart: ${facts.dayPart}`);
  if (facts.memoryValue != null) lines.push(`memoryValue: ${facts.memoryValue}`);
  if (facts.petName) lines.push(`pet: ${facts.petName}`);
  return lines;
}

export function captionFingerprint(facts: CaptionFacts, kind: CaptionKind): string {
  const photos = [...facts.photoIds].sort().join(",");
  return [
    facts.storySpreadId,
    photos,
    facts.activity,
    facts.scene,
    facts.event ?? "",
    facts.dateKey ?? "",
    facts.dayPart ?? "",
    facts.objects.join(","),
    facts.expression ?? "",
    ALBUM_CAPTION_VERSION,
    kind,
  ].join("|");
}
