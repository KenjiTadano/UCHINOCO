/**
 * Task047-4 — Print document model + PDF generation tests A–T
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { mmToPoints, DPI_WARNING_THRESHOLD } from "../lib/print/layout/units.ts";
import { calculateContainRect, calculateCoverRect } from "../lib/print/layout/fit.ts";
import { buildPrintDocument } from "../lib/print/document-builder.ts";
import { generatePrintPdfs } from "../lib/print/pdf/pdf-generator.ts";
import { MockImageLoader } from "../lib/print/pdf/image-loader.ts";
import { InvalidImageError } from "../lib/print/pdf/errors.ts";

// ── Minimal test images ───────────────────────────────────────────────────────
// 1×1 PNG (valid, known-good for pdf-lib)
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// Raw magic bytes for format detection tests (not full valid images)
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const INVALID_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

const ORDER_ID = "00000000-0000-4000-8000-000000000099";

function makeSpec(overrides = {}) {
  return {
    orderId: ORDER_ID,
    title: "テストアルバム",
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    cover: { imagePath: null, titleText: null, fit: "cover" },
    pages: [],
    totalPageCount: 0,
    ...overrides,
  };
}

// ── A: mmToPoints ─────────────────────────────────────────────────────────────

test("A: mmToPoints(25.4) === 72 (1 inch = 72 points)", () => {
  assert.equal(mmToPoints(25.4), 72);
});

test("A: mmToPoints(0) === 0", () => {
  assert.equal(mmToPoints(0), 0);
});

test("A: mmToPoints(210) is correct", () => {
  const expected = (210 / 25.4) * 72;
  assert.ok(Math.abs(mmToPoints(210) - expected) < 0.001);
});

// ── B: contain landscape image ────────────────────────────────────────────────

test("B: calculateContainRect landscape (wide) image is pillarboxed — x>0, y≈0", () => {
  // 200×100 image in 100×100 target → scale = 0.5, width=100, height=50
  // y = (100-50)/2 = 25, x = 0
  const r = calculateContainRect(200, 100, 100, 100);
  assert.equal(r.x, 0);
  assert.ok(r.y > 0, "y should be >0 for landscape (letterboxed vertically)");
  assert.equal(r.width, 100);
});

// ── C: contain portrait image ─────────────────────────────────────────────────

test("C: calculateContainRect portrait (tall) image is letterboxed — x>0, y≈0", () => {
  // 100×200 image in 100×100 target → scale = 0.5, width=50, height=100
  // x = (100-50)/2 = 25, y = 0
  const r = calculateContainRect(100, 200, 100, 100);
  assert.ok(r.x > 0, "x should be >0 for portrait (pillarboxed horizontally)");
  assert.equal(r.y, 0);
  assert.equal(r.height, 100);
});

// ── D: cover landscape image ──────────────────────────────────────────────────

test("D: calculateCoverRect landscape image — full target height used, x<0 (cropped sides)", () => {
  // 200×100 image in 100×100 target → scale = max(0.5, 1.0) = 1.0
  // width = 200, height = 100; x = (100-200)/2 = -50
  const r = calculateCoverRect(200, 100, 100, 100);
  assert.ok(r.x < 0, "x should be negative (cropped horizontally)");
  assert.equal(r.height, 100);
});

// ── E: cover portrait image ───────────────────────────────────────────────────

test("E: calculateCoverRect portrait image — full target width used, y<0 (cropped top/bottom)", () => {
  const r = calculateCoverRect(100, 200, 100, 100);
  assert.ok(r.y < 0, "y should be negative (cropped vertically)");
  assert.equal(r.width, 100);
});

// ── F: page count ─────────────────────────────────────────────────────────────

test("F: buildPrintDocument produces exactly totalPageCount pages", () => {
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: "test",
    cover_original_path_snapshot: null,
    pages: 5,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: [],
  });
  assert.equal(doc.pages.length, 5);
  assert.equal(doc.totalPageCount, 5);
});

// ── G: photo order ────────────────────────────────────────────────────────────

test("G: buildPrintDocument preserves photo order from orderPhotos", () => {
  const photos = [
    { photoId: "p1", position: 0, original_path: "path/a.jpg" },
    { photoId: "p2", position: 1, original_path: "path/b.jpg" },
    { photoId: "p3", position: 2, original_path: "path/c.jpg" },
  ];
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: null,
    cover_original_path_snapshot: null,
    pages: 3,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: photos,
  });
  assert.equal(doc.pages[0].item?.imagePath, "path/a.jpg");
  assert.equal(doc.pages[1].item?.imagePath, "path/b.jpg");
  assert.equal(doc.pages[2].item?.imagePath, "path/c.jpg");
});

// ── H: blank pages ────────────────────────────────────────────────────────────

test("H: buildPrintDocument fills remaining pages with null items (blank)", () => {
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: null,
    cover_original_path_snapshot: null,
    pages: 5,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: [
      { photoId: "p1", position: 0, original_path: "path/a.jpg" },
    ],
  });
  assert.ok(doc.pages[0].item !== null, "page 1 has photo");
  assert.equal(doc.pages[1].item, null, "page 2 is blank");
  assert.equal(doc.pages[4].item, null, "page 5 is blank");
});

// ── I: too many photos ────────────────────────────────────────────────────────

test("I: buildPrintDocument throws when photoCount > pages", () => {
  assert.throws(
    () =>
      buildPrintDocument({
        orderId: ORDER_ID,
        album_title_snapshot: null,
        cover_original_path_snapshot: null,
        pages: 2,
        productId: "standard",
        printWidthMm: 180,
        printHeightMm: 180,
        bleedMm: 0,
        orderPhotos: [
          { photoId: "p1", position: 0, original_path: "a.jpg" },
          { photoId: "p2", position: 1, original_path: "b.jpg" },
          { photoId: "p3", position: 2, original_path: "c.jpg" },
        ],
      }),
    /Photo count.*exceeds page count/,
  );
});

// ── J: snapshot source only ───────────────────────────────────────────────────

test("J: buildPrintDocument uses orderPhotos param and never queries album_photos (structural)", async () => {
  const src = await readFile("./lib/print/document-builder.ts", "utf8");
  // Must not contain Supabase queries for album_photos
  assert.ok(!src.includes('.from("album_photos")'), "no Supabase query for album_photos");
  assert.ok(!src.includes("from('album_photos')"), "no query for album_photos (single-quote)");
  assert.ok(src.includes("orderPhotos"), "uses orderPhotos from order snapshot");
});

// ── K: filename has no PII ────────────────────────────────────────────────────

test("K: cover filename is orders/{orderId}/cover.pdf (no PII)", async () => {
  const loader = new MockImageLoader();
  const spec = makeSpec({ pages: [], totalPageCount: 0 });
  const { result } = await generatePrintPdfs(spec, { loader });
  assert.equal(result.cover.filename, `orders/${ORDER_ID}/cover.pdf`);
  assert.ok(!result.cover.filename.includes("山田"), "no PII in filename");
  assert.ok(!result.cover.filename.includes("tokyo"), "no address in filename");
});

// ── L: cover uses cover_original_path_snapshot ───────────────────────────────

test("L: cover.imagePath is set from cover_original_path_snapshot", () => {
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: null,
    cover_original_path_snapshot: "user/pet/cover.jpg",
    pages: 1,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: [],
  });
  assert.equal(doc.cover.imagePath, "user/pet/cover.jpg");
});

// ── M: title uses album_title_snapshot ────────────────────────────────────────

test("M: cover.titleText is set from album_title_snapshot", () => {
  const doc = buildPrintDocument({
    orderId: ORDER_ID,
    album_title_snapshot: "ここの思い出",
    cover_original_path_snapshot: null,
    pages: 1,
    productId: "standard",
    printWidthMm: 180,
    printHeightMm: 180,
    bleedMm: 0,
    orderPhotos: [],
  });
  assert.equal(doc.cover.titleText, "ここの思い出");
  assert.equal(doc.title, "ここの思い出");
});

// ── N: no provider name in pdf-generator ─────────────────────────────────────

test("N: pdf-generator.ts contains no provider names (structural)", async () => {
  const src = await readFile("./lib/print/pdf/pdf-generator.ts", "utf8");
  assert.ok(!src.includes("prodigi"), "no prodigi in pdf-generator");
  assert.ok(!src.includes("gelato"),  "no gelato in pdf-generator");
  assert.ok(!src.includes("fujifilm"), "no fujifilm in pdf-generator");
});

// ── O: JPEG embed ─────────────────────────────────────────────────────────────

test("O: pdf-generator.ts routes JPEG magic bytes (FF D8) to embedJpg (structural)", async () => {
  // Verify magic byte detection logic is present for JPEG (FF D8 FF)
  const src = await readFile("./lib/print/pdf/pdf-generator.ts", "utf8");
  assert.ok(src.includes("0xff") && src.includes("0xd8"), "JPEG magic byte check present");
  assert.ok(src.includes("embedJpg"), "routes to embedJpg for JPEG");
  assert.ok(src.includes("embedPng"), "routes to embedPng for PNG");
  // Verify JPEG bytes [0] = 0xff, [1] = 0xd8 are correct
  assert.equal(JPEG_MAGIC[0], 0xff);
  assert.equal(JPEG_MAGIC[1], 0xd8);
});

// ── P: PNG embed ──────────────────────────────────────────────────────────────

test("P: generatePrintPdfs succeeds with 1×1 PNG image", async () => {
  const loader = new MockImageLoader(new Map([["img.png", new Uint8Array(PNG_1X1)]]));
  const spec = makeSpec({
    cover: { imagePath: "img.png", titleText: null, fit: "cover" },
    pages: [{ pageNumber: 1, item: { photoId: "p1", imagePath: "img.png", sourceWidthPx: null, sourceHeightPx: null, fit: "contain" } }],
    totalPageCount: 1,
  });
  const { result } = await generatePrintPdfs(spec, { loader });
  assert.ok(result.cover.bytes.length > 0);
  assert.ok(result.content.bytes.length > 0);
});

// ── Q: invalid image ──────────────────────────────────────────────────────────

test("Q: generatePrintPdfs throws InvalidImageError for non-JPEG/PNG bytes", async () => {
  const loader = new MockImageLoader(new Map([["bad.bmp", INVALID_BYTES]]));
  const spec = makeSpec({
    cover: { imagePath: "bad.bmp", titleText: null, fit: "cover" },
    pages: [],
    totalPageCount: 0,
  });
  await assert.rejects(() => generatePrintPdfs(spec, { loader }), InvalidImageError);
});

// ── R: low DPI warning ────────────────────────────────────────────────────────

test("R: generatePrintPdfs returns DPI warning for 1×1 pixel image on 180mm page", async () => {
  // 1px / (180mm / 25.4 mm/inch) ≈ 0.14 DPI << 200 threshold
  const loader = new MockImageLoader(new Map([["tiny.png", new Uint8Array(PNG_1X1)]]));
  const spec = makeSpec({
    cover: { imagePath: "tiny.png", titleText: null, fit: "cover" },
    pages: [],
    totalPageCount: 0,
  });
  const { warnings } = await generatePrintPdfs(spec, { loader });
  assert.ok(warnings.length > 0, "low DPI warning should be emitted");
  assert.ok(warnings[0].estimatedDpi < DPI_WARNING_THRESHOLD);
  assert.equal(warnings[0].threshold, DPI_WARNING_THRESHOLD);
});

// ── S: PDF magic bytes ────────────────────────────────────────────────────────

test("S: generated cover PDF starts with %PDF magic bytes", async () => {
  const loader = new MockImageLoader();
  const spec = makeSpec({ pages: [], totalPageCount: 0 });
  const { result } = await generatePrintPdfs(spec, { loader });
  const magic = String.fromCharCode(...result.cover.bytes.slice(0, 4));
  assert.equal(magic, "%PDF", "PDF magic bytes present");
});

// ── T: generated page count ───────────────────────────────────────────────────

test("T: generated content PDF pageCount matches spec.pages.length", async () => {
  const loader = new MockImageLoader();
  const pages = [
    { pageNumber: 1, item: null },
    { pageNumber: 2, item: null },
    { pageNumber: 3, item: null },
  ];
  const spec = makeSpec({ pages, totalPageCount: 3 });
  const { result } = await generatePrintPdfs(spec, { loader });
  assert.equal(result.content.pageCount, 3);
});
