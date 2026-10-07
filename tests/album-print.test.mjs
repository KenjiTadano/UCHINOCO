import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { encode } from "jpeg-js";
import { PDFDocument } from "pdf-lib";
import { polishForLayout } from "../lib/album-polish/catalog.ts";
import { coverCropRect, visibleSourcePixels } from "../lib/album-print/crop.ts";
import { ALBUM_PRINT_SCHEMA_VERSION } from "../lib/album-print/config.ts";
import { ALBUM_PRINT_SPEC } from "../lib/album-print/print-spec.ts";
import { buildPrintGeometry } from "../lib/album-print/geometry.ts";
import { acceptOriginalPath } from "../lib/album-print/images.ts";
import { assessPrintQuality, textOverflows } from "../lib/album-print/quality.ts";
import { renderContentHash, renderDraftPrintPdf } from "../lib/album-print/render-pdf.ts";
import { persistPrintPdf, PRINT_PDF_MAX_BYTES } from "../lib/album-print/persist.ts";
import { buildAlbumPrintSnapshot, draftPrintIsStale } from "../lib/album-print/snapshot.ts";
import { selectPrintSource } from "../lib/album-print/source.ts";
import { estimateDpi } from "../lib/print/layout/units.ts";

const fontsReady = { editorial: true, warm: true, handwritten: true, minimal: true };

function jpeg(width, height) {
  const data = Buffer.alloc(width * height * 4, 255);
  return new Uint8Array(encode({ data, width, height }, 80).data);
}

function spread(overrides = {}) {
  return {
    id: "spread-1",
    draftVersionId: "version-1",
    storySpreadId: "story-1",
    position: 0,
    storyType: "daily",
    recommendedDensity: "balanced",
    importance: 1,
    coherence: 1,
    aiLayoutId: "L01",
    userLayoutId: "L02",
    warnings: [],
    revision: 3,
    clientSeq: 1,
    ...overrides,
  };
}

function frame(index, overrides = {}) {
  return {
    id: `frame-${index}`,
    draftSpreadId: "spread-1",
    frameId: index === 0 ? "L02-a" : "L02-b",
    role: "primary",
    position: index,
    aiPhotoId: `ai-photo-${index}`,
    aiCropX: 0.2,
    aiCropY: 0.2,
    aiCropScale: 1,
    userPhotoId: `user-photo-${index}`,
    userCropX: 0.66,
    userCropY: 0.33,
    userCropScale: 1.4,
    matchTier: "STRICT",
    cropQuality: 0.9,
    warnings: [],
    revision: 4 + index,
    clientSeq: 1,
    ...overrides,
  };
}

function textRow(slot, overrides = {}) {
  return {
    id: `text-${slot.id}`,
    draftSpreadId: "spread-1",
    slotId: slot.id,
    kind: slot.kind,
    aiText: "AIの文章",
    userText: slot.kind === "title" ? "こちらを見ている" : "はじめてのおもちゃ",
    aiStyleId: "editorial",
    userStyleId: null,
    overrideMode: "replace",
    position: 0,
    revision: 5,
    clientSeq: 1,
    createdAt: "2023-07-02T00:00:00Z",
    updatedAt: "2023-07-02T00:00:00Z",
    ...overrides,
  };
}

function decorationRow(slot, overrides = {}) {
  return {
    id: `deco-${slot.id}`,
    draftSpreadId: "spread-1",
    slotId: slot.id,
    aiDecorationId: "heart",
    userDecorationId: "star",
    aiScalePreset: "small",
    userScalePreset: null,
    overrideMode: "replace",
    position: 0,
    revision: 6,
    clientSeq: 1,
    createdAt: "2023-07-02T00:00:00Z",
    updatedAt: "2023-07-02T00:00:00Z",
    ...overrides,
  };
}

function cover(overrides = {}) {
  return {
    id: "cover-1",
    draftVersionId: "version-1",
    coverType: "front",
    aiPhotoId: "ai-cover",
    userPhotoId: "user-cover",
    aiTitle: "AIタイトル",
    userTitle: "わかの夏",
    aiSubtitle: "AIサブ",
    userSubtitle: "2023",
    aiTemplateId: "simple",
    userTemplateId: "natural",
    aiColorId: "white",
    userColorId: "beige",
    revision: 7,
    clientSeq: 1,
    ...overrides,
  };
}

