const SCENES = new Set(["home", "outdoors", "travel", "cafe", "park"]);
const ACTIVITIES = new Set([
  "sleeping",
  "playing",
  "eating",
  "looking_camera",
  "cuddling",
  "walking",
]);

/** These can appear together in one short scene. Eating and sleeping cannot. */
const COMPATIBLE: Record<string, string[]> = {
  playing: ["looking_camera", "walking"],
  looking_camera: ["playing", "walking"],
  walking: ["playing", "looking_camera"],
};

function pick(tags: string[], vocabulary: Set<string>) {
  return tags.find((tag) => vocabulary.has(tag)) ?? null;
}

export function activityConflict(a: string | null, b: string | null) {
  if (!a || !b || a === b) return false;
  if (COMPATIBLE[a]?.includes(b) || COMPATIBLE[b]?.includes(a)) return false;
  return true;
}

/**
 * Scene / activity / tags from Photo Intelligence.
 * The keeper overall score is intentionally unused.
 */
export function scoreSemanticSimilarity(tagsA: string[] | null, tagsB: string[] | null): number {
  if (!tagsA || !tagsB) return 48;
  const sceneA = pick(tagsA, SCENES);
  const sceneB = pick(tagsB, SCENES);
  const activityA = pick(tagsA, ACTIVITIES);
  const activityB = pick(tagsB, ACTIVITIES);

  if (sceneA && sceneB && sceneA !== sceneB) return 18;
  if (activityConflict(activityA, activityB)) return 28;

  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  const union = new Set([...setA, ...setB]);
  const intersection = [...setA].filter((tag) => setB.has(tag)).length;
  const jaccard = union.size === 0 ? 0.5 : intersection / union.size;

  let score = 58 + jaccard * 42;
  if (sceneA && sceneA === sceneB) score += 6;
  if (activityA && activityA === activityB) score += 8;
  return Math.round(Math.min(100, score));
}

export function sceneAndActivity(tags: string[]) {
  return {
    scene: pick(tags, SCENES) ?? undefined,
    activity: pick(tags, ACTIVITIES) ?? undefined,
  };
}
