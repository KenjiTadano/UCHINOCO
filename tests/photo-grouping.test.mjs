import assert from "node:assert/strict";
import { test } from "node:test";
import { PHOTO_GROUPING_VERSION } from "../lib/photo-grouping/config.ts";
import { buildSceneGroups } from "../lib/photo-grouping/group.ts";
import { clearGroupingPairCache, scorePhotoPair } from "../lib/photo-grouping/pair.ts";
import { scoreTimeProximity, tokyoDay } from "../lib/photo-grouping/time.ts";
import { descriptorFromRgba } from "../lib/photo-grouping/visual.ts";

function rgba(width, height, paint) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function room(shift, floor = [214, 176, 132]) {
  return rgba(96, 72, (x, y) => {
    const cx = 38 + shift;
    const cy = 40;
    const inside = (x - cx) ** 2 / 140 + (y - cy) ** 2 / 180 < 1;
    if (inside) return [214, 132, 64];
    if (y > 48) return floor;
    return [232, 224, 210];
  });
}

function face() {
  return rgba(96, 72, (x, y) => {
    const inside = (x - 48) ** 2 / 500 + (y - 36) ** 2 / 420 < 1;
    return inside ? [196, 120, 70] : [40, 36, 32];
  });
}

function park() {
  return rgba(96, 72, (x, y) => {
    if (y < 30) return [120, 176, 214];
    if ((x - 60) ** 2 + (y - 46) ** 2 < 180) return [214, 132, 64];
    return [86, 140, 72];
  });
}

const pet = {
  bbox: { x: 0.22, y: 0.28, width: 0.4, height: 0.5 },
  face: { x: 0.32, y: 0.3, width: 0.16, height: 0.16 },
  confidence: 0.9,
};

function analysis(pets = [pet], focal = { x: 0.42, y: 0.42 }) {
  return {
    width: 1600,
    height: 1200,
    orientation: "landscape",
    focalPoint: focal,
    pets,
    analysisConfidence: { petDetection: 0.9 },
  };
}

function intelligence(photoId, tags, overallScore = 80) {
  return {
    photoId,
    technicalQuality: 90,
    petVisibility: 88,
    expression: 80,
    composition: 80,
    uniqueness: 50,
    memoryValue: 70,
    overallScore,
    confidence: 0.9,
    tags,
    reasons: [],
    warnings: [],
    analysisVersion: "photo-intelligence-v1",
    status: "ok",
  };
}

function photo(id, at, image, tags, extra = {}) {
  const boxes = (extra.analysis ?? analysis()).pets.map((item) => item.bbox);
  return {
    photoId: id,
    capturedAt: at,
    width: 1600,
    height: 1200,
    intelligence: intelligence(id, tags, extra.overall ?? 80),
    analysis: extra.analysis === undefined ? analysis() : extra.analysis,
    visual: descriptorFromRgba(image, 96, 72, boxes),
  };
}

function ids(groups) {
  return groups.map((group) => group.photoIds);
}

test("time proximity falls off and a different Tokyo day is zero", () => {
  const base = "2026-07-02T08:01:00+09:00";
  assert.equal(scoreTimeProximity(base, "2026-07-02T08:01:20+09:00"), 100);
  assert.equal(scoreTimeProximity(base, "2026-07-02T08:02:30+09:00"), 86);
  assert.ok(scoreTimeProximity(base, "2026-07-02T08:08:00+09:00") < 80);
  assert.equal(scoreTimeProximity(base, "2026-07-03T08:01:00+09:00"), 0);
  assert.notEqual(tokyoDay("2026-07-02T23:30:00+09:00"), tokyoDay("2026-07-03T00:20:00+09:00"));
});

