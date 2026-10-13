import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_HIERARCHY_LAYOUTS } from "../lib/album-draft/layouts.ts";
import { ALBUM_DRAFT_CONFIG } from "../lib/album-draft/config.ts";
import { EDITORIAL_TEMPLATES, EDITORIAL_LIBRARY_SIZE, NO_CROP_FINAL_TEMPLATES } from "../lib/smart-layout/editorial-library.ts";
import { ALBUM_LAYOUTS } from "../lib/smart-layout/layouts.ts";
import { deriveTemplateFrameMetadata, getTemplateFrameMetadata } from "../lib/smart-layout/frame-metadata.ts";
import { placeFrames } from "../lib/album-draft/pages.ts";

const registeredLayouts = [
  ...ALBUM_LAYOUTS,
  ...DRAFT_HIERARCHY_LAYOUTS,
  ...EDITORIAL_TEMPLATES,
  ...NO_CROP_FINAL_TEMPLATES,
];

test("frame metadata is deterministically derived for every existing template registry", () => {
  assert.equal(EDITORIAL_LIBRARY_SIZE, 54);
  assert.equal(new Set(EDITORIAL_TEMPLATES.map((layout) => layout.id)).size, EDITORIAL_TEMPLATES.length);
  for (const layout of registeredLayouts) {
    const metadata = getTemplateFrameMetadata(layout.id);
    assert.equal(metadata.length, layout.frames.length, layout.id);
    const placements = placeFrames(layout.frames, new Map());
    for (let index = 0; index < layout.frames.length; index++) {
      const frame = layout.frames[index];
      const result = metadata[index];
      const placement = placements[index];
      assert.equal(result.layoutId, layout.id);
      assert.equal(result.frameId, frame.id);
      assert.ok(result.aspectRatio > 0);
      assert.equal(result.aspectRatio, Number((placement.rect.w / placement.rect.h).toFixed(4)));
      assert.ok(["portrait", "landscape", "square"].includes(result.orientation));
      assert.ok(["hero", "secondary", "supporting"].includes(result.role));
      assert.ok(["left", "center", "right", "full", "unknown"].includes(result.placement));
      assert.ok(["left", "right", "cross-spread", "unknown"].includes(result.pageSide));
      assert.ok(["low", "medium", "high"].includes(result.gutterRisk));
      assert.equal(result.pageSide === "cross-spread", placement.crossesGutter);
      if (result.pageSide === "cross-spread") assert.equal(result.gutterRisk, "high");
      assert.equal(result.allowContain, frame.cropShapeId !== "circle" && !placement.crossesGutter && result.gutterRisk !== "high");
    }
  }
});

test("legacy frame roles map to hero, secondary, and supporting without changing layout definitions", () => {
  const definitions = registeredLayouts.flatMap((layout) => layout.frames.map((frame) => ({ frame, metadata: getTemplateFrameMetadata(layout.id).find((item) => item.frameId === frame.id) })));
  assert.ok(definitions.some(({ frame, metadata }) => frame.slotRole === "hero" && metadata.role === "hero"));
  assert.ok(definitions.some(({ frame, metadata }) => frame.slotRole === "secondary" && metadata.role === "secondary"));
  assert.ok(definitions.some(({ frame, metadata }) => frame.slotRole === "primary" && metadata.role === "supporting"));
  for (const { frame, metadata } of definitions) assert.ok(metadata, frame.id);
});

test("recovery-only, selectable, contain, full-bleed, and gutter properties reflect the owning registry and geometry", () => {
  for (const layout of [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS, ...EDITORIAL_TEMPLATES]) {
    const isSafeFallback = layout.id.startsWith("E_SAFE_FALLBACK_");
    assert.ok(getTemplateFrameMetadata(layout.id).every((metadata) => metadata.recoveryOnly === isSafeFallback && metadata.userSelectable === true));
  }
  for (const layout of NO_CROP_FINAL_TEMPLATES) {
    const [metadata] = getTemplateFrameMetadata(layout.id);
    assert.equal(layout.imageFit, "contain");
    assert.equal(metadata.allowContain, true);
    assert.equal(metadata.recoveryOnly, true);
    assert.equal(metadata.userSelectable, false);
    assert.equal(metadata.fullBleed, false);
    assert.equal(metadata.gutterRisk, "low");
  }
  const fullBleedFrame = {
    id: "full-bleed",
    cropShapeId: "landscape",
    slotRole: "hero",
    importance: 1,
    rect: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
  };
  const fullBleedLayout = {
    id: "synthetic-full-bleed-metadata",
    name: "Full bleed metadata fixture",
    photoCount: 1,
    purpose: "hero",
    frames: [fullBleedFrame],
  };
  assert.equal(deriveTemplateFrameMetadata(fullBleedLayout, fullBleedFrame).fullBleed, true);
  assert.equal(getTemplateFrameMetadata("missing-layout"), null);
  assert.ok(ALBUM_DRAFT_CONFIG.book.gutterInset > 0);
});
