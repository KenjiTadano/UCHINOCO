import type {
  PhotoIntelligenceActivity,
  PhotoIntelligenceMoment,
  PhotoIntelligenceScene,
  PhotoIntelligenceSeason,
  PhotoIntelligenceVision,
} from "./types.ts";

const SCENES = new Set<PhotoIntelligenceScene>([
  "home",
  "outdoors",
  "travel",
  "cafe",
  "park",
  "unknown",
]);

const ACTIVITIES = new Set<PhotoIntelligenceActivity>([
  "sleeping",
  "playing",
  "eating",
  "looking_camera",
  "cuddling",
  "walking",
  "other",
  "none",
]);

const MOMENTS = new Set<PhotoIntelligenceMoment>([
  "funny",
  "calm",
  "action",
  "portrait",
  "everyday",
  "event",
  "unknown",
]);

const SEASONS = new Set<PhotoIntelligenceSeason>([
  "spring",
  "summer",
  "autumn",
  "winter",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampScore(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function clamp01(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function tagsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (tag.length < 2 || tag.length > 32) continue;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function parsePhotoIntelligenceVision(raw: string): PhotoIntelligenceVision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 280) : "";
  return {
    expressionScore: clampScore(parsed.expression_score, 50),
    uniquenessScore: clampScore(parsed.uniqueness_score, 45),
    memoryValueScore: clampScore(parsed.memory_value_score, 50),
    confidence: clamp01(parsed.confidence, 0.5),
    scene: enumValue(parsed.scene, SCENES, "unknown"),
    petActivity: enumValue(parsed.pet_activity, ACTIVITIES, "other"),
    expressionTags: tagsFrom(parsed.expression_tags),
    memoryTags: tagsFrom(parsed.memory_tags),
    moment: enumValue(parsed.moment, MOMENTS, "unknown"),
    season: enumValue(parsed.season, SEASONS, "unknown"),
    petPresent: parsed.pet_present === true,
    peoplePresent: parsed.people_present === true,
    eyesVisible: parsed.eyes_visible === true,
    reason,
  };
}

export function collectVisionTags(vision: PhotoIntelligenceVision): string[] {
  const raw = [
    vision.scene !== "unknown" ? vision.scene : "",
    vision.petActivity !== "none" && vision.petActivity !== "other" ? vision.petActivity : "",
    vision.moment !== "unknown" ? vision.moment : "",
    vision.season !== "unknown" ? vision.season : "",
    ...vision.expressionTags,
    ...vision.memoryTags,
  ];
  const tags: string[] = [];
  for (const tag of raw) {
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= 16) break;
  }
  return tags;
}

export const PHOTO_INTELLIGENCE_VISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    expression_score: { type: "number" },
    uniqueness_score: { type: "number" },
    memory_value_score: { type: "number" },
    confidence: { type: "number" },
    scene: {
      type: "string",
      enum: ["home", "outdoors", "travel", "cafe", "park", "unknown"],
    },
    pet_activity: {
      type: "string",
      enum: [
        "sleeping",
        "playing",
        "eating",
        "looking_camera",
        "cuddling",
        "walking",
        "other",
        "none",
      ],
    },
    expression_tags: { type: "array", items: { type: "string" } },
    memory_tags: { type: "array", items: { type: "string" } },
    moment: {
      type: "string",
      enum: ["funny", "calm", "action", "portrait", "everyday", "event", "unknown"],
    },
    season: {
      type: "string",
      enum: ["spring", "summer", "autumn", "winter", "unknown"],
    },
    pet_present: { type: "boolean" },
    people_present: { type: "boolean" },
    eyes_visible: { type: "boolean" },
    reason: { type: "string" },
  },
  required: [
    "expression_score",
    "uniqueness_score",
    "memory_value_score",
    "confidence",
    "scene",
    "pet_activity",
    "expression_tags",
    "memory_tags",
    "moment",
    "season",
    "pet_present",
    "people_present",
    "eyes_visible",
    "reason",
  ],
} as const;

export const PHOTO_INTELLIGENCE_VISION_PROMPT = `
You score one pet photo for a memory album. This is not a camera review and not a ranking against other photos.

Scores are integers 0-100.

expression_score:
How appealing and readable the pet's expression or captured moment is.
Do NOT treat a smile or direct eye contact as the only way to score high.
Also score high when it fits: a sleeping face, yawn, tongue out, curious look, play, funny face, relaxed calm, or gentle interaction.
A slightly blurry photo can still have a very high expression score when the moment is strong.
If no pet is visible, score below 30.

uniqueness_score:
Single-photo estimate of an unusual pose, place, action, or situation.
You cannot see the rest of the library. Do not pretend to compare duplicates.
An ordinary sitting-at-home portrait should land around 40-60, not 90.
A distinctive action, funny pose, or uncommon setting can go higher.

memory_value_score:
How many elements are visible that tend to make a photo worth keeping.
This is NOT a claim about the owner's private feelings.
Often worth keeping: time with a person, going out, a birthday or event cue, a sense of growth, a first-looking place, a funny action, a sleeping face, a characteristic everyday moment.
Do NOT give a high score only because a person is in frame. A person plus a generic snapshot can stay moderate.
A quiet everyday moment can still score high when it feels characteristic.
A pretty but generic portrait should usually land around 55-70, not 95.

confidence:
0 to 1. Lower it when the pet is occluded, the frame is very dark, motion is ambiguous, or you are unsure.

Enums must match the schema.
Do not tag the species from toys, blankets, or cartoon prints. puppy only if the animal is a dog. kitten only if it is a young cat.
expression_tags and memory_tags: short English snake_case tokens.
pet_present is true only if a pet is actually visible.
people_present is true only if a person is clearly in frame.
eyes_visible is true if at least one eye can be seen, including clearly closed eyes on a sleeping face.

reason: one or two Japanese sentences for the owner. Describe visible elements. Do not assert the owner's emotions as fact. Do not address them as あなた.
`.trim();