function input(overrides = {}) {
  const polish = polishForLayout("L02");
  const text = polish.text[0] ? textRow(polish.text[0]) : null;
  const hidden = polish.text[1] ? textRow(polish.text[1], { id: "text-hidden", overrideMode: "hidden", userText: "隠す" }) : null;
  const decoration = polish.decoration[0] ? decorationRow(polish.decoration[0]) : null;
  const hiddenDecoration = polish.decoration[1] ? decorationRow(polish.decoration[1], { id: "deco-hidden", overrideMode: "hidden", userDecorationId: "paw" }) : null;
  return {
    albumId: "album-1",
    albumStatus: "editing",
    draftVersionId: "version-1",
    draftRevision: 8,
    generatedAt: "2026-09-28T00:00:00.000Z",
    dateLabel: "7月",
    cover: cover(),
    spreads: [
      {
        source: spread(),
        frames: [frame(0), frame(1)],
        texts: [text, hidden].filter(Boolean),
        decorations: [decoration, hiddenDecoration].filter(Boolean),
      },
    ],
    originals: {
      "user-photo-0": { storagePath: "pets/original-0.jpg" },
      "user-photo-1": { storagePath: "pets/original-1.jpg" },
      "ai-photo-0": { storagePath: "pets/ai-0.jpg" },
      "user-cover": { storagePath: "pets/cover.jpg" },
    },
    ...overrides,
  };
}

function factsFor(snapshot, size = { width: 3000, height: 4000 }) {
  const facts = {};
  const ids = new Set(snapshot.spreads.flatMap((spread) => spread.frames.map((frame) => frame.photoId)));
  if (snapshot.cover.photoId) ids.add(snapshot.cover.photoId);
  for (const id of ids) facts[id] = { ...size, broken: false };
  return facts;
}

test("effective layout, photo, and crop are the print source", () => {
  const snapshot = buildAlbumPrintSnapshot(input());
  assert.equal(snapshot.schemaVersion, ALBUM_PRINT_SCHEMA_VERSION);
  assert.equal(snapshot.spreads[0].layoutId, "L02");
  assert.equal(snapshot.spreads[0].frames[0].photoId, "user-photo-0");
  assert.equal(snapshot.spreads[0].frames[0].crop.x, 0.66);
  assert.equal(snapshot.spreads[0].frames[0].crop.y, 0.33);
  assert.equal(snapshot.spreads[0].frames[0].crop.scale, 1.4);
  assert.equal(snapshot.spreads[0].frames[0].storagePath, "pets/original-0.jpg");
  assert.equal(snapshot.spreads[0].frames[0].imageKind, "original");
  assert.equal(acceptOriginalPath("pets/thumbnail/a.jpg"), null);
});

test("cover print uses the effective cover", () => {
  const snapshot = buildAlbumPrintSnapshot(input());
  assert.equal(snapshot.cover.photoId, "user-cover");
  assert.equal(snapshot.cover.title, "わかの夏");
  assert.equal(snapshot.cover.subtitle, "2023");
  assert.equal(snapshot.cover.templateId, "natural");
  assert.equal(snapshot.cover.colorId, "beige");
  assert.equal(snapshot.cover.storagePath, "pets/cover.jpg");
});

test("hidden text and decoration are omitted", () => {
  const snapshot = buildAlbumPrintSnapshot(input());
  assert.ok(snapshot.spreads[0].texts.some((text) => text.text === "こちらを見ている" || text.text === "はじめてのおもちゃ"));
  assert.equal(
    snapshot.spreads[0].texts.some((text) => text.text === "隠す" || text.text === "AIの文章"),
    false,
  );
  assert.ok(snapshot.spreads[0].decorations.some((item) => item.decorationId === "star"));
  assert.equal(
    snapshot.spreads[0].decorations.some((item) => item.decorationId === "paw" || item.decorationId === "heart"),
    false,
  );
});

