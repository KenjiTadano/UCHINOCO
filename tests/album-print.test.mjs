import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { encode } from "jpeg-js";
import { polishForLayout } from "../lib/album-polish/catalog.ts";
import { coverCropRect, visibleSourcePixels } from "../lib/album-print/crop.ts";
import { ALBUM_PRINT_SCHEMA_VERSION } from "../lib/album-print/config.ts";
import { buildPrintGeometry } from "../lib/album-print/geometry.ts";
import { acceptOriginalPath } from "../lib/album-print/images.ts";
import { assessPrintQuality, textOverflows } from "../lib/album-print/quality.ts";
import { renderContentHash, renderDraftPrintPdf } from "../lib/album-print/render-pdf.ts";
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
  const hiddenDecoration = polish.decoration[1]
    ? decorationRow(polish.decoration[1], { id: "deco-hidden", overrideMode: "hidden", userDecorationId: "paw" })
    : null;
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
  assert.equal(snapshot.spreads[0].texts.some((text) => text.text === "隠す" || text.text === "AIの文章"), false);
  assert.ok(snapshot.spreads[0].decorations.some((item) => item.decorationId === "star"));
  assert.equal(snapshot.spreads[0].decorations.some((item) => item.decorationId === "paw" || item.decorationId === "heart"), false);
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
  const missing = assessPrintQuality(
    buildAlbumPrintSnapshot(input({ originals: { "user-photo-1": { storagePath: "pets/original-1.jpg" } } })),
    {},
    { fontsReady },
  );
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
  assert.equal(first.pageCount, 2);
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
  const files = [
    "../lib/album-print/snapshot.ts",
    "../lib/album-print/render-pdf.ts",
    "../lib/album-print/quality.ts",
    "../app/(app)/pets/[petId]/album/[albumId]/print/actions.ts",
    "../app/(app)/pets/[petId]/album/[albumId]/print/page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /openai|responses\.create|image_url|suggestSpreadCaption|album-caption|photo-analysis/i);
  }
});
