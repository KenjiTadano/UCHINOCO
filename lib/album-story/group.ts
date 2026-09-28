import { capturedMs, timeGapMs, tokyoDay } from "../photo-grouping/time.ts";
import { ALBUM_STORY_CONFIG, ALBUM_STORY_VERSION } from "./config.ts";
import type { AlbumStoryRequest, AlbumStoryResult, StoryDensity, StorySceneInput, StorySpread, StoryType } from "./types.ts";

type PairScore = {
  coherence: number;
  sameSession: boolean;
};

export function buildAlbumStory(request: AlbumStoryRequest): AlbumStoryResult {
  const scenes = [...request.scenes].sort(byTime);
  const groups: { scenes: StorySceneInput[]; warnings: string[] }[] = [];

  for (const scene of scenes) {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push({ scenes: [scene], warnings: [] });
      continue;
    }
    const incomingPhotos = photoCount(scene);
    const used = current.scenes.reduce((sum, item) => sum + photoCount(item), 0);
    if (used + incomingPhotos > ALBUM_STORY_CONFIG.photos.max) {
      groups.push({ scenes: [scene], warnings: ["PHOTO_BUDGET"] });
      continue;
    }
    const judged = current.scenes.map((member) => ({ member, pair: scorePair(member, scene) }));
    const acceptsAll = judged.every((item) => pairAccept(item.pair, item.member, scene));
    if (!acceptsAll) {
      const withLast = judged[judged.length - 1];
      const earlierBlocks = judged.slice(0, -1).some((item) => !pairAccept(item.pair, item.member, scene));
      const warnings =
        withLast && pairAccept(withLast.pair, withLast.member, scene) && earlierBlocks ? ["CHAIN_SEPARATED"] : [];
      groups.push({ scenes: [scene], warnings });
      continue;
    }
    current.scenes.push(scene);
  }

  const spreads = groups.map((group, index) => toSpread(group.scenes, group.warnings, index));
  const photoCountTotal = spreads.reduce((sum, spread) => sum + spread.photoIds.length, 0);

  return {
    period: request.period,
    spreads,
    stats: {
      selectedSceneCount: scenes.length,
      selectedPhotoCount: photoCountTotal,
      spreadCount: spreads.length,
    },
    storyBalance: {
      chronology: chronologyScore(spreads),
      coherence: spreads.length
        ? Math.round(spreads.reduce((sum, spread) => sum + spread.coherenceScore, 0) / spreads.length)
        : 0,
      pacing: pacingScore(spreads),
    },
    warnings: spreads.flatMap((spread) => spread.warnings),
    analysisVersion: ALBUM_STORY_VERSION,
  };
}

export function scorePair(a: StorySceneInput, b: StorySceneInput): PairScore {
  const coherence = coherenceOf(a, b);
  const sameDay = tokyoDay(a.startedAt) !== "" && tokyoDay(a.startedAt) === tokyoDay(b.startedAt);
  const minutes = timeGapMs(a.startedAt, b.startedAt) / 60000;
  const sameScene = Boolean(a.scene && a.scene === b.scene);
  const sameActivity = Boolean(a.activity && a.activity === b.activity);
  const sameSession =
    !incompatibleActivities(a, b) &&
    coherence >= ALBUM_STORY_CONFIG.merge.candidate &&
    sameDay &&
    minutes <= ALBUM_STORY_CONFIG.sameSessionMaxMinutes &&
    (sameScene || sameActivity);
  return { coherence, sameSession };
}

function pairAccept(pair: PairScore, a: StorySceneInput, b: StorySceneInput) {
  if (incompatibleActivities(a, b)) return false;
  if (pair.coherence >= ALBUM_STORY_CONFIG.merge.strong || pair.sameSession) return true;
  return (
    pair.coherence >= ALBUM_STORY_CONFIG.merge.candidate &&
    Boolean(sharedEventTag(a, b)) &&
    Boolean(a.activity && a.activity === b.activity)
  );
}

function coherenceOf(a: StorySceneInput, b: StorySceneInput): number {
  const weights = ALBUM_STORY_CONFIG.weights;
  const score =
    weights.time * scoreTime(a, b) +
    weights.semantic * scoreSemantic(a, b) +
    weights.sameDay * scoreSameDay(a, b) +
    weights.event * scoreEvent(a, b) +
    weights.visual * scoreVisual(a, b);
  return clamp(Math.round(score), 0, 100);
}

