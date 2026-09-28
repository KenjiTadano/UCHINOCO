import assert from "node:assert/strict";
import { test } from "node:test";
import { ALBUM_CANDIDATES_VERSION } from "../lib/album-candidates/config.ts";
import {
  albumCandidateCacheKey,
  clearAlbumCandidateCache,
  getAlbumCandidateCache,
  setAlbumCandidateCache,
} from "../lib/album-candidates/cache.ts";
import { AlbumPeriodError, resolveAlbumPeriod } from "../lib/album-candidates/period.ts";
import { resolveAlbumBudget, scoreAlbumScene, selectAlbumCandidates as selectInPeriod } from "../lib/album-candidates/select.ts";

function selectAlbumCandidates(request) {
  if (request.period) return selectInPeriod(request);
  const times = request.scenes
    .map((item) => new Date(item.startedAt).getTime())
    .filter((time) => Number.isFinite(time));
  const startMs = Math.min(...times);
  const endMs = Math.max(...times);
  return selectInPeriod({
    ...request,
    period: {
      type: "custom",
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    },
  });
}

function scene(id, score, extra = {}) {
  const at = extra.at ?? "2026-07-02T08:00:00+09:00";
  return {
    groupId: id,
    startedAt: at,
    endedAt: at,
    scene: extra.scene ?? "home",
    activity: extra.activity ?? "playing",
    tags: extra.tags ?? [extra.scene ?? "home", extra.activity ?? "playing"],
    groupConfidence: extra.groupConfidence ?? score / 100,
    warnings: extra.warnings ?? [],
    selectionConfidence: extra.selectionConfidence ?? 0.9,
    memberCount: extra.memberCount ?? 3,
    primary: {
      photoId: `${id}-p`,
      bestShot: extra.bestShot ?? score,
      memoryValue: extra.memory ?? score,
      expression: extra.expression ?? score,
      petVisibility: extra.visibility ?? score,
      relativeUniqueness: extra.unique ?? score,
      sceneRepresentativeness: extra.rep ?? score,
      composition: extra.composition ?? score,
      framing: extra.framing ?? "medium",
      placement: extra.placement ?? "center",
      orientation: extra.orientation ?? "portrait",
    },
    secondary: extra.secondary,
  };
}

function ids(result) {
  return result.selectedScenes.map((item) => item.groupId);
}

/** Scene score near `target` without tripping the memory must-keep line. */
function close(id, target, extra = {}) {
  const memory = extra.memory ?? 80;
  const rest = (target - 0.2 * memory) / 0.8;
  return scene(id, rest, { ...extra, memory, groupConfidence: rest / 100 });
}

const tight = { targetScenes: 3, maxScenes: 3, minScenes: 1, maxPhotos: 12, targetPhotos: 6, minPhotos: 1 };

test("scene score uses the configured weights", () => {
  const scored = scoreAlbumScene(
    scene("mix", 80, {
      bestShot: 80,
      memory: 70,
      expression: 60,
      visibility: 90,
      unique: 50,
      rep: 70,
      groupConfidence: 0.8,
    }),
  );
  assert.equal(scored.sceneScore, 74);
  assert.equal(scored.mustKeep, false);
});

test("close playing scores give way to sleeping and eating", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 5,
    budget: tight,
    scenes: [
      close("A", 95, { activity: "playing" }),
      close("B", 94, { activity: "playing" }),
      close("C", 93, { activity: "playing" }),
      close("D", 90, { activity: "sleeping" }),
      close("E", 89, { activity: "eating" }),
    ],
  });
  assert.notDeepEqual(ids(result), ["A", "B", "C"]);
  assert.ok(ids(result).includes("A"));
  assert.ok(ids(result).includes("D") || ids(result).includes("E"));
  const playing = result.selectedScenes.filter((item) => item.activity === "playing");
  assert.ok(playing.length <= 2);
  assert.equal(result.analysisVersion, "album-candidates-v1");
});

test("a large quality gap keeps the stronger scenes", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    budget: tight,
    scenes: [
      close("A", 95, { activity: "playing" }),
      close("B", 94, { activity: "playing" }),
      close("C", 93, { activity: "playing" }),
      close("D", 60, { activity: "sleeping" }),
    ],
  });
  assert.deepEqual(ids(result), ["A", "B", "C"]);
  assert.equal(result.rejectedScenes[0].groupId, "D");
});

