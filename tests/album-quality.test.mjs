import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ALBUM_QUALITY_CONFIG,
  buildAlbumQualitySummary,
  parseQualityRange,
  qualityRangeStart,
} from "../lib/album-quality.ts";

const at = "2026-10-01T00:00:00.000Z";

function event(event_type, index, event_data = {}) {
  return {
    album_id: `album-${index}`,
    draft_version_id: `draft-${index}`,
    event_type,
    event_data,
    created_at: at,
  };
}

function generated(count) {
  return Array.from({ length: count }, (_, index) => event("album_generated", index));
}

function accepted(index, overrides = {}) {
  return event("album_accepted", index, {
    category: "DIRECT_ACCEPT",
    edit_distance: 0,
    time_to_accept_seconds: 30,
    photo_swap_count: 0,
    layout_change_count: 0,
    crop_change_count: 0,
    text_change_count: 0,
    stamp_change_count: 0,
    decoration_change_count: 0,
    background_change_count: 0,
    ai_layout_kept_count: 2,
    ai_layout_total: 2,
    ai_crop_kept_count: 3,
    ai_crop_total: 3,
    selected_rank_counts: { "1": 2 },
    ...overrides,
  });
}

test("empty analytics stays neutral", () => {
  const summary = buildAlbumQualitySummary([], "all");
  assert.equal(summary.empty, true);
  assert.equal(summary.primary.value, null);
  assert.equal(summary.primary.status, "INSUFFICIENT_DATA");
  assert.deepEqual(summary.signals, []);
});

test("minimum sample guard prevents false quality signals", () => {
  const events = [...generated(9), ...Array.from({ length: 9 }, (_, index) => accepted(index, { category: "HEAVY_EDIT_ACCEPT", edit_distance: 9 }))];
  const summary = buildAlbumQualitySummary(events, "all");
  assert.equal(summary.primary.status, "INSUFFICIENT_DATA");
  assert.equal(summary.signals.length, 0);
});

test("direct accept, edit severity and average edit distance are calculated", () => {
  const events = [...generated(10), ...Array.from({ length: 6 }, (_, index) => accepted(index)), ...Array.from({ length: 4 }, (_, index) => accepted(index + 6, { category: "HEAVY_EDIT_ACCEPT", edit_distance: 8 }))];
  const summary = buildAlbumQualitySummary(events, "all");
  assert.equal(summary.primary.value, 0.6);
  assert.equal(summary.acceptRate.value, 1);
  assert.equal(summary.primary.status, "HEALTHY");
  assert.equal(summary.acceptance.DIRECT_ACCEPT, 6);
  assert.equal(summary.acceptance.HEAVY_EDIT_ACCEPT, 4);
  assert.equal(summary.averageEditDistance.value, 3.2);
});

test("edit, layout and crop quality expose the weak area", () => {
  const events = [...generated(10), ...Array.from({ length: 10 }, (_, index) => accepted(index, {
    category: "MEDIUM_EDIT_ACCEPT",
    layout_change_count: index < 6 ? 1 : 0,
    crop_change_count: index < 2 ? 1 : 0,
    photo_swap_count: index < 3 ? 1 : 0,
    ai_layout_kept_count: index < 6 ? 0 : 2,
    ai_layout_total: 2,
    ai_crop_kept_count: index < 2 ? 2 : 3,
    ai_crop_total: 3,
    selected_rank_counts: index < 6 ? { "2": 2 } : { "1": 2 },
  }))];
  const summary = buildAlbumQualitySummary(events, "all");
  assert.equal(summary.edits.layout.value, 0.6);
  assert.equal(summary.edits.photoSwap.value, 0.3);
  assert.equal(summary.layout.keep.value, 0.4);
  assert.equal(summary.crop.keep.value, 28 / 30);
  assert.equal(summary.layout.ranks["2"], 12);
  assert.equal(summary.signals.some((item) => item.code === "HIGH_LAYOUT_CHANGE"), true);
  assert.equal(summary.signals.some((item) => item.code === "HIGH_PHOTO_SWAP"), true);
});

test("decoration acceptance and reset are aggregated by style", () => {
  const events = [...generated(10)];
  for (let index = 0; index < 10; index += 1) events.push(event("decoration_recommendation_shown", index, { style_id: "WARM" }));
  for (let index = 0; index < 2; index += 1) events.push(event("decoration_previewed", index, { style_id: "WARM" }), event("decoration_applied", index, { style_id: "WARM" }));
  const summary = buildAlbumQualitySummary(events, "all");
  assert.equal(summary.decoration.previewRate.value, 0.2);
  assert.equal(summary.decoration.applyRate.value, 0.2);
  assert.deepEqual(summary.decoration.byStyle.WARM, { shown: 10, applied: 2, reset: 0 });
});

test("quality funnel deduplicates multiple views of one draft", () => {
  const events = [...generated(2), event("album_viewed", 0), event("album_viewed", 0), event("album_viewed", 1), accepted(0), event("print_preview_opened", 0), event("checkout_started", 0)];
  const summary = buildAlbumQualitySummary(events, "all");
  assert.deepEqual(summary.funnel.map((step) => step.count), [2, 2, 1, 1, 1]);
  assert.equal(summary.print.preview.value, 0.5);
  assert.equal(summary.print.checkout.value, 0.5);
});

test("date ranges parse safely and calculate bounded starts", () => {
  const now = new Date("2026-10-02T00:00:00.000Z");
  assert.equal(parseQualityRange("7d"), "7d");
  assert.equal(parseQualityRange("bad"), "all");
  assert.equal(qualityRangeStart("all", now), null);
  assert.equal(qualityRangeStart("7d", now), "2026-09-25T00:00:00.000Z");
});

test("aggregate output and dashboard omit private content", async () => {
  const summary = buildAlbumQualitySummary([...generated(ALBUM_QUALITY_CONFIG.minimumSample)], "all");
  const serialized = JSON.stringify(summary).toLowerCase();
  for (const forbidden of ["pet_name", "caption", "signed_url", "user_email", "user_id"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  const source = await readFile("./app/(app)/dev/album-quality/page.tsx", "utf8");
  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /album_id, draft_version_id, event_type, event_data, created_at/);
  assert.doesNotMatch(source, /pet name|caption|signed_url|user_email/i);
});
