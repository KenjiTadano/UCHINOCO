import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createHistorySession, pushEdit, redoHistory, undoHistory } from "../lib/album-persistence/history.ts";
import { ELEMENT_BACKGROUNDS, ELEMENT_DECORATIONS, ELEMENT_STAMPS, elementAspectLocked, isElementBackgroundId, mapPageBackgroundRow, mapPageElementRow, normalizePageElement, pageElementOrder, snapPageElement } from "../lib/album-elements/model.ts";

const migration = await readFile("./supabase/migrations/20261001120000_album_draft_page_elements.sql", "utf8");
const multilineMigration = await readFile("./supabase/migrations/20261001130000_album_draft_multiline_text.sql", "utf8");

const text = (overrides = {}) => ({
  id: "element-1",
  type: "text",
  x: 0.2,
  y: 0.3,
  width: 0.4,
  height: 0.08,
  rotation: 0,
  zIndex: 1,
  printTarget: "print",
  revision: 1,
  clientSeq: 1,
  text: "はじめて海に行った日",
  fontId: "handwritten",
  fontSize: 20,
  bold: false,
  colorId: "terracotta",
  align: "center",
  ...overrides,
});

test("free text preserves Japanese content and supported styling", () => {
  const element = normalizePageElement(text());
  assert.equal(element?.type, "text");
  assert.equal(element?.text, "はじめて海に行った日");
  assert.equal(element?.fontId, "handwritten");
  assert.equal(element?.align, "center");
});

test("free text preserves explicit line breaks and rejects other control characters", () => {
  assert.equal(normalizePageElement(text({ text: "一行目\n二行目" }))?.text, "一行目\n二行目");
  assert.equal(normalizePageElement(text({ text: "一行目\t二行目" })), null);
});

test("invalid text, style, and non-finite geometry are rejected", () => {
  assert.equal(normalizePageElement(text({ text: "<script>" })), null);
  assert.equal(normalizePageElement(text({ text: "" })), null);
  assert.equal(normalizePageElement(text({ fontId: "unknown" })), null);
  assert.equal(normalizePageElement(text({ x: Number.NaN })), null);
  assert.equal(normalizePageElement(text({ rotation: Number.POSITIVE_INFINITY })), null);
});

test("element geometry clamps to a visible page area and bounded rotation", () => {
  const element = normalizePageElement(text({ x: 8, y: -4, width: 2, height: 0, rotation: 900, zIndex: 200 }));
  assert.equal(element?.x, 0.92);
  assert.equal(element?.y, 0.055);
  assert.equal(element?.width, 0.96);
  assert.equal(element?.height, 0.025);
  assert.equal(element?.rotation, 180);
  assert.equal(element?.zIndex, 100);
});

test("stamp and decoration catalogs stay compact and aspect locked", () => {
  assert.equal(ELEMENT_STAMPS.length >= 10 && ELEMENT_STAMPS.length <= 20, true);
  assert.equal(ELEMENT_DECORATIONS.length > 0, true);
  assert.equal(ELEMENT_BACKGROUNDS.length >= 5, true);
  const stamp = normalizePageElement({ ...text(), type: "stamp", stampId: "paw", colorId: "sage" });
  const decoration = normalizePageElement({ ...text(), type: "decoration", decorationId: "ribbon" });
  assert.equal(stamp ? elementAspectLocked(stamp) : false, true);
  assert.equal(decoration ? elementAspectLocked(decoration) : false, true);
  const resized = normalizePageElement({ ...stamp, width: 0.2, height: 0.1 });
  assert.equal(resized && Math.abs(resized.width / resized.height - 2) < 0.0001, true);
});

test("background palette rejects unknown tokens and layer order is stable", () => {
  assert.equal(isElementBackgroundId("warm"), true);
  assert.equal(isElementBackgroundId("neon"), false);
  const first = normalizePageElement(text({ id: "a", zIndex: 1 }));
  const second = normalizePageElement(text({ id: "b", zIndex: 2 }));
  assert.deepEqual(first && second ? pageElementOrder([second, first]).map((item) => item.id) : [], ["a", "b"]);
});