test("A: a home-only month can stay home", () => {
  const scenes = Array.from({ length: 30 }, (_, index) =>
    scene(`s${String(index).padStart(2, "0")}`, 90 - index, {
      at: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T10:00:00+09:00`,
    }),
  );
  const result = selectAlbumCandidates({ sourcePhotoCount: 30, scenes });
  assert.equal(result.stats.selectedSceneCount, 12);
  assert.equal(result.stats.sceneCount, 30);
  assert.ok(result.selectedScenes.every((item) => item.scene === "home"));
  assert.equal(result.balance.sceneDiversity, 100);
});

test("B: similar scores spread across weeks", () => {
  const scenes = [];
  for (let week = 0; week < 4; week++) {
    const day = 6 + week * 7;
    scenes.push(scene(`w${week}a`, 80, { at: `2026-07-${String(day).padStart(2, "0")}T10:00:00+09:00` }));
    scenes.push(scene(`w${week}b`, 79, { at: `2026-07-${String(day + 1).padStart(2, "0")}T10:00:00+09:00` }));
  }
  const result = selectAlbumCandidates({
    sourcePhotoCount: 24,
    budget: { targetScenes: 4, maxScenes: 4, minScenes: 4, maxPhotos: 8, targetPhotos: 4, minPhotos: 4 },
    scenes,
  });
  const weeks = new Set(
    result.selectedScenes.map((item) => item.groupId.slice(0, 2)),
  );
  assert.equal(weeks.size, 4);
  assert.equal(result.balance.timeCoverage, 100);
});

test("C: one crowded day does not fill the album", () => {
  const crowded = [90, 88, 86, 84, 82, 80].map((score, index) =>
    scene(`d1-${index}`, score, {
      at: "2026-07-01T10:00:00+09:00",
      activity: ["playing", "sleeping", "eating", "walking", "cuddling", "looking_camera"][index],
    }),
  );
  const result = selectAlbumCandidates({
    sourcePhotoCount: 8,
    budget: { targetScenes: 4, maxScenes: 4, minScenes: 1, maxPhotos: 8, targetPhotos: 4, minPhotos: 1 },
    scenes: [
      ...crowded,
      scene("d2", 85, { at: "2026-07-02T10:00:00+09:00", activity: "eating" }),
      scene("d3", 84, { at: "2026-07-03T10:00:00+09:00", activity: "walking" }),
    ],
  });
  const onFirst = result.selectedScenes.filter((item) => item.groupId.startsWith("d1")).length;
  assert.ok(onFirst <= 3);
  assert.ok(ids(result).includes("d2"));
  assert.ok(ids(result).includes("d3"));
  const crowdedReject = result.rejectedScenes.find((item) => item.groupId.startsWith("d1"));
  assert.ok(crowdedReject.selectionReason.includes("SAME_DAY_OVERREPRESENTED"));
});

test("D: a birthday gets a light bonus and does not become must-keep", () => {
  const close = selectAlbumCandidates({
    sourcePhotoCount: 2,
    budget: { ...tight, targetScenes: 1, maxScenes: 1 },
    scenes: [
      scene("plain", 86),
      scene("birthday", 84, { tags: ["home", "playing", "birthday"] }),
    ],
  });
  assert.deepEqual(ids(close), ["birthday"]);
  assert.equal(close.selectedScenes[0].mustKeep, false);
  assert.ok(close.selectedScenes[0].effectiveScore > close.selectedScenes[0].sceneScore);

  const far = selectAlbumCandidates({
    sourcePhotoCount: 2,
    budget: { ...tight, targetScenes: 1, maxScenes: 1 },
    scenes: [
      scene("strong", 95),
      scene("birthday", 84, { tags: ["home", "playing", "birthday"] }),
    ],
  });
  assert.deepEqual(ids(far), ["strong"]);
});

test("E: everyday sleeping scenes stay when they are the good photos", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    budget: tight,
    scenes: [88, 86, 84, 82].map((score, index) =>
      scene(`sleep-${index}`, score, { activity: "sleeping", at: `2026-07-0${index + 1}T21:00:00+09:00` }),
    ),
  });
  assert.equal(result.selectedScenes.length, 3);
  assert.ok(result.selectedScenes.every((item) => item.activity === "sleeping"));
});

test("F: a similar wide shot is kept over another close-up", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    budget: tight,
    scenes: [
      scene("face-a", 82, { framing: "close-up" }),
      scene("face-b", 81, { framing: "close-up" }),
      scene("face-c", 80, { framing: "close-up" }),
      scene("wide", 81, { framing: "wide" }),
    ],
  });
  assert.ok(ids(result).includes("wide"));
  assert.ok(ids(result).includes("face-a"));
  const repeated = result.rejectedScenes.find((item) => item.groupId === "face-c");
  assert.ok(repeated.selectionReason.includes("VISUAL_REPETITION"));
});

test("G: high quality same-scene shots beat a weak different scene", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    budget: tight,
    scenes: [
      scene("home-a", 90),
      scene("home-b", 88),
      scene("home-c", 86),
      scene("park", 62, { scene: "park", activity: "walking", framing: "wide" }),
    ],
  });
  assert.deepEqual(ids(result).sort(), ["home-a", "home-b", "home-c"]);
  assert.equal(result.rejectedScenes[0].groupId, "park");
});

test("H: high memory keeps a weak-looking scene when there is room", () => {
  const memoryScene = scene("memory", 40, {
    bestShot: 40,
    memory: 95,
    expression: 40,
    visibility: 40,
    unique: 40,
    rep: 40,
    groupConfidence: 0.5,
  });
  const both = selectAlbumCandidates({
    sourcePhotoCount: 2,
    budget: { ...tight, targetScenes: 2, maxScenes: 2 },
    scenes: [scene("strong", 85), memoryScene],
  });
  assert.ok(ids(both).includes("memory"));
  assert.equal(both.selectedScenes.find((item) => item.groupId === "memory").mustKeep, true);

  const only = selectAlbumCandidates({
    sourcePhotoCount: 2,
    budget: { ...tight, targetScenes: 1, maxScenes: 1 },
    scenes: [scene("strong", 85), memoryScene],
  });
  assert.deepEqual(ids(only), ["strong"]);
});

test("I: secondaries stay within a quarter of the album", () => {
  const scenes = Array.from({ length: 8 }, (_, index) =>
    scene(`g${index}`, 80, {
      at: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00+09:00`,
      activity: index % 2 === 0 ? "playing" : "sleeping",
      secondary: {
        photoId: `g${index}-s`,
        bestShot: 90 - index,
        memoryValue: 80,
        visualSimilarityToPrimary: 40,
      },
    }),
  );
  const result = selectAlbumCandidates({
    sourcePhotoCount: 16,
    budget: { targetScenes: 8, maxScenes: 8, minScenes: 8, maxPhotos: 16, targetPhotos: 16, minPhotos: 8 },
    scenes,
  });
  assert.equal(result.stats.primaryCount, 8);
  assert.equal(result.stats.secondaryCount, 2);
  assert.ok(result.stats.secondaryCount / result.stats.selectedPhotoCount <= 0.25);
  assert.equal(result.selectedPhotoIds.length, 10);
});