function scoreTime(a: StorySceneInput, b: StorySceneInput): number {
  const sameDay = tokyoDay(a.startedAt) === tokyoDay(b.startedAt) && tokyoDay(a.startedAt) !== "";
  const sharedEvent = sharedEventTag(a, b);
  if (!sameDay) return sharedEvent ? 100 : 0;
  const minutes = timeGapMs(a.startedAt, b.startedAt) / 60000;
  if (minutes <= 30) return 100;
  if (minutes <= 180) return 70;
  if (minutes <= 720) return 40;
  return 20;
}

function scoreSemantic(a: StorySceneInput, b: StorySceneInput): number {
  const activity = activityRelation(a.activity, b.activity, a.scene, b.scene);
  const scene = a.scene && b.scene ? (a.scene === b.scene ? 100 : 35) : 50;
  const tags = jaccard(a.tags, b.tags);
  return clamp(Math.round(activity * 0.55 + scene * 0.35 + tags * 0.1), 0, 100);
}

function activityRelation(a: string | undefined, b: string | undefined, sceneA?: string, sceneB?: string): number {
  if (a && b && a === b) return 96;
  const left = a ?? "";
  const right = b ?? "";
  if (isPair(ALBUM_STORY_CONFIG.incompatibleActivities, left, right)) return 26;
  if (isPair(ALBUM_STORY_CONFIG.relatedActivities, left, right)) return 80;
  if ((sceneA === "park" || sceneB === "park") && (left === "walking" || right === "walking")) return 78;
  if (left && right) return 48;
  return 40;
}

function scoreSameDay(a: StorySceneInput, b: StorySceneInput): number {
  return tokyoDay(a.startedAt) !== "" && tokyoDay(a.startedAt) === tokyoDay(b.startedAt) ? 100 : 0;
}

function scoreEvent(a: StorySceneInput, b: StorySceneInput): number {
  const left = eventTags(a);
  const right = eventTags(b);
  if (left.length === 0 && right.length === 0) return 55;
  if (left.some((tag) => right.includes(tag))) return 100;
  return 25;
}

function scoreVisual(a: StorySceneInput, b: StorySceneInput): number {
  if (!a.framing || !b.framing) return 50;
  return a.framing === b.framing ? 75 : 40;
}

function toSpread(scenes: StorySceneInput[], warnings: string[], index: number): StorySpread {
  const ordered = [...scenes].sort(byTime);
  const primaryPhotoIds = ordered.map((scene) => scene.primaryPhotoId);
  const secondaryPhotoIds = ordered.flatMap((scene) => (scene.secondaryPhotoId ? [scene.secondaryPhotoId] : []));
  const photoIds = ordered.flatMap((scene) =>
    scene.secondaryPhotoId ? [scene.primaryPhotoId, scene.secondaryPhotoId] : [scene.primaryPhotoId],
  );
  const pairs = pairMatrix(ordered);
  const coherenceScore = ordered.length <= 1 ? 100 : Math.min(...pairs);
  const importance = scoreImportance(ordered);
  const storyType = classify(ordered, coherenceScore);
  const spreadWarnings = [...warnings];
  if (ordered.length > 1 && coherenceScore < ALBUM_STORY_CONFIG.merge.strong) {
    spreadWarnings.push("SAME_SESSION");
  }
  return {
    id: `s${index + 1}-${ordered.map((scene) => scene.groupId).join("+")}`,
    sceneIds: ordered.map((scene) => scene.groupId),
    photoIds,
    primaryPhotoIds,
    secondaryPhotoIds,
    startedAt: ordered[0]?.startedAt ?? "",
    endedAt: ordered[ordered.length - 1]?.startedAt ?? "",
    storyType,
    theme: {
      scene: mode(ordered.map((scene) => scene.scene)),
      activity: mode(ordered.map((scene) => scene.activity)),
      event: sharedEventOf(ordered),
      season: seasonOf(ordered[0]?.startedAt ?? ""),
    },
    coherenceScore,
    importance,
    recommendedDensity: densityOf(photoIds.length, importance, ordered),
    warnings: spreadWarnings,
    analysisVersion: ALBUM_STORY_VERSION,
  };
}

function classify(scenes: StorySceneInput[], coherence: number): StoryType {
  const event = sharedEventOf(scenes) ?? scenes.map((scene) => eventTags(scene)[0]).find(Boolean);
  if (event && scenes.every((scene) => eventTags(scene).includes(event))) return "event";
  if (scenes.length === 1) return "single";
  if (coherence < 50 && new Set(scenes.map((scene) => scene.activity).filter(Boolean)).size > 1) return "contrast";
  const activities = scenes.map((scene) => scene.activity).filter((value): value is string => Boolean(value));
  if (isSequence(activities)) return "sequence";
  const days = new Set(scenes.map((scene) => tokyoDay(scene.startedAt)));
  if (days.size === 1) return "same_day";
  if (scenes.every((scene) => !eventTags(scene).length && (scene.scene ?? "home") === "home")) return "everyday";
  return "same_day";
}