test("crop matches object-fit cover at the saved focal point", () => {
  const drawn = coverCropRect(100, 100, 400, 200, { x: 0.5, y: 0.5, scale: 1 });
  assert.equal(drawn.x, -50);
  assert.equal(drawn.y, 0);
  assert.equal(drawn.w, 200);
  assert.equal(drawn.h, 100);
  const visible = visibleSourcePixels(100, 100, 400, 200, { x: 0.5, y: 0.5, scale: 1 });
  assert.equal(visible.width, 200);
  assert.equal(estimateDpi(visible.width, 50), 102);
});

test("low resolution and missing or broken images are gated", () => {
  const snapshot = buildAlbumPrintSnapshot(input());
  const low = assessPrintQuality(snapshot, factsFor(snapshot, { width: 20, height: 20 }), { fontsReady });
  assert.ok(low.some((issue) => issue.code === "LOW_DPI" && issue.level === "low_resolution" && issue.severity === "warning"));
  const missing = assessPrintQuality(buildAlbumPrintSnapshot(input({ originals: { "user-photo-1": { storagePath: "pets/original-1.jpg" } } })), {}, { fontsReady });
  assert.ok(missing.some((issue) => issue.code === "MISSING_IMAGE" && issue.severity === "blocking"));
  const brokenFacts = factsFor(snapshot);
  brokenFacts[snapshot.spreads[0].frames[0].photoId] = { width: 0, height: 0, broken: true };
  const broken = assessPrintQuality(snapshot, brokenFacts, { fontsReady });
  assert.ok(broken.some((issue) => issue.code === "BROKEN_IMAGE" && issue.severity === "blocking"));
});

test("text overflow, gutter, and missing font block printing", () => {
  const snapshot = buildAlbumPrintSnapshot(input());
  snapshot.spreads[0].texts[0].text = "あ".repeat(80);
  const overflow = assessPrintQuality(snapshot, factsFor(snapshot), { fontsReady });
  assert.ok(overflow.some((issue) => issue.code === "TEXT_OVERFLOW" && issue.severity === "blocking"));
  assert.equal(textOverflows("あ".repeat(80), 40, 20, 13), true);
  snapshot.spreads[0].texts[0].text = "短い";
  snapshot.spreads[0].texts[0].rect = { ...snapshot.spreads[0].texts[0].rect, x: 0.48, w: 0.06 };
  const gutter = assessPrintQuality(snapshot, factsFor(snapshot), { fontsReady });
  assert.ok(gutter.some((issue) => issue.code === "GUTTER_VIOLATION" && issue.severity === "blocking"));
  const unfonted = assessPrintQuality(buildAlbumPrintSnapshot(input()), factsFor(buildAlbumPrintSnapshot(input())), {
    fontsReady: { ...fontsReady, editorial: false, handwritten: false },
  });
  assert.ok(unfonted.some((issue) => issue.code === "FONT_MISSING" && issue.severity === "blocking"));
});

test("caption/photo, decoration/photo, safe-area, and minimum-font violations block printing", () => {
  const collision = buildAlbumPrintSnapshot(input());
  collision.spreads[0].frames[0].rect = { ...collision.spreads[0].texts[0].rect };
  const captionIssues = assessPrintQuality(collision, factsFor(collision), { fontsReady });
  assert.ok(captionIssues.some((issue) => issue.code === "TEXT_PHOTO_COLLISION" && issue.severity === "blocking"));

  const decorationCollision = buildAlbumPrintSnapshot(input());
  decorationCollision.spreads[0].decorations[0].rect = { ...decorationCollision.spreads[0].frames[0].rect };
  const decorationIssues = assessPrintQuality(decorationCollision, factsFor(decorationCollision), { fontsReady });
  assert.ok(decorationIssues.some((issue) => issue.code === "DECORATION_COLLISION" && issue.severity === "blocking"));

  const elementSnapshot = buildAlbumPrintSnapshot(
    input({
      spreads: [
        {
          source: spread(),
          frames: [frame(0), frame(1)],
          texts: [],
          decorations: [],
          elements: [{ id: "unsafe-text", type: "text", x: 0.005, y: 0.3, width: 0.2, height: 0.05, rotation: 0, zIndex: 1, printTarget: "print", revision: 1, clientSeq: 1, text: "小さい", fontId: "minimal", fontSize: 2, bold: false, colorId: "ink", align: "left" }],
        },
      ],
    }),
  );
  const elementIssues = assessPrintQuality(elementSnapshot, factsFor(elementSnapshot), { fontsReady });
  assert.ok(elementIssues.some((issue) => issue.code === "SAFE_AREA_VIOLATION" && issue.severity === "blocking"));
  assert.ok(elementIssues.some((issue) => issue.code === "MIN_FONT_SIZE" && issue.severity === "blocking"));
});

