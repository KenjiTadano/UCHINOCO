import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAlbumPeriod } from "../lib/album-candidates/period.ts";
import { ALBUM_STORY_VERSION } from "../lib/album-story/config.ts";
import { albumStoryCacheKey, clearAlbumStoryCache, getAlbumStoryCache, setAlbumStoryCache } from "../lib/album-story/cache.ts";
import { buildAlbumStory } from "../lib/album-story/group.ts";

const july = resolveAlbumPeriod({ type: "monthly", year: 2026, month: 7 });

function scene(id, extra = {}) {
  const activity = extra.activity ?? "playing";
  const place = extra.scene ?? "home";
  return {
    groupId: id,
    startedAt: extra.at ?? "2026-07-02T01:00:00.000Z",
    scene: place,
    activity,
    tags: extra.tags ?? [place, activity],
    sceneScore: extra.score ?? 80,
    mustKeep: extra.mustKeep ?? false,
    bestShot: extra.bestShot ?? extra.score ?? 80,
    memoryValue: extra.memory ?? extra.score ?? 80,
    framing: extra.framing,
    primaryPhotoId: extra.primary ?? `${id}-p`,
    secondaryPhotoId: extra.secondary,
  };
}

function story(scenes, period = july) {
  return buildAlbumStory({ period, scenes });
}

function ids(result) {
  return result.spreads.map((spread) => spread.sceneIds.join("+"));
}

test("A: two close scenes of the same activity share a spread", () => {
  const result = story([
    scene("a", { at: "2026-07-02T01:00:00.000Z" }),
    scene("b", { at: "2026-07-02T01:10:00.000Z" }),
  ]);
  assert.equal(result.spreads.length, 1);
  assert.equal(result.spreads[0].storyType, "same_day");
  assert.ok(result.spreads[0].coherenceScore >= 80);
  assert.equal(result.analysisVersion, "album-story-v1");
});

test("B: breakfast and play on the same day stay apart", () => {
  const result = story([
    scene("morning", { at: "2026-07-02T23:00:00.000Z", activity: "playing" }),
    scene("lunch", { at: "2026-07-03T03:00:00.000Z", activity: "eating" }),
  ]);
  assert.deepEqual(ids(result), ["morning", "lunch"]);
});

test("C: scenes from the same event can share a spread", () => {
  const result = story([
    scene("cake", { at: "2026-07-10T03:00:00.000Z", tags: ["home", "playing", "birthday"], activity: "playing" }),
    scene("gift", { at: "2026-07-10T03:12:00.000Z", tags: ["home", "playing", "birthday"], activity: "playing" }),
  ]);
  assert.equal(result.spreads.length, 1);
  assert.equal(result.spreads[0].storyType, "event");
  assert.equal(result.spreads[0].theme.event, "birthday");
});

test("D: ordinary scenes on different days stay apart", () => {
  const result = story([
    scene("d1", { at: "2026-07-02T01:00:00.000Z" }),
    scene("d3", { at: "2026-07-04T01:00:00.000Z" }),
  ]);
  assert.equal(result.spreads.length, 2);
  assert.equal(result.storyBalance.chronology, 100);
});

test("E: a very strong single photo can be its own hero spread", () => {
  const result = story([
    scene("face", { score: 96, memory: 96, bestShot: 96, mustKeep: true, activity: "looking_camera" }),
  ]);
  assert.equal(result.spreads.length, 1);
  assert.equal(result.spreads[0].storyType, "single");
  assert.equal(result.spreads[0].recommendedDensity, "hero");
  assert.equal(result.spreads[0].photoIds.length, 1);
  assert.ok(result.spreads[0].importance >= 90);
});

test("F: a secondary stays on the primary spread", () => {
  const result = story([
    scene("play", { secondary: "play-s" }),
    scene("other", { at: "2026-07-04T01:00:00.000Z", activity: "sleeping" }),
  ]);
  const play = result.spreads.find((spread) => spread.sceneIds.includes("play"));
  assert.deepEqual(play.secondaryPhotoIds, ["play-s"]);
  assert.ok(play.photoIds.includes("play-p"));
  assert.ok(play.photoIds.includes("play-s"));
  assert.equal(result.spreads.some((spread) => spread.photoIds.length === 1 && spread.photoIds[0] === "play-s"), false);
});

test("G: related scenes stop at the photo budget", () => {
  const scenes = [0, 5, 10, 15].map((minute, index) =>
    scene(`g${index}`, {
      at: `2026-07-02T01:${String(minute).padStart(2, "0")}:00.000Z`,
      secondary: `g${index}-s`,
    }),
  );
  const result = story(scenes);
  assert.ok(result.spreads.length >= 2);
  assert.ok(result.spreads.every((spread) => spread.photoIds.length <= 6));
  assert.ok(result.warnings.includes("PHOTO_BUDGET"));
});

test("H: a chain does not pull three scenes into one spread", () => {
  const result = story([
    scene("A", { at: "2026-07-02T01:00:00.000Z", activity: "playing" }),
    scene("B", { at: "2026-07-02T01:10:00.000Z", activity: "looking_camera" }),
    scene("C", { at: "2026-07-02T01:20:00.000Z", activity: "sleeping" }),
  ]);
  assert.equal(result.spreads.some((spread) => spread.sceneIds.length === 3), false);
  assert.ok(result.warnings.includes("CHAIN_SEPARATED"));
  assert.deepEqual(result.spreads[0].sceneIds, ["A", "B"]);
});