function isSequence(activities: string[]): boolean {
  const order = ["playing", "walking", "eating", "sleeping"];
  const indexes = activities.map((activity) => order.indexOf(activity)).filter((index) => index >= 0);
  if (indexes.length < 3) return false;
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] < indexes[i - 1]) return false;
  }
  return new Set(indexes).size >= 3;
}

function scoreImportance(scenes: StorySceneInput[]): number {
  const sceneAvg = average(scenes.map((scene) => scene.sceneScore));
  const best = Math.max(...scenes.map((scene) => scene.bestShot));
  const memory = Math.max(...scenes.map((scene) => scene.memoryValue));
  const keep = scenes.some((scene) => scene.mustKeep) ? 8 : 0;
  const event = scenes.some((scene) => eventTags(scene).length > 0) ? 6 : 0;
  const photos = scenes.reduce((sum, scene) => sum + photoCount(scene), 0);
  return clamp(Math.round(sceneAvg * 0.55 + best * 0.2 + memory * 0.15 + keep + event + Math.min(4, photos) * 0.5), 0, 100);
}

function densityOf(photos: number, importance: number, scenes: StorySceneInput[]): StoryDensity {
  const strong =
    importance >= ALBUM_STORY_CONFIG.heroImportance ||
    scenes.some((scene) => scene.mustKeep) ||
    scenes.some((scene) => scene.sceneScore >= ALBUM_STORY_CONFIG.heroSceneScore) ||
    scenes.some((scene) => scene.memoryValue >= ALBUM_STORY_CONFIG.heroMemory);
  if (photos <= 1 && strong) return "hero";
  if (photos <= 2) return "light";
  if (photos <= 4) return "medium";
  return "dense";
}

function chronologyScore(spreads: StorySpread[]): number {
  let previous = 0;
  for (const spread of spreads) {
    const start = capturedMs(spread.startedAt);
    const end = capturedMs(spread.endedAt);
    if (start < previous || end < start) return 40;
    previous = end;
  }
  return spreads.length ? 100 : 0;
}

function pacingScore(spreads: StorySpread[]): number {
  if (spreads.length <= 1) return 100;
  const counts = spreads.map((spread) => spread.photoIds.length);
  const unique = new Set(counts).size;
  if (unique === 1 && counts[0] >= 3 && spreads.length >= 3) return 45;
  if (unique === 1) return 72;
  return Math.min(100, 60 + unique * 15);
}

function pairMatrix(scenes: StorySceneInput[]): number[] {
  const scores: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    for (let j = i + 1; j < scenes.length; j++) scores.push(coherenceOf(scenes[i], scenes[j]));
  }
  return scores;
}

function sharedEventOf(scenes: StorySceneInput[]): string | undefined {
  const lists = scenes.map(eventTags);
  const first = lists[0] ?? [];
  return first.find((tag) => lists.every((list) => list.includes(tag)));
}

function sharedEventTag(a: StorySceneInput, b: StorySceneInput): string | undefined {
  const right = eventTags(b);
  return eventTags(a).find((tag) => right.includes(tag));
}

function eventTags(scene: StorySceneInput): string[] {
  const tags = new Set([...scene.tags, scene.scene, scene.activity].filter((tag): tag is string => Boolean(tag)));
  return ALBUM_STORY_CONFIG.eventTags.filter((tag) => tags.has(tag));
}

function seasonOf(iso: string): string | undefined {
  const day = tokyoDay(iso);
  if (!day) return undefined;
  const month = Number(day.slice(5, 7));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function mode(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 50;
  let shared = 0;
  for (const tag of left) if (right.has(tag)) shared += 1;
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 0;
  return Math.round((shared / union) * 100);
}

function photoCount(scene: StorySceneInput) {
  return scene.secondaryPhotoId ? 2 : 1;
}

function incompatibleActivities(a: StorySceneInput, b: StorySceneInput) {
  return isPair(ALBUM_STORY_CONFIG.incompatibleActivities, a.activity ?? "", b.activity ?? "");
}

function isPair(pairs: readonly (readonly string[])[], a: string, b: string) {
  return pairs.some((pair) => pair[0] === a && pair[1] === b);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function byTime(a: StorySceneInput, b: StorySceneInput) {
  return a.startedAt.localeCompare(b.startedAt) || a.groupId.localeCompare(b.groupId);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