test("J: a small library is not padded to a monthly target", () => {
  const budget = resolveAlbumBudget(2, 3);
  assert.equal(budget.targetPhotos, 3);
  assert.equal(budget.targetScenes, 2);
  assert.notEqual(budget.targetPhotos, 24);
  const result = selectAlbumCandidates({
    sourcePhotoCount: 3,
    scenes: [
      scene("one", 80, { secondary: { photoId: "one-s", bestShot: 90, memoryValue: 80, visualSimilarityToPrimary: 30 } }),
      scene("two", 78),
    ],
  });
  assert.equal(result.stats.selectedSceneCount, 2);
  assert.equal(result.stats.secondaryCount, 0);
  assert.ok(result.stats.selectedPhotoCount <= 3);
});

test("a richer same-morning scene replaces a slightly higher singleton", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 5,
    budget: { targetScenes: 1, maxScenes: 1, minScenes: 1, maxPhotos: 5, targetPhotos: 1, minPhotos: 1 },
    scenes: [
      scene("solo", 83, { memberCount: 1, bestShot: 83 }),
      scene("group", 80, { memberCount: 4, bestShot: 82 }),
    ],
  });
  assert.deepEqual(ids(result), ["group"]);
  assert.ok(result.rejectedScenes[0].selectionReason.includes("PHOTO_BUDGET_REACHED"));
});

test("a near-duplicate secondary is left out", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 6,
    budget: { targetScenes: 3, maxScenes: 3, minScenes: 1, maxPhotos: 6, targetPhotos: 6, minPhotos: 1 },
    scenes: [
      scene("dup", 90, {
        secondary: { photoId: "dup-s", bestShot: 88, memoryValue: 80, visualSimilarityToPrimary: 92 },
      }),
      scene("ok", 80, {
        activity: "sleeping",
        secondary: { photoId: "ok-s", bestShot: 86, memoryValue: 80, visualSimilarityToPrimary: 50 },
      }),
      scene("plain", 70, { activity: "eating" }),
    ],
  });
  const duplicate = result.selectedScenes.find((item) => item.groupId === "dup");
  assert.equal(duplicate.secondaryPhotoId, undefined);
});

