import assert from "node:assert/strict";
import { test } from "node:test";
import { ALBUM_LAYOUTS } from "../lib/smart-layout/layouts.ts";
import { GRAMMAR_V1_PHOTO_TEMPLATES } from "../lib/smart-layout/templates-v1.ts";
import { automaticSpreadTemplates, filterTemplateCandidates, LEGACY_TEMPLATE_MAP, rankTemplateCandidates, SPREAD_TEMPLATES, spreadTemplateCrossesGutter, TEMPLATE_GRAMMAR_VERSION, TEXT_ONLY_TEMPLATES, templateMetadata } from "../lib/smart-layout/template-system.ts";
import { findBestLayoutForPhotos } from "../lib/smart-layout/select.ts";

const inBounds = (rect) => rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1;
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function photo(id, orientation, score = 60) {
  const dimensions = orientation === "portrait" ? [900, 1400] : orientation === "square" ? [1000, 1000] : [1600, 900];
  return {
    photoId: id,
    imageUrl: `https://example.com/${id}.jpg`,
    previewUrl: `https://example.com/${id}-thumb.jpg`,
    analysis: { width: dimensions[0], height: dimensions[1], orientation, focalPoint: { x: 0.5, y: 0.5 }, pets: [], analysisConfidence: { petDetection: 0.8 } },
    photoIntelligence: { overallScore: score, composition: score, technicalQuality: score, petVisibility: score, expression: score, memoryValue: score, status: "ok" },
  };
}

test("Grammar v1 exposes the requested 49-template foundation", () => {
  assert.equal(TEMPLATE_GRAMMAR_VERSION, "uchinoco-layout-grammar-v1");
  assert.deepEqual(Object.fromEntries([1, 2, 3, 4, 5].map((count) => [count, ALBUM_LAYOUTS.filter((layout) => layout.photoCount === count).length])), { 1: 6, 2: 6, 3: 8, 4: 8, 5: 8 });
  assert.equal(ALBUM_LAYOUTS.length, 36);
  assert.equal(SPREAD_TEMPLATES.length, 8);
  assert.equal(TEXT_ONLY_TEMPLATES.length, 5);
  assert.equal(ALBUM_LAYOUTS.length + SPREAD_TEMPLATES.length + TEXT_ONLY_TEMPLATES.length, 49);
});

test("photo templates have complete semantic metadata and valid print geometry", () => {
  assert.equal(new Set(ALBUM_LAYOUTS.map((layout) => layout.id)).size, ALBUM_LAYOUTS.length);
  for (const layout of ALBUM_LAYOUTS) {
    const meta = templateMetadata(layout);
    assert.equal(layout.frames.length, layout.photoCount, layout.id);
    assert.equal(new Set(layout.frames.map((frame) => frame.id)).size, layout.frames.length, layout.id);
    assert.ok(meta.grammarId);
    assert.ok(meta.scope === "page" || meta.scope === "spread");
    assert.equal(meta.printSafe, true);
    assert.ok(meta.orientationAffinity.length > 0);
    for (const frame of layout.frames) {
      assert.equal(inBounds(frame.rect), true, `${layout.id}/${frame.id}`);
      assert.ok(frame.preferredOrientation);
      assert.ok(frame.cropTolerance);
    }
    for (const text of layout.textSlots ?? []) {
      assert.equal(inBounds(text.rect), true, `${layout.id}/${text.id}`);
      assert.equal(
        layout.frames.some((frame) => overlaps(frame.rect, text.rect)),
        false,
        `${layout.id}/${text.id}`,
      );
    }
    for (const zone of meta.decorationSafeZones) {
      assert.equal(inBounds(zone.rect), true, `${layout.id}/${zone.id}`);
      assert.equal(
        layout.frames.some((frame) => overlaps(frame.rect, zone.rect)),
        false,
        `${layout.id}/${zone.id}`,
      );
    }
  }
});

test("legacy layout IDs remain mapped and selectable", () => {
  const legacyIds = ALBUM_LAYOUTS.filter((layout) => layout.id.startsWith("L"))
    .map((layout) => layout.id)
    .sort();
  assert.deepEqual(Object.keys(LEGACY_TEMPLATE_MAP).sort(), legacyIds);
  assert.equal(
    GRAMMAR_V1_PHOTO_TEMPLATES.every((layout) => !layout.id.startsWith("L")),
    true,
  );
});