test("a short burst stays together and a later different action splits", () => {
  clearGroupingPairCache();
  const groups = buildSceneGroups([
    photo("a", "2026-07-02T08:01:02+09:00", room(0), ["home", "playing", "curious"]),
    photo("b", "2026-07-02T08:01:04+09:00", room(1), ["home", "playing", "curious"]),
    photo("c", "2026-07-02T08:01:06+09:00", room(2), ["home", "playing", "playful"]),
    photo("eat", "2026-07-02T08:06:00+09:00", room(0), ["home", "eating", "everyday"]),
  ]);
  const burst = groups.find((group) => group.photoIds.includes("a"));
  assert.ok(burst);
  assert.deepEqual(burst.photoIds, ["a", "b", "c"]);
  assert.equal(burst.burst, true);
  assert.ok(burst.groupConfidence >= 0.8);
  assert.equal(burst.analysisVersion, PHOTO_GROUPING_VERSION);
  assert.ok(groups.some((group) => group.photoIds.length === 1 && group.photoIds[0] === "eat"));
  assert.ok(burst.members.every((member) => Number.isFinite(member.relativeUniqueness)));
});

test("the same bed on another day does not join, even when the picture matches", () => {
  clearGroupingPairCache();
  const image = room(0);
  const groups = buildSceneGroups([
    photo("today", "2026-07-02T21:00:00+09:00", image, ["home", "sleeping", "calm"]),
    photo("tomorrow", "2026-07-03T21:00:10+09:00", image, ["home", "sleeping", "calm"]),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.photoIds.length === 1));
  const pair = scorePhotoPair(
    photo("today", "2026-07-02T21:00:00+09:00", image, ["home", "sleeping", "calm"]),
    photo("tomorrow", "2026-07-03T21:00:10+09:00", image, ["home", "sleeping", "calm"]),
  );
  assert.ok(pair.blocks.includes("DIFFERENT_DAY"));
});

test("same minute but a different place stays separate", () => {
  clearGroupingPairCache();
  const groups = buildSceneGroups([
    photo("home", "2026-07-02T15:00:00+09:00", room(0), ["home", "playing"]),
    photo("out", "2026-07-02T15:00:40+09:00", park(), ["park", "playing"]),
  ]);
  assert.deepEqual(ids(groups), [["home"], ["out"]]);
});

test("a chain does not swallow a photo that only matches the neighbor", () => {
  clearGroupingPairCache();
  const groups = buildSceneGroups([
    photo("a", "2026-07-02T08:00:00+09:00", room(0), ["home", "playing"]),
    photo("b", "2026-07-02T08:00:08+09:00", room(1), ["home", "playing"]),
    photo("c", "2026-07-02T08:00:16+09:00", face(), ["home", "looking_camera", "portrait"], {
      analysis: analysis(
        [{ bbox: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, face: { x: 0.3, y: 0.2, width: 0.4, height: 0.35 }, confidence: 0.95 }],
        { x: 0.5, y: 0.35 },
      ),
    }),
  ]);
  const withA = groups.find((group) => group.photoIds.includes("a"));
  assert.ok(withA.photoIds.includes("b"));
  assert.equal(withA.photoIds.includes("c"), false);
});

test("singleton is kept and a high keeper score cannot glue different scenes", () => {
  clearGroupingPairCache();
  const alone = buildSceneGroups([
    photo("only", "2026-07-02T11:00:00+09:00", room(0), ["home", "sleeping"], { overall: 99 }),
  ]);
  assert.equal(alone.length, 1);
  assert.equal(alone[0].photoIds.length, 1);
  assert.equal(alone[0].groupConfidence, 1);
  assert.equal(alone[0].members[0].relativeUniqueness, 100);

  const groups = buildSceneGroups([
    photo("low", "2026-07-02T08:01:00+09:00", room(0), ["home", "playing"], { overall: 40 }),
    photo("high", "2026-07-02T08:01:03+09:00", room(1), ["home", "playing"], { overall: 99 }),
    photo("other", "2026-04-23T22:18:00+09:00", room(0), ["home", "playing"], { overall: 99 }),
  ]);
  const burst = groups.find((group) => group.photoIds.includes("low"));
  assert.deepEqual(burst.photoIds, ["low", "high"]);
  assert.equal(groups.some((group) => group.photoIds.includes("other") && group.photoIds.length === 1), true);
  assert.equal(burst.representativePhotoId, "high");
});