test("one-photo spreads keep the blank opposite page", () => {
  const snapshot = buildAlbumPrintSnapshot(
    input({
      spreads: [
        {
          source: spread({ aiLayoutId: "L01", userLayoutId: null }),
          frames: [frame(0, { frameId: "L01-hero" })],
          texts: [],
          decorations: [],
        },
      ],
    }),
  );
  const issues = assessPrintQuality(snapshot, factsFor(snapshot), { fontsReady });
  assert.ok(issues.some((issue) => issue.code === "EMPTY_OPPOSITE_PAGE" && issue.severity === "warning"));
  assert.equal(snapshot.spreads[0].frames.length, 1);
});

test("fingerprint changes when the draft changes and stays for the same snapshot", () => {
  const first = buildAlbumPrintSnapshot(input());
  const second = buildAlbumPrintSnapshot(input());
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(draftPrintIsStale(first, second), false);
  const edited = buildAlbumPrintSnapshot(
    input({
      cover: cover({ userTitle: "編集後" }),
    }),
  );
  assert.notEqual(first.fingerprint, edited.fingerprint);
  assert.equal(draftPrintIsStale(first, edited), true);
  assert.ok(first.fingerprint.length === 64);
});

test("the same snapshot renders the same content twice", async () => {
  const snapshot = buildAlbumPrintSnapshot(
    input({
      spreads: [
        {
          source: spread({ aiLayoutId: "L01", userLayoutId: null }),
          frames: [frame(0, { frameId: "L01-hero", userPhotoId: "user-photo-0" })],
          texts: [],
          decorations: [],
        },
      ],
      cover: cover({ userTitle: "表紙", userSubtitle: "" }),
    }),
  );
  const images = {
    "user-photo-0": jpeg(80, 60),
    "user-cover": jpeg(80, 60),
  };
  const first = await renderDraftPrintPdf(snapshot, images);
  const second = await renderDraftPrintPdf(snapshot, images);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.contentHash, renderContentHash(snapshot, images));
  assert.equal(createHash("sha256").update(first.bytes).digest("hex"), createHash("sha256").update(second.bytes).digest("hex"));
  assert.equal(Buffer.from(first.bytes.subarray(0, 4)).toString(), "%PDF");
  assert.equal(first.pageCount, 3);
  const pdf = await PDFDocument.load(first.bytes);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - (ALBUM_PRINT_SPEC.pdfWidthMm * 72) / 25.4) < 0.02);
    assert.ok(Math.abs(page.getHeight() - (ALBUM_PRINT_SPEC.pdfHeightMm * 72) / 25.4) < 0.02);
  }
});