test("three- and four-photo baseline compositions remain in the grammar", () => {
  const threeHero = ALBUM_LAYOUTS.find((layout) => layout.id === "P3_HERO_BOTTOM");
  const threeRows = ALBUM_LAYOUTS.find((layout) => layout.id === "P3_LANDSCAPE_STACK");
  const fourGrid = ALBUM_LAYOUTS.find((layout) => layout.id === "P4_CAPTION");
  const fourHero = ALBUM_LAYOUTS.find((layout) => layout.id === "P4_HERO_LEFT");
  const fourEditorial = ALBUM_LAYOUTS.find((layout) => layout.id === "P4_EDITORIAL");
  assert.equal(threeHero?.photoCount, 3);
  assert.equal(threeHero?.purpose, "story");
  assert.equal(threeRows?.frames.length, 3);
  assert.equal(
    threeRows?.frames.every((frame) => frame.cropShapeId === "landscape"),
    true,
  );
  assert.equal(fourGrid?.photoCount, 4);
  assert.equal(templateMetadata(fourGrid).composition, "grid");
  assert.equal(fourHero?.frames.filter((frame) => frame.slotRole === "hero").length, 1);
  assert.equal(fourHero?.frames.length, 4);
  assert.equal(templateMetadata(fourEditorial).composition, "editorial");
  assert.equal(fourEditorial?.frames.length, 4);
});

test("candidate prefilter responds to orientation, hero confidence, and captions", () => {
  const layouts = ALBUM_LAYOUTS.filter((layout) => layout.photoCount === 1);
  const portraitHero = filterTemplateCandidates(layouts, [photo("hero", "portrait", 96)], { maxCandidates: 4 });
  assert.equal(
    portraitHero.some((layout) => layout.orientationAffinity?.includes("portrait")),
    true,
  );
  const withCaption = filterTemplateCandidates(layouts, [photo("caption", "landscape", 60)], { captionAvailable: true, maxCandidates: 4 });
  assert.equal(
    withCaption.some((layout) => layout.captionSupport === "prominent"),
    true,
  );
});

test("Task055: candidate filtering is deterministic, count-safe, and explainable", () => {
  const photos = [photo("a", "portrait", 92), photo("b", "landscape", 64), photo("c", "square", 62)];
  const first = rankTemplateCandidates(ALBUM_LAYOUTS, photos, { storyType: "sequence", captionAvailable: true });
  const second = rankTemplateCandidates(ALBUM_LAYOUTS, photos, { storyType: "sequence", captionAvailable: true });
  assert.deepEqual(
    first.map((item) => item.layout.id),
    second.map((item) => item.layout.id),
  );
  assert.equal(
    first.every((item) => item.layout.photoCount === 3),
    true,
  );
  assert.equal(
    first.some((item) => item.reasons.includes("STORY_MATCH")),
    true,
  );
});

test("Task055: final ranking exposes v2 factors while preserving safety tiers", () => {
  const photos = [photo("a", "portrait", 95), photo("b", "landscape", 65), photo("c", "square", 60)];
  const result = findBestLayoutForPhotos(photos, ALBUM_LAYOUTS, { storyType: "sequence", captionAvailable: true });
  assert.ok(result.best?.v2);
  assert.equal(typeof result.best.v2.finalScore, "number");
  const firstFallback = result.ranking.findIndex((item) => item.tier === "fallback");
  const lastStrict = result.ranking.findLastIndex((item) => item.tier === "strict");
  if (firstFallback >= 0 && lastStrict >= 0) assert.ok(lastStrict < firstFallback);
});

test("Task055: automatic spread subset excludes every gutter-crossing template", () => {
  const safe = automaticSpreadTemplates();
  assert.ok(safe.length >= 1);
  assert.equal(
    safe.every((template) => !spreadTemplateCrossesGutter(template)),
    true,
  );
  assert.equal(
    safe.some((template) => template.id === "S_HERO_FULL"),
    false,
  );
});
