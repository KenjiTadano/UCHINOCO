import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyticsAcceptData, calculateAlbumEditMetrics, classifyAlbumEditDistance } from "../lib/album-analytics.ts";

function view(changes = {}) {
  const frame = {
    id: "frame-1", frameId: "hero", role: "hero", position: 0,
    aiPhotoId: "photo-ai", userPhotoId: changes.photo ? "photo-user" : null,
    effectivePhotoId: changes.photo ? "photo-user" : "photo-ai",
    aiCrop: { x: 0.5, y: 0.5, scale: 1 },
    userCrop: changes.crop ? { x: 0.4, y: 0.5, scale: 1.1 } : null,
    effectiveCrop: changes.crop ? { x: 0.4, y: 0.5, scale: 1.1 } : { x: 0.5, y: 0.5, scale: 1 },
    revision: 1, clientSeq: 1,
  };
  return {
    albumId: "album", versionId: "version", status: "ready", revision: 1, signature: "sig", previewUrls: {},
    spreads: [{
      id: "spread-1", position: 0, storySpreadId: "story-1", aiLayoutId: "L01",
      userLayoutId: changes.layout ? "L02" : null, effectiveLayoutId: changes.layout ? "L02" : "L01",
      revision: 1, clientSeq: 1, frames: [frame], preview: {}, source: {}, sourceFrames: [],
      texts: changes.text ? [{ overrideMode: "replace" }] : [],
      decorations: changes.decoration ? [{ overrideMode: "replace" }] : [],
      elements: [
        ...(changes.stamp ? [{ type: "stamp" }] : []),
        ...(changes.elementText ? [{ type: "text" }] : []),
      ],
      backgrounds: {
        left: { backgroundId: changes.background ? "warm" : null, revision: 0, clientSeq: 0 },
        right: { backgroundId: null, revision: 0, clientSeq: 0 },
      },
      layoutRanking: { selectedLayout: { layoutId: "L01" }, alternatives: [{ layoutId: "L02" }] },
    }],
  };
}

test("direct accept has zero edit distance and no free text payload", () => {
  const metrics = calculateAlbumEditMetrics(view());
  assert.equal(metrics.editDistance, 0);
  assert.equal(metrics.severity, "NONE");
  assert.equal(metrics.category, "DIRECT_ACCEPT");
  const data = analyticsAcceptData(metrics, 12);
  assert.equal(data.time_to_accept_seconds, 12);
  assert.equal(JSON.stringify(data).includes("caption"), false);
});

test("edit distance uses configured weights for edited accepts", () => {
  const light = calculateAlbumEditMetrics(view({ crop: true }));
  assert.equal(light.editDistance, 1);
  assert.equal(light.category, "LIGHT_EDIT_ACCEPT");

  const medium = calculateAlbumEditMetrics(view({ layout: true, crop: true, text: true }));
  assert.equal(medium.editDistance, 4);
  assert.equal(medium.category, "MEDIUM_EDIT_ACCEPT");

  const heavy = calculateAlbumEditMetrics(view({ photo: true, layout: true, crop: true, text: true, decoration: true, stamp: true, background: true }));
  assert.equal(heavy.editDistance, 8.5);
  assert.equal(heavy.category, "HEAVY_EDIT_ACCEPT");
});

test("layout rank, crop, decoration and photo-selection aggregates are available", () => {
  const metrics = calculateAlbumEditMetrics(view({ layout: true, crop: true, decoration: true, stamp: true, background: true, photo: true }));
  assert.deepEqual(metrics.selectedRankCounts, { "2": 1 });
  assert.equal(metrics.aiCropKeptCount, 0);
  assert.equal(metrics.decorationApplied, true);
  assert.equal(metrics.photoSwapCount, 1);
});

test("severity thresholds cover none, light, medium and heavy", () => {
  assert.equal(classifyAlbumEditDistance(0), "NONE");
  assert.equal(classifyAlbumEditDistance(2), "LIGHT");
  assert.equal(classifyAlbumEditDistance(7), "MEDIUM");
  assert.equal(classifyAlbumEditDistance(7.5), "HEAVY");
});

test("migration enforces owner RLS, append-only writes and duplicate protection", async () => {
  const sql = await readFile("./supabase/migrations/20261002120000_album_analytics_events.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke update, delete/);
  assert.match(sql, /album_analytics_events_dedupe_idx/);
  assert.match(sql, /security invoker/);
});

test("analytics failure is swallowed and product actions remain primary", async () => {
  const source = await readFile("./lib/album-analytics-server.ts", "utf8");
  assert.match(source, /catch \{/);
  assert.match(source, /return false/);
  assert.doesNotMatch(source, /signedUrl|caption|prompt|freeText/);
});

test("generated, accept, print preview, checkout and edit events are wired", async () => {
  const sources = await Promise.all([
    readFile("./app/(app)/pets/[petId]/album/new/actions.ts", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/analytics-actions.ts", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/print/page.tsx", "utf8"),
    readFile("./app/(app)/pets/[petId]/album/[albumId]/print/actions.ts", "utf8"),
    readFile("./app/(app)/album-draft-service.ts", "utf8"),
  ]);
  for (const event of ["album_generated", "album_accepted", "print_preview_opened", "checkout_started", "album_layout_changed", "album_crop_changed", "album_decoration_changed"]) {
    assert.equal(sources.some((source) => source.includes(event)), true, event);
  }
});