test("title and truthful event pages render in composition order without changing PrintSpec", async () => {
  const compositionPlan = {
    version: "album-rhythm-v2",
    coverRole: "COVER",
    items: [
      { kind: "title", role: "TITLE", title: "わかとの毎日", petName: "わか", period: "2026.07" },
      { kind: "event", role: "EVENT", eventKind: "birthday", title: "誕生日", date: "2026-07-02", dateLabel: "2026年7月2日", afterStorySpreadId: "story-1" },
      { kind: "spread", role: "HERO", storySpreadId: "story-1", density: "LOW" },
    ],
  };
  const snapshot = buildAlbumPrintSnapshot(
    input({
      compositionPlan,
      spreads: [
        {
          source: spread({ aiLayoutId: "L01", userLayoutId: null }),
          frames: [frame(0, { frameId: "L01-hero" })],
          texts: [],
          decorations: [],
        },
      ],
    }),
  );
  assert.deepEqual(snapshot.compositionPlan, compositionPlan);
  assert.notEqual(snapshot.fingerprint, buildAlbumPrintSnapshot(input()).fingerprint);
  snapshot.compositionPlan.items[0].title = "長いタイトル".repeat(12);
  const unsafeText = assessPrintQuality(snapshot, factsFor(snapshot), { fontsReady });
  assert.ok(unsafeText.some((issue) => issue.code === "TEXT_OVERFLOW" && issue.severity === "blocking"));
  const missingEditorial = assessPrintQuality(snapshot, factsFor(snapshot), { fontsReady: { ...fontsReady, editorial: false } });
  assert.ok(missingEditorial.some((issue) => issue.code === "FONT_MISSING" && issue.severity === "blocking"));
  const rendered = await renderDraftPrintPdf(snapshot, { "user-photo-0": jpeg(160, 200), "user-photo-1": jpeg(160, 200), "user-cover": jpeg(160, 200) });
  assert.equal(rendered.pageCount, 5);
  const pdf = await PDFDocument.load(rendered.bytes);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - (ALBUM_PRINT_SPEC.pdfWidthMm * 72) / 25.4) < 0.02);
    assert.ok(Math.abs(page.getHeight() - (ALBUM_PRINT_SPEC.pdfHeightMm * 72) / 25.4) < 0.02);
  }
});

test("print snapshot includes print-target elements and page backgrounds, then renders them", async () => {
  const snapshotInput = input({
    spreads: [
      {
        source: spread({ aiLayoutId: "L01", userLayoutId: null }),
        frames: [frame(0, { frameId: "L01-hero", userPhotoId: "user-photo-0" })],
        texts: [],
        decorations: [],
        elements: [
          { id: "element-text", type: "text", x: 0.2, y: 0.3, width: 0.4, height: 0.08, rotation: 15, zIndex: 2, printTarget: "print", revision: 1, clientSeq: 1, text: "はじめて海に行った日\n二人でお散歩", fontId: "handwritten", fontSize: 20, bold: true, colorId: "terracotta", align: "center" },
          { id: "element-stamp", type: "stamp", x: 0.7, y: 0.3, width: 0.1, height: 0.1, rotation: 0, zIndex: 3, printTarget: "print", revision: 1, clientSeq: 1, stampId: "paw", colorId: "sage" },
          { id: "element-digital", type: "text", x: 0.2, y: 0.5, width: 0.4, height: 0.08, rotation: 0, zIndex: 4, printTarget: "digital-only", revision: 1, clientSeq: 1, text: "画面のみ", fontId: "minimal", fontSize: 16, bold: false, colorId: "ink", align: "left" },
        ],
        backgrounds: {
          left: { backgroundId: "warm", revision: 2, clientSeq: 1 },
          right: { backgroundId: null, revision: 0, clientSeq: 0 },
        },
      },
    ],
  });
  const snapshot = buildAlbumPrintSnapshot(snapshotInput);
  assert.deepEqual(
    snapshot.spreads[0].elements.map((element) => element.id),
    ["element-text", "element-stamp"],
  );
  assert.deepEqual(
    snapshot.spreads[0].backgrounds.map((item) => item.pageSide),
    ["left"],
  );
  assert.notEqual(snapshot.spreads[0].elements[0].rect.x, snapshot.spreads[0].elements[1].rect.x);
  const rendered = await renderDraftPrintPdf(snapshot, { "user-photo-0": jpeg(80, 60), "user-cover": jpeg(80, 60) });
  assert.equal(rendered.pageCount, 3);
  assert.equal(Buffer.from(rendered.bytes.subarray(0, 4)).toString(), "%PDF");
});

