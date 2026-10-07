import assert from "node:assert/strict";
import { test } from "node:test";
import { BEST_SHOT_VERSION } from "../lib/best-shot/config.ts";
import { bestShotCacheKey, clearBestShotCache, getBestShotCache, getBestShotCacheByPhotoIds, setBestShotCache } from "../lib/best-shot/cache.ts";
import { selectBestShot } from "../lib/best-shot/select.ts";
import { visualPairKey } from "../lib/best-shot/score.ts";

function intel(overall, extra = {}) {
  return {
    overallScore: overall,
    expression: extra.expression ?? 80,
    petVisibility: extra.visibility ?? 80,
    technicalQuality: extra.technical ?? 80,
    composition: extra.composition ?? 80,
    memoryValue: extra.memory ?? 80,
    confidence: extra.confidence ?? 0.9,
    tags: extra.tags ?? ["home", "playing"],
    warnings: extra.warnings ?? [],
    status: extra.status ?? "ok",
  };
}

function photo(id, overall, extra = {}) {
  return {
    photoId: id,
    intelligence: intel(overall, extra),
    relativeUniqueness: extra.unique ?? 40,
    sharpness: extra.sharpness ?? 80,
  };
}

function group(photos, extra = {}) {
  const visualSimilarity = {};
  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      visualSimilarity[visualPairKey(photos[i].photoId, photos[j].photoId)] = extra.similarity ?? 60;
    }
  }
  if (extra.pairs) Object.assign(visualSimilarity, extra.pairs);
  return {
    id: extra.id ?? "g1",
    scene: extra.scene ?? "home",
    activity: extra.activity ?? "playing",
    tags: extra.tags ?? ["home", "playing"],
    groupConfidence: extra.groupConfidence ?? 0.9,
    warnings: extra.warnings ?? [],
    visualSimilarity,
    geometrySimilarity: extra.geometry,
  };
}

test("a singleton stays primary without a contest", () => {
  const only = photo("only", 70, { expression: 40, technical: 30, visibility: 20, status: "low_quality" });
  const result = selectBestShot(group([only], { groupConfidence: 1 }), [only]);
  assert.equal(result.primaryPhotoId, "only");
  assert.equal(result.secondaryPhotoId, undefined);
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.analysisVersion, BEST_SHOT_VERSION);
  assert.equal(result.ranking[0].role, "primary");
});

test("the highest keeper score does not automatically win", () => {
  const sharpKeeper = photo("keeper", 90, {
    expression: 55,
    visibility: 60,
    technical: 88,
    composition: 70,
    memory: 70,
    unique: 12,
    sharpness: 92,
  });
  const sceneShot = photo("scene", 82, {
    expression: 90,
    visibility: 92,
    technical: 80,
    composition: 84,
    memory: 86,
    unique: 62,
    sharpness: 74,
  });
  const result = selectBestShot(group([sharpKeeper, sceneShot]), [sharpKeeper, sceneShot]);
  assert.equal(result.primaryPhotoId, "scene");
  assert.ok(result.ranking[0].scores.overall > result.ranking[1].scores.overall);
});

test("relative uniqueness can beat a one-point keeper lead", () => {
  const common = photo("common", 85, { unique: 15, expression: 80, visibility: 80, technical: 80 });
  const distinct = photo("distinct", 84, { unique: 60, expression: 80, visibility: 80, technical: 80 });
  const result = selectBestShot(group([common, distinct]), [common, distinct]);
  assert.equal(result.primaryPhotoId, "distinct");
});

test("a rare blurry frame does not become primary", () => {
  const odd = photo("odd", 78, { unique: 95, technical: 42, visibility: 45, expression: 70, sharpness: 40 });
  const steady = photo("steady", 76, { unique: 30, technical: 84, visibility: 86, expression: 80, sharpness: 78 });
  const result = selectBestShot(group([odd, steady]), [odd, steady]);
  assert.equal(result.primaryPhotoId, "steady");
});

test("sharper wins a tie, and expression still beats a large focus gap", () => {
  const crisp = photo("crisp", 80, { sharpness: 94, expression: 80 });
  const soft = photo("soft", 80, { sharpness: 60, expression: 80 });
  const focus = selectBestShot(group([crisp, soft]), [crisp, soft]);
  assert.equal(focus.primaryPhotoId, "crisp");

  const expressive = photo("face", 80, { sharpness: 48, expression: 94 });
  const focused = photo("focus", 80, { sharpness: 96, expression: 60 });
  const mood = selectBestShot(group([expressive, focused]), [expressive, focused]);
  assert.equal(mood.primaryPhotoId, "face");
});

test("playing scene prefers the playing frame when keeper scores match", () => {
  const stare = photo("stare", 82, { tags: ["home", "looking_camera"], expression: 82, unique: 40 });
  const play = photo("play", 82, { tags: ["home", "playing"], expression: 82, unique: 40 });
  const result = selectBestShot(group([stare, play], { activity: "playing", tags: ["home", "playing"] }), [stare, play]);
  assert.equal(result.primaryPhotoId, "play");
  assert.ok(result.ranking[0].scores.sceneRepresentativeness > result.ranking[1].scores.sceneRepresentativeness);
});