test("an ambiguous singleton is lowered a little and still eligible", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 2,
    budget: { ...tight, targetScenes: 2, maxScenes: 2 },
    scenes: [
      scene("clean", 80, { memberCount: 1 }),
      scene("split", 80, { memberCount: 1, warnings: ["GROUP_AMBIGUOUS"] }),
    ],
  });
  const split = result.selectedScenes.find((item) => item.groupId === "split");
  assert.equal(split.sceneScore, 77);
  assert.equal(result.stats.selectedSceneCount, 2);
});

test("a very weak photo is not added just to cover an empty week", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    budget: { targetScenes: 4, maxScenes: 4, minScenes: 1, maxPhotos: 4, targetPhotos: 4, minPhotos: 1 },
    scenes: [
      scene("good-a", 90, { at: "2026-07-02T10:00:00+09:00" }),
      scene("good-b", 88, { at: "2026-07-03T10:00:00+09:00", activity: "sleeping" }),
      scene("good-c", 86, { at: "2026-07-04T10:00:00+09:00", activity: "eating" }),
      scene("bad-week", 48, { at: "2026-07-20T10:00:00+09:00", activity: "walking", scene: "park" }),
    ],
  });
  assert.ok(!ids(result).includes("bad-week"));
  assert.ok(result.rejectedScenes.find((item) => item.groupId === "bad-week").selectionReason.includes("LOW_SCENE_SCORE"));
});

test("monthly period drops photos from other months and years", () => {
  const july = resolveAlbumPeriod({ type: "monthly", year: 2026, month: 7 });
  const result = selectInPeriod({
    availablePhotoCount: 4,
    period: july,
    scenes: [
      scene("july-a", 88, { at: "2026-07-02T10:00:00+09:00", memberCount: 1 }),
      scene("july-b", 84, { at: "2026-07-20T10:00:00+09:00", activity: "sleeping", memberCount: 2 }),
      scene("august", 90, { at: "2026-08-01T00:00:00+09:00", memberCount: 1 }),
      scene("other-year", 92, { at: "2023-07-02T10:00:00+09:00", memberCount: 1 }),
    ],
  });
  const kept = [...result.selectedScenes, ...result.rejectedScenes].map((item) => item.groupId);
  assert.deepEqual(kept.sort(), ["july-a", "july-b"]);
  assert.equal(result.stats.availablePhotoCount, 4);
  assert.equal(result.stats.periodPhotoCount, 3);
  assert.equal(result.period.type, "monthly");
  assert.ok(result.period.start < result.period.end);
});

test("B: a month boundary keeps 9/1 and drops 8/31", () => {
  const september = resolveAlbumPeriod({ type: "monthly", year: 2026, month: 9 });
  const result = selectInPeriod({
    availablePhotoCount: 2,
    period: september,
    scenes: [
      scene("aug", 90, { at: "2026-08-31T23:59:00+09:00" }),
      scene("sep", 80, { at: "2026-09-01T00:00:00+09:00" }),
    ],
  });
  assert.deepEqual(ids(result), ["sep"]);
  assert.equal(result.rejectedScenes.length, 0);
  assert.equal(result.stats.periodPhotoCount, 3);
});

test("C: a year boundary keeps January and drops December", () => {
  const year = resolveAlbumPeriod({ type: "yearly", year: 2026 });
  const result = selectInPeriod({
    availablePhotoCount: 2,
    period: year,
    scenes: [
      scene("dec", 90, { at: "2025-12-31T23:59:00+09:00" }),
      scene("jan", 80, { at: "2026-01-01T00:00:00+09:00" }),
    ],
  });
  assert.deepEqual(ids(result), ["jan"]);
  assert.equal(result.stats.periodPhotoCount, 3);
  assert.ok(result.period.start < result.period.end);
});

test("D: a single-activity library is not scored as unbalanced", () => {
  const result = selectAlbumCandidates({
    sourcePhotoCount: 4,
    scenes: [88, 86, 84, 82].map((score, index) =>
      scene(`play-${index}`, score, { activity: "playing", at: `2026-07-0${index + 1}T10:00:00+09:00` }),
    ),
  });
  assert.equal(result.balance.activityDiversity, 100);
  assert.equal(result.balance.dominant.activity.key, "playing");
  assert.equal(result.balance.dominant.activity.ratio, 1);
});