test("I: morning and night on the same day stay apart", () => {
  const result = story([
    scene("breakfast", { at: "2026-07-02T23:00:00.000Z", activity: "eating" }),
    scene("sleep", { at: "2026-07-03T13:00:00.000Z", activity: "sleeping" }),
  ]);
  assert.equal(result.spreads.length, 2);
  assert.ok(result.spreads.every((spread) => spread.coherenceScore === 100));
});

test("J: three travel days can split when the last day is a different activity", () => {
  const trip = ["2026-07-01", "2026-07-02", "2026-07-03"];
  const result = story(
    trip.map((day, index) =>
      scene(`day${index + 1}`, {
        at: `${day}T02:00:00.000Z`,
        scene: "outdoors",
        activity: index === 2 ? "eating" : "playing",
        tags: ["travel", "outdoors", index === 2 ? "eating" : "playing"],
      }),
    ),
  );
  assert.equal(result.spreads.length, 2);
  assert.deepEqual(result.spreads[0].sceneIds, ["day1", "day2"]);
  assert.deepEqual(result.spreads[1].sceneIds, ["day3"]);
  assert.ok(result.spreads.every((spread) => spread.storyType === "event"));
  assert.equal(result.storyBalance.chronology, 100);
});

test("July 2023 selected scenes keep play and the meal apart", () => {
  const period = resolveAlbumPeriod({ type: "monthly", year: 2023, month: 7 });
  const result = story(
    [
      scene("look", {
        at: "2023-07-01T08:15:00+00:00",
        activity: "looking_camera",
        tags: ["curious_look", "everyday", "everyday_moment", "home", "looking_camera", "relaxed", "young_cat"],
        score: 86,
        bestShot: 87,
        memory: 70,
        primary: "6e407fca",
      }),
      scene("toy", {
        at: "2023-07-01T08:15:00+00:00",
        activity: "playing",
        tags: ["action", "focused", "home", "indoor_play", "kitten", "playful", "playing"],
        score: 82,
        bestShot: 85,
        memory: 70,
        primary: "8f3ac783",
      }),
      scene("play", {
        at: "2023-07-01T23:01:00+00:00",
        activity: "playing",
        tags: ["everyday", "home", "curious", "kitten", "playful", "playing"],
        score: 80,
        bestShot: 84,
        memory: 78,
        primary: "736ba321",
        secondary: "4c8d611f",
      }),
      scene("meal", {
        at: "2023-07-02T03:13:00+00:00",
        activity: "eating",
        tags: ["eating", "eating_time", "everyday", "everyday_moment", "focused", "home"],
        score: 83,
        bestShot: 84,
        memory: 75,
        primary: "518333d3",
      }),
    ],
    period,
  );
  assert.deepEqual(
    result.spreads.map((spread) => spread.sceneIds),
    [["look", "toy"], ["play"], ["meal"]],
  );
  assert.deepEqual(result.spreads[1].photoIds, ["736ba321", "4c8d611f"]);
  assert.equal(result.spreads[1].recommendedDensity, "light");
  assert.equal(result.spreads[0].storyType, "same_day");
  assert.equal(result.storyBalance.chronology, 100);
  assert.ok(result.spreads[0].startedAt < result.spreads[1].startedAt);
  assert.ok(result.spreads[1].startedAt < result.spreads[2].startedAt);
});

test("flat four-photo spreads score a lower pace", () => {
  const result = story([
    scene("a", { at: "2026-07-01T01:00:00.000Z", secondary: "a-s" }),
    scene("b", { at: "2026-07-01T01:05:00.000Z", secondary: "b-s" }),
    scene("c", { at: "2026-07-08T01:00:00.000Z", secondary: "c-s" }),
    scene("d", { at: "2026-07-08T01:05:00.000Z", secondary: "d-s" }),
    scene("e", { at: "2026-07-15T01:00:00.000Z", secondary: "e-s" }),
    scene("f", { at: "2026-07-15T01:05:00.000Z", secondary: "f-s" }),
  ]);
  assert.ok(result.spreads.length >= 3);
  assert.ok(result.spreads.every((spread) => spread.photoIds.length === 4));
  assert.ok(result.storyBalance.pacing < 70);
});

test("cache key uses period, selected scenes, and version", () => {
  clearAlbumStoryCache();
  const key = albumStoryCacheKey("pet", july, ["b", "a"], "fp");
  const again = albumStoryCacheKey("pet", july, ["a", "b"], "fp");
  assert.equal(key, again);
  assert.ok(key.startsWith(`${ALBUM_STORY_VERSION}::`));
  const sample = story([scene("only")]);
  setAlbumStoryCache(key, sample);
  assert.equal(getAlbumStoryCache(key)?.analysisVersion, ALBUM_STORY_VERSION);
  clearAlbumStoryCache();
  assert.equal(getAlbumStoryCache(key), null);
});
