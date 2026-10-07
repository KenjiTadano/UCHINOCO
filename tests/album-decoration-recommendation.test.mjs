import assert from "node:assert/strict";
import { test } from "node:test";
import { DECORATION_STYLE_PRESETS, recommendAlbumDecoration, recommendAlbumTheme, recommendationSeason } from "../lib/album-decoration/recommendation.ts";

const safePages = [
  { side: "left", rect: { x: 0.1, y: 0.1, w: 0.38, h: 0.8 } },
  { side: "right", rect: { x: 0.52, y: 0.1, w: 0.38, h: 0.8 } },
];

function context(overrides = {}) {
  return {
    role: "STORY",
    storyType: "everyday",
    density: "LOW",
    whitespaceIntent: "balanced",
    photoCount: 2,
    albumTheme: "PLAYFUL",
    confidence: 0.9,
    userElementCount: 0,
    hasUserBackground: false,
    safePages,
    occupiedRects: [],
    gutter: { x: 0.47, y: 0, w: 0.06, h: 1 },
    ...overrides,
  };
}

test("CLEAN is always first, low confidence falls back to no decoration", () => {
  assert.deepEqual(
    DECORATION_STYLE_PRESETS.map((item) => item.id),
    ["CLEAN", "WARM", "PLAYFUL", "SEASONAL", "CELEBRATION"],
  );
  const suggestions = recommendAlbumDecoration(context());
  assert.equal(suggestions[0].styleId, "CLEAN");
  assert.equal(suggestions[0].marks.length, 0);
  assert.deepEqual(recommendAlbumDecoration(context()), suggestions);
  assert.deepEqual(
    recommendAlbumDecoration(context({ confidence: 0.2 })).map((item) => item.styleId),
    ["CLEAN"],
  );
});

test("warm story uses a tagged catalog mark with the background so reset can identify both", () => {
  const warm = recommendAlbumDecoration(context({ albumTheme: "WARM" }))[1];
  assert.equal(warm.styleId, "WARM");
  assert.deepEqual(warm.backgrounds, { left: "warm", right: "warm" });
  assert.equal(warm.marks.length, 1);
  assert.equal(warm.marks[0].type, "decoration");
  assert.equal(warm.marks[0].id, "line");
});

test("HERO and QUIET never receive decorative marks", () => {
  const hero = recommendAlbumDecoration(context({ role: "HERO" }));
  const quiet = recommendAlbumDecoration(context({ role: "QUIET", whitespaceIntent: "quiet" }));
  assert.ok(hero.every((item) => item.marks.length === 0));
  assert.deepEqual(
    quiet.map((item) => item.styleId),
    ["CLEAN"],
  );
});

test("verified birthday/adoption metadata enables subtle celebration recommendations", () => {
  const birthday = recommendAlbumDecoration(
    context({
      role: "EVENT",
      storyType: "event",
      event: { kind: "birthday", date: "2026-07-08", dateLabel: "2026年7月8日" },
    }),
  );
  assert.equal(birthday[1].styleId, "CELEBRATION");
  assert.equal(birthday[1].marks[0].id, "birthday");
  assert.equal(birthday[1].textSuggestion, "2026年7月8日");
  assert.ok(birthday[1].textRect);
  const adoption = recommendAlbumDecoration(context({ role: "EVENT", storyType: "event", event: { kind: "adoption", date: "2026-07-08", dateLabel: "2026年7月8日" } }));
  assert.equal(adoption[1].marks[0].id, "first-time");
  assert.deepEqual(
    recommendAlbumDecoration(context({ role: "EVENT", storyType: "event" })).map((item) => item.styleId),
    ["CLEAN"],
  );
  assert.deepEqual(
    recommendAlbumDecoration(context({ role: "EVENT", storyType: "event", event: { kind: "birthday", date: "2026-07-08", dateLabel: "2026年7月8日" }, occupiedRects: safePages.map((page) => page.rect) })).map((item) => item.styleId),
    ["CLEAN"],
  );
});

test("seasonal style requires a known date and uses existing catalog marks", () => {
  assert.equal(recommendationSeason("2026-04-12"), "spring");
  assert.equal(recommendationSeason(null), null);
  assert.equal(recommendationSeason("2026-02-31"), null);
  assert.deepEqual(
    recommendAlbumDecoration(context({ albumTheme: "SEASONAL", season: null })).map((item) => item.styleId),
    ["CLEAN"],
  );
  const winter = recommendAlbumDecoration(context({ albumTheme: "SEASONAL", season: "winter" }));
  assert.equal(winter[1].styleId, "SEASONAL");
  assert.equal(winter[1].marks[0].id, "winter");
});

test("existing user elements or backgrounds suppress non-clean suggestions", () => {
  assert.deepEqual(
    recommendAlbumDecoration(context({ userElementCount: 1 })).map((item) => item.styleId),
    ["CLEAN"],
  );
  assert.deepEqual(
    recommendAlbumDecoration(context({ hasUserBackground: true })).map((item) => item.styleId),
    ["CLEAN"],
  );
});

test("colliding event marks are rejected while CLEAN remains available", () => {
  const result = recommendAlbumDecoration(
    context({
      role: "EVENT",
      storyType: "event",
      event: { kind: "birthday", date: "2026-07-08", dateLabel: "2026年7月8日" },
      occupiedRects: safePages.map((page) => page.rect),
    }),
  );
  assert.deepEqual(
    result.map((item) => item.styleId),
    ["CLEAN"],
  );
});

test("album theme derivation is deterministic and uses known dates only", () => {
  assert.equal(recommendAlbumTheme({ dates: ["2026-01-10", "2026-02-12"], hasEvent: false, storyTypes: [] }), "SEASONAL");
  assert.equal(recommendAlbumTheme({ dates: [null, undefined], hasEvent: false, storyTypes: ["everyday"] }), "WARM");
  assert.equal(recommendAlbumTheme({ dates: [], hasEvent: false, storyTypes: [] }), "CLEAN");
});