test("E: collapsing a mixed library onto one activity lowers the balance", () => {
  const playing = [90, 88, 86, 84, 82].map((score, index) =>
    scene(`play-${index}`, score, { activity: "playing", at: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00+09:00` }),
  );
  const others = [
    scene("sleep", 40, { activity: "sleeping", at: "2026-07-10T10:00:00+09:00" }),
    scene("eat", 40, { activity: "eating", at: "2026-07-12T10:00:00+09:00" }),
    scene("walk", 40, { activity: "walking", at: "2026-07-14T10:00:00+09:00" }),
  ];
  const result = selectInPeriod({
    period: resolveAlbumPeriod({ type: "monthly", year: 2026, month: 7 }),
    budget: { targetScenes: 5, maxScenes: 5, minScenes: 1, maxPhotos: 8, targetPhotos: 5, minPhotos: 1 },
    scenes: [...playing, ...others],
  });
  assert.ok(result.selectedScenes.every((item) => item.activity === "playing"));
  assert.ok(result.balance.activityDiversity < 100);
  assert.equal(result.balance.dominant.activity.key, "playing");
  assert.equal(result.balance.dominant.activity.ratio, 1);
});

test("F: a day that holds most scenes is reported as dominant", () => {
  const crowded = Array.from({ length: 8 }, (_, index) =>
    scene(`busy-${index}`, 80, {
      at: "2026-07-02T10:00:00+09:00",
      activity: ["playing", "sleeping", "eating", "walking", "cuddling", "looking_camera", "playing", "eating"][index],
    }),
  );
  const result = selectInPeriod({
    period: resolveAlbumPeriod({ type: "monthly", year: 2026, month: 7 }),
    budget: { targetScenes: 10, maxScenes: 10, minScenes: 1, maxPhotos: 10, targetPhotos: 10, minPhotos: 1 },
    scenes: [
      ...crowded,
      scene("later-a", 80, { at: "2026-07-20T10:00:00+09:00", activity: "sleeping" }),
      scene("later-b", 80, { at: "2026-07-21T10:00:00+09:00", activity: "eating" }),
    ],
  });
  assert.equal(result.balance.dominant.day.key, "2026-07-02");
  assert.ok(result.balance.dominant.day.ratio >= 0.8);
});

test("G: four populated weeks stay covered", () => {
  const scenes = [1, 8, 15, 22].map((day, index) =>
    scene(`week-${index}`, 80, { at: `2026-07-${String(day).padStart(2, "0")}T10:00:00+09:00`, activity: "playing" }),
  );
  const result = selectInPeriod({
    period: resolveAlbumPeriod({ type: "monthly", year: 2026, month: 7 }),
    scenes,
  });
  assert.equal(result.stats.selectedSceneCount, 4);
  assert.equal(result.balance.timeCoverage, 100);
  assert.equal(result.balance.dominant.activity.ratio, 1);
});

test("start after end is rejected", () => {
  assert.throws(
    () => resolveAlbumPeriod({ type: "custom", start: "2026-09-01T00:00:00+09:00", end: "2026-08-01T00:00:00+09:00" }),
    AlbumPeriodError,
  );
  assert.throws(
    () =>
      selectInPeriod({
        period: { type: "custom", start: "2026-09-01T00:00:00.000Z", end: "2026-08-01T00:00:00.000Z" },
        scenes: [scene("x", 80)],
      }),
    AlbumPeriodError,
  );
});

test("cache key uses period, pet, scene ids, and version", () => {
  clearAlbumCandidateCache();
  const period = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T00:00:00.000Z" };
  const key = albumCandidateCacheKey("pet", period, ["b", "a"], "fp");
  const again = albumCandidateCacheKey("pet", period, ["a", "b"], "fp");
  assert.equal(key, again);
  assert.ok(key.startsWith(`${ALBUM_CANDIDATES_VERSION}::`));
  const sample = selectAlbumCandidates({ scenes: [scene("only", 80)] });
  setAlbumCandidateCache(key, sample);
  assert.equal(getAlbumCandidateCache(key)?.analysisVersion, ALBUM_CANDIDATES_VERSION);
  clearAlbumCandidateCache();
  assert.equal(getAlbumCandidateCache(key), null);
});