test("element persistence isolates user data and guards owner, order, and write order", () => {
  assert.match(migration, /create table public\.album_draft_page_elements/);
  assert.match(migration, /create table public\.album_draft_spread_backgrounds/);
  assert.match(migration, /assert_editable_album_draft_spread/);
  assert.match(migration, /client_seq > p_client_seq/);
  assert.match(migration, /is_deleted = p_is_deleted/);
  assert.match(migration, /v_album_status = 'ordered' or v_version_status = 'locked'/);
  assert.match(migration, /p_element_data->>'printTarget'/);
  assert.match(migration, /grant execute on function public\.apply_draft_page_element_override/);
  assert.match(multilineMigration, /create or replace function public\.apply_draft_page_element_override/);
  assert.match(multilineMigration, /replace\(v_text, E'\\n', ''\)/);
});

test("element and background snapshots use the existing shared history stack", () => {
  const element = normalizePageElement(text());
  const added = pushEdit(createHistorySession(), "page", {
    targetId: "element:spread-1:element-1",
    field: "element",
    before: null,
    after: element,
  });
  assert.equal(undoHistory(added, "page").entry?.after?.type, "text");
  assert.equal(redoHistory(undoHistory(added, "page").session, "page").entry?.after?.id, "element-1");
  const background = pushEdit(createHistorySession(), "page", {
    targetId: "background:spread-1:left",
    field: "background",
    before: null,
    after: "sage",
  });
  assert.equal(undoHistory(background, "page").entry?.before, null);
  assert.equal(redoHistory(undoHistory(background, "page").session, "page").entry?.after, "sage");
});

test("page-center snapping reports guides only near a page center", () => {
  const element = normalizePageElement(text({ x: 0.205, y: 0.46, width: 0.1, height: 0.08 }));
  const snapped = snapPageElement(element, [{ x: 0, y: 0, w: 0.5, h: 1 }]);
  assert.equal(snapped.element.x, 0.2);
  assert.equal(snapped.element.y, 0.46);
  assert.deepEqual(snapped.guides, { x: 0.25, y: 0.5 });
  const free = snapPageElement(normalizePageElement(text({ x: 0.1, y: 0.1 })), [{ x: 0, y: 0, w: 0.5, h: 1 }]);
  assert.deepEqual(free.guides, { x: null, y: null });
});

test("stored element/background rows round-trip with row revisions and reject mismatched types", () => {
  const element = mapPageElementRow({ id: "row-id", element_type: "text", element_data: text(), revision: 4, client_seq: 9 });
  assert.equal(element?.id, "row-id");
  assert.equal(element?.revision, 4);
  assert.equal(element?.clientSeq, 9);
  assert.equal(mapPageElementRow({ id: "row-id", element_type: "stamp", element_data: text(), revision: 1, client_seq: 1 }), null);
  assert.deepEqual(mapPageBackgroundRow({ draft_spread_id: "spread-1", page_side: "right", background_id: "sage", revision: 2, client_seq: 3 }), {
    spreadId: "spread-1",
    side: "right",
    state: { backgroundId: "sage", revision: 2, clientSeq: 3 },
  });
});

test("Task059 recommendation provenance round-trips inside element_data without schema changes", () => {
  const recommended = normalizePageElement(
    text({
      recommendationId: "task059:rec-1",
      recommendationBackgroundsBefore: { left: null, right: "white" },
      recommendationBackgroundsAfter: { left: "warm", right: "warm" },
    }),
  );
  assert.equal(recommended?.recommendationId, "task059:rec-1");
  assert.deepEqual(recommended?.recommendationBackgroundsBefore, { left: null, right: "white" });
  assert.deepEqual(recommended?.recommendationBackgroundsAfter, { left: "warm", right: "warm" });
  assert.equal(mapPageElementRow({ id: "row-id", element_type: "text", element_data: recommended, revision: 2, client_seq: 3 })?.recommendationId, "task059:rec-1");
  assert.equal(normalizePageElement(text({ recommendationId: "untrusted:rec" }))?.recommendationId, undefined);
  assert.match(migration, /element_data jsonb/);
});