test("near duplicates have lower relative uniqueness than a shifted frame", () => {
  clearGroupingPairCache();
  const groups = buildSceneGroups([
    photo("a", "2026-07-02T08:01:00+09:00", room(0), ["home", "playing"]),
    photo("b", "2026-07-02T08:01:02+09:00", room(0), ["home", "playing"]),
    photo("c", "2026-07-02T08:01:04+09:00", room(8), ["home", "playing"]),
  ]);
  assert.equal(groups.length, 1);
  const byId = Object.fromEntries(groups[0].members.map((member) => [member.photoId, member.relativeUniqueness]));
  assert.ok(byId.c > byId.a, `${byId.c} vs ${byId.a}`);
  assert.ok(byId.a < 25, String(byId.a));
});

test("a pet that moves across the same room still joins", () => {
  clearGroupingPairCache();
  const box = { x: 0.08, y: 0.11, width: 0.84, height: 0.78 };
  function frame(petPaint) {
    return rgba(96, 72, (x, y) => {
      if (x < 8 || x > 88 || y < 8 || y > 64) return [176, 132, 90];
      return petPaint(x, y);
    });
  }
  const pose = analysis(
    [{ bbox: box, face: { x: 0.4, y: 0.2, width: 0.16, height: 0.16 }, confidence: 0.9 }],
    { x: 0.5, y: 0.5 },
  );
  const left = frame((x, y) => ((x + y) % 8 < 4 ? [240, 200, 140] : [80, 40, 20]));
  const right = frame((x, y) => ((x * 3) % 10 < 5 ? [20, 20, 20] : [250, 220, 180]));
  const pair = scorePhotoPair(
    photo("left", "2026-07-02T08:01:00+09:00", left, ["home", "playing"], { analysis: pose }),
    photo("right", "2026-07-02T08:01:04+09:00", right, ["home", "playing"], { analysis: pose }),
  );
  assert.ok(pair.visualScore < 78, `visual ${pair.visualScore}`);
  assert.ok(pair.visualScore >= 64, `visual ${pair.visualScore}`);
  assert.ok(pair.backgroundScore >= 78, `background ${pair.backgroundScore}`);
  assert.ok(pair.overall >= 70, `overall ${pair.overall}`);
  assert.equal(pair.blocks.length, 0);

  const elsewhere = rgba(96, 72, (x, y) => (y < 30 ? [120, 176, 214] : [86, 140, 72]));
  const groups = buildSceneGroups([
    photo("left", "2026-07-02T08:01:00+09:00", left, ["home", "playing"], { analysis: pose }),
    photo("right", "2026-07-02T08:01:04+09:00", right, ["home", "playing"], { analysis: pose }),
    photo("yard", "2026-07-02T08:01:08+09:00", elsewhere, ["home", "playing"], {
      analysis: analysis(
        [{ bbox: { x: 0.4, y: 0.4, width: 0.2, height: 0.3 }, face: null, confidence: 0.8 }],
        { x: 0.5, y: 0.55 },
      ),
    }),
  ]);
  const roomGroup = groups.find((group) => group.photoIds.includes("left"));
  assert.deepEqual(roomGroup.photoIds, ["left", "right"]);
  assert.equal(roomGroup.photoIds.includes("yard"), false);
});

test("pair cache key ignores order", async () => {
  const { groupingPairCacheKey } = await import("../lib/photo-grouping/pair.ts");
  assert.equal(
    groupingPairCacheKey("b", "a", PHOTO_GROUPING_VERSION),
    groupingPairCacheKey("a", "b", PHOTO_GROUPING_VERSION),
  );
});