test("first, middle, and last spread elements reach snapshot and PDF consistently", async () => {
  const pageElements = [
    { id: "element-first", type: "text", x: 0.12, y: 0.15, width: 0.3, height: 0.08, rotation: 0, zIndex: 1, printTarget: "print", revision: 1, clientSeq: 1, text: "最初の見開き", fontId: "minimal", fontSize: 16, bold: false, colorId: "ink", align: "left" },
    { id: "element-middle", type: "stamp", x: 0.62, y: 0.2, width: 0.1, height: 0.1, rotation: 15, zIndex: 2, printTarget: "print", revision: 2, clientSeq: 2, stampId: "paw", colorId: "sage" },
    { id: "element-last", type: "decoration", x: 0.18, y: 0.74, width: 0.3, height: 0.08, rotation: 0, zIndex: 3, printTarget: "print", revision: 3, clientSeq: 3, decorationId: "line", colorId: "terracotta" },
  ];
  const digitalOnly = { ...pageElements[0], id: "element-digital-only", printTarget: "digital-only", text: "画面のみ" };
  const spreads = pageElements.map((element, index) => ({
    source: spread({ id: `spread-${index}`, storySpreadId: `story-${index}`, position: index, aiLayoutId: "L01", userLayoutId: null }),
    frames: [frame(index, { id: `frame-${index}`, draftSpreadId: `spread-${index}`, frameId: "L01-hero", userPhotoId: `user-photo-${index}` })],
    texts: [],
    decorations: [],
    elements: index === 1 ? [element, digitalOnly] : [element],
    backgrounds: {
      left: { backgroundId: index === 1 ? "sage" : null, revision: 1, clientSeq: 1 },
      right: { backgroundId: index === 2 ? "rose" : null, revision: 1, clientSeq: 1 },
    },
  }));
  const snapshot = buildAlbumPrintSnapshot(input({ spreads }));
  assert.deepEqual(
    snapshot.spreads.map((item) => item.elements.map((element) => element.id)),
    [["element-first"], ["element-middle"], ["element-last"]],
  );
  assert.equal(
    snapshot.spreads[1].elements.some((element) => element.id === "element-digital-only"),
    false,
  );
  assert.deepEqual(
    snapshot.spreads[1].backgrounds.map((item) => item.pageSide),
    ["left"],
  );
  assert.deepEqual(
    snapshot.spreads[2].backgrounds.map((item) => item.pageSide),
    ["right"],
  );
  const images = {
    "user-photo-0": jpeg(80, 60),
    "user-photo-1": jpeg(80, 60),
    "user-photo-2": jpeg(80, 60),
    "user-cover": jpeg(80, 60),
  };
  const rendered = await renderDraftPrintPdf(snapshot, images);
  assert.equal(rendered.pageCount, 7);
  assert.equal(Buffer.from(rendered.bytes.subarray(0, 4)).toString(), "%PDF");
});

test("print persistence uploads, saves, and attaches only in the safe order", async () => {
  const calls = [];
  const result = await persistPrintPdf(
    { byteSize: 1024, pdfPath: "drafts/album/hash.pdf", contentHash: "content-hash" },
    {
      upload: async () => {
        calls.push("upload");
        return { data: { path: "drafts/album/hash.pdf" }, error: null };
      },
      saveSnapshot: async () => {
        calls.push("save");
        return { data: { id: "snapshot-1" }, error: null };
      },
      attachPdf: async () => {
        calls.push("attach");
        return { data: { pdf_path: "drafts/album/hash.pdf", content_hash: "content-hash" }, error: null };
      },
      removeObject: async () => {
        calls.push("remove-object");
      },
      removeSnapshot: async () => {
        calls.push("remove-snapshot");
      },
    },
  );
  assert.deepEqual(result, { ok: true, snapshotId: "snapshot-1" });
  assert.deepEqual(calls, ["upload", "save", "attach"]);
});