test("secondary is a different view, not a near duplicate", () => {
  const primary = photo("front", 88, { expression: 90, unique: 40, composition: 80 });
  const twin = photo("twin", 86, { expression: 88, unique: 18, composition: 80 });
  const side = photo("side", 84, { expression: 74, unique: 68, composition: 70, memory: 82 });
  const pairs = {
    [visualPairKey("front", "twin")]: 94,
    [visualPairKey("front", "side")]: 62,
    [visualPairKey("twin", "side")]: 58,
  };
  const result = selectBestShot(group([primary, twin, side], { pairs, similarity: 60 }), [primary, twin, side]);
  assert.equal(result.primaryPhotoId, "front");
  assert.equal(result.secondaryPhotoId, "side");
  const twinRank = result.ranking.find((candidate) => candidate.photoId === "twin");
  assert.equal(twinRank.role, "alternate");
  assert.ok(twinRank.scores.duplicationPenalty >= 16);

  const copies = ["a", "b", "c", "d", "e"].map((id, index) => photo(id, 90 - index, { unique: 15, expression: 80, composition: 80 }));
  const burst = selectBestShot(group(copies, { similarity: 93 }), copies);
  assert.equal(burst.secondaryPhotoId, undefined);
});

test("a similar stance does not become secondary when a different pose is available", () => {
  const primary = photo("front", 88, { expression: 85, composition: 91, unique: 51 });
  const sameStance = photo("far", 83, { expression: 85, composition: 85, unique: 59 });
  const crouch = photo("low", 81, { expression: 85, composition: 82, unique: 53, memory: 78 });
  const result = selectBestShot(
    group([primary, sameStance, crouch], {
      pairs: {
        [visualPairKey("front", "far")]: 63,
        [visualPairKey("front", "low")]: 69,
        [visualPairKey("far", "low")]: 65,
      },
      geometry: {
        [visualPairKey("front", "far")]: 58,
        [visualPairKey("front", "low")]: 37,
        [visualPairKey("far", "low")]: 41,
      },
    }),
    [primary, sameStance, crouch],
  );
  assert.equal(result.primaryPhotoId, "front");
  assert.equal(result.secondaryPhotoId, "low");
});

test("two near-duplicate photos keep only a primary", () => {
  const a = photo("a", 88, { expression: 84, composition: 82, unique: 20 });
  const b = photo("b", 86, { expression: 82, composition: 80, unique: 18 });
  const result = selectBestShot(
    group([a, b], {
      similarity: 92,
      geometry: { [visualPairKey("a", "b")]: 80 },
    }),
    [a, b],
  );
  assert.equal(result.secondaryPhotoId, undefined);
});

test("two photos with a different expression and framing keep a secondary", () => {
  const front = photo("front", 88, { expression: 90, composition: 78, memory: 82, unique: 40 });
  const side = photo("side", 82, { expression: 72, composition: 90, memory: 80, unique: 64 });
  const result = selectBestShot(group([front, side], { similarity: 58 }), [front, side]);
  assert.equal(result.primaryPhotoId, "front");
  assert.equal(result.secondaryPhotoId, "side");
});

test("a weak second photo in a pair is not kept", () => {
  const clear = photo("clear", 86, { expression: 88, composition: 84, memory: 80, technical: 90, visibility: 90 });
  const weak = photo("weak", 60, {
    expression: 48,
    composition: 50,
    memory: 62,
    technical: 32,
    visibility: 36,
    unique: 40,
  });
  const result = selectBestShot(group([clear, weak], { similarity: 50 }), [clear, weak]);
  assert.equal(result.primaryPhotoId, "clear");
  assert.equal(result.secondaryPhotoId, undefined);
  assert.ok(result.ranking.find((candidate) => candidate.photoId === "weak").scores.overall < 75);
});

test("an ambiguous group lowers selection confidence and keeps a warning", () => {
  const a = photo("a", 88, { expression: 92, unique: 55 });
  const b = photo("b", 70, { expression: 60, unique: 40 });
  const c = photo("c", 68, { expression: 58, unique: 42 });
  const result = selectBestShot(group([a, b, c], { groupConfidence: 0.72, warnings: ["AMBIGUOUS_GROUP"], similarity: 60 }), [a, b, c]);
  assert.ok(result.warnings.includes("GROUP_AMBIGUOUS"));
  assert.ok(result.confidence <= 0.85, String(result.confidence));
  assert.ok(result.confidence < 1);
  assert.equal(result.ranking[0].role, "primary");
  assert.deepEqual(
    result.ranking.map((candidate) => candidate.rank),
    [1, 2, 3],
  );
});

test("best shot cache key includes version, group, and sorted photo ids", () => {
  clearBestShotCache();
  const key = bestShotCacheKey("g9", ["b", "a"], "fp");
  assert.equal(key, bestShotCacheKey("g9", ["a", "b"], "fp"));
  assert.ok(key.startsWith(`${BEST_SHOT_VERSION}::`));
  const sample = selectBestShot(group([photo("a", 80)]), [photo("a", 80)]);
  setBestShotCache(key, sample);
  assert.equal(getBestShotCache(key)?.primaryPhotoId, "a");
  const byPhotoId = getBestShotCacheByPhotoIds(["a", "missing"]);
  assert.deepEqual([...byPhotoId.keys()], ["a"]);
  assert.equal(byPhotoId.get("a")?.candidate.role, "primary");
  assert.equal(byPhotoId.get("a")?.candidate.scores.sceneRepresentativeness, sample.ranking[0].scores.sceneRepresentativeness);
  assert.equal(byPhotoId.get("a")?.confidence, sample.confidence);
  clearBestShotCache();
  assert.equal(getBestShotCache(key), null);
});