test("print persistence upload failure does not create or finalize a snapshot", async () => {
  const calls = [];
  const result = await persistPrintPdf(
    { byteSize: 1024, pdfPath: "drafts/album/hash.pdf", contentHash: "content-hash" },
    {
      upload: async () => {
        calls.push("upload");
        return { data: null, error: { code: "STORAGE_DOWN", status: 503 } };
      },
      saveSnapshot: async () => {
        calls.push("save");
        return { data: { id: "unexpected" }, error: null };
      },
      attachPdf: async () => {
        calls.push("attach");
        return { data: null, error: null };
      },
      removeObject: async () => {
        calls.push("remove-object");
      },
      removeSnapshot: async () => {
        calls.push("remove-snapshot");
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "storage_upload");
  assert.deepEqual(calls, ["upload"]);
});

test("print persistence cleans the object when snapshot save fails", async () => {
  const calls = [];
  const result = await persistPrintPdf(
    { byteSize: 1024, pdfPath: "drafts/album/hash.pdf", contentHash: "content-hash" },
    {
      upload: async () => {
        calls.push("upload");
        return { data: { path: "drafts/album/hash.pdf" }, error: null };
      },
      saveSnapshot: async () => {
        calls.push("save");
        return { data: null, error: { code: "DB_DOWN" } };
      },
      attachPdf: async () => {
        calls.push("attach");
        return { data: null, error: null };
      },
      removeObject: async () => {
        calls.push("remove-object");
      },
      removeSnapshot: async () => {
        calls.push("remove-snapshot");
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "snapshot_save");
  assert.deepEqual(calls, ["upload", "save", "remove-object"]);
});

test("print persistence cleans object and incomplete row when attach fails", async () => {
  const calls = [];
  const result = await persistPrintPdf(
    { byteSize: 1024, pdfPath: "drafts/album/hash.pdf", contentHash: "content-hash" },
    {
      upload: async () => {
        calls.push("upload");
        return { data: { path: "drafts/album/hash.pdf" }, error: null };
      },
      saveSnapshot: async () => {
        calls.push("save");
        return { data: { id: "snapshot-1" }, error: null };
      },
      attachPdf: async () => {
        calls.push("attach");
        return { data: null, error: { code: "ATTACH_FAILED" } };
      },
      removeObject: async () => {
        calls.push("remove-object");
      },
      removeSnapshot: async (id) => {
        calls.push(`remove-snapshot:${id}`);
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "snapshot_attach");
  assert.deepEqual(calls, ["upload", "save", "attach", "remove-object", "remove-snapshot:snapshot-1"]);
});

test("print persistence rejects oversized bytes before Storage", async () => {
  let uploaded = false;
  const result = await persistPrintPdf(
    { byteSize: PRINT_PDF_MAX_BYTES + 1, pdfPath: "drafts/album/hash.pdf", contentHash: "content-hash" },
    {
      upload: async () => {
        uploaded = true;
        return { data: null, error: null };
      },
      saveSnapshot: async () => ({ data: null, error: null }),
      attachPdf: async () => ({ data: null, error: null }),
      removeObject: async () => {},
      removeSnapshot: async () => {},
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.stage, "size_check");
  assert.equal(uploaded, false);
});

test("ordered and paid albums stay on the order snapshot", async () => {
  assert.equal(selectPrintSource({ albumStatus: "ordered" }), "order-snapshot");
  assert.equal(selectPrintSource({ albumStatus: "editing", hasPaidOrder: true }), "order-snapshot");
  assert.equal(selectPrintSource({ albumStatus: "editing" }), "draft");
  assert.throws(() => buildAlbumPrintSnapshot(input({ albumStatus: "ordered" })), /order-snapshot/);
  const prepare = await readFile(new URL("../lib/print/pipeline/prepare-print-job.ts", import.meta.url), "utf8");
  const paidPdf = await readFile(new URL("../lib/print/pdf/pdf-generator.ts", import.meta.url), "utf8");
  const orders = await readFile(new URL("../supabase/migrations/20260918140000_order_snapshot_print_jobs.sql", import.meta.url), "utf8");
  assert.match(prepare, /from\("order_photos"\)/);
  assert.match(prepare, /never album_photos/);
  assert.doesNotMatch(prepare, /album_draft/);
  assert.match(paidPdf, /title text omitted/);
  assert.match(orders, /order_id\s+uuid not null/);
  const geometry = buildPrintGeometry();
  assert.equal(geometry.canvas.width, 1076);
  assert.equal(geometry.canvas.height, 1264);
  assert.ok(geometry.bleed.mm > 0);
  assert.ok(geometry.gutter.width.mm > 0);
});

test("print preview does not call vision or caption generation", async () => {
  const files = ["../lib/album-print/snapshot.ts", "../lib/album-print/render-pdf.ts", "../lib/album-print/quality.ts", "../app/(app)/pets/[petId]/album/[albumId]/print/actions.ts", "../app/(app)/pets/[petId]/album/[albumId]/print/page.tsx"];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /openai|responses\.create|image_url|suggestSpreadCaption|album-caption|photo-analysis/i);
  }
});
