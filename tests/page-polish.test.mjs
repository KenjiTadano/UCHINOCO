import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ALBUM_LAYOUTS } from "../lib/smart-layout/layouts.ts";
import { DRAFT_HIERARCHY_LAYOUTS } from "../lib/album-draft/layouts.ts";
import { DECORATION_PER_SPREAD } from "../lib/album-persistence/config.ts";
import { assembleEditorSpread } from "../lib/album-persistence/editor.ts";
import { createHistorySession, noteEdit, pushEdit, redoHistory, undoHistory } from "../lib/album-persistence/history.ts";
import {
  canPlaceDecoration,
  decorationSlotIssue,
  intersects,
  layoutWithPolish,
  plainTextIssue,
  polishForLayout,
  resolveEffectiveDecoration,
  toSpreadNorm,
  resolveEffectiveText,
  styleIssue,
  textSlotIssue,
  visibleDecorationLayers,
  visibleTextLayers,
} from "../lib/album-polish/catalog.ts";
import { mapDecorationRow, mapTextRow } from "../lib/album-polish/rows.ts";
import { applyDecorationState, applyTextState } from "../lib/album-polish/state.ts";

const migration = await readFile("./supabase/migrations/20260928180000_album_draft_polish.sql", "utf8");
const pageHook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/use-page-edit-draft.ts", "utf8");
const pageScreen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page-edit-screen.tsx", "utf8");
const service = await readFile("./app/(app)/album-draft-service.ts", "utf8");
const coverScreen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/cover-edit-screen.tsx", "utf8");

function textRow(overrides = {}) {
  return {
    id: "text-1",
    draftSpreadId: "spread-1",
    slotId: "bottom-left",
    kind: "caption",
    aiText: "朝の遊び",
    userText: null,
    aiStyleId: "editorial",
    userStyleId: null,
    overrideMode: "inherit",
    position: 0,
    revision: 1,
    clientSeq: 1,
    createdAt: "2026-09-28T00:00:00Z",
    updatedAt: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

function decorationRow(overrides = {}) {
  return {
    id: "deco-1",
    draftSpreadId: "spread-1",
    slotId: "deco-top-left",
    aiDecorationId: "leaf",
    userDecorationId: null,
    aiScalePreset: "small",
    userScalePreset: null,
    overrideMode: "inherit",
    position: 0,
    revision: 1,
    clientSeq: 1,
    createdAt: "2026-09-28T00:00:00Z",
    updatedAt: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

function frame(id, position) {
  return {
    id,
    draftSpreadId: "spread-1",
    frameId: position === 0 ? "L02-a" : "L02-b",
    role: "primary",
    position,
    aiPhotoId: "photo-a",
    aiCropX: 0.5,
    aiCropY: 0.5,
    aiCropScale: 1,
    userPhotoId: null,
    userCropX: null,
    userCropY: null,
    userCropScale: null,
    matchTier: "STRICT",
    cropQuality: 100,
    warnings: [],
    revision: 1,
    clientSeq: 0,
  };
}

function view() {
  const spread = {
    id: "spread-1",
    draftVersionId: "version-1",
    storySpreadId: "story-1",
    position: 0,
    storyType: "single",
    recommendedDensity: "light",
    importance: 70,
    coherence: 80,
    aiLayoutId: "L02",
    userLayoutId: null,
    warnings: [],
    revision: 1,
    clientSeq: 0,
  };
  return {
    albumId: "album-1",
    versionId: "version-1",
    status: "ready",
    revision: 1,
    signature: "sig",
    previewUrls: { "photo-a": "https://example.test/a.jpg" },
    spreads: [assembleEditorSpread(spread, [frame("frame-1", 0), frame("frame-2", 1)], new Map([["photo-a", "https://example.test/a.jpg"]]))],
  };
}

test("1. text insert stores a user caption and leaves AI empty", () => {
  const next = applyTextState(view(), "spread-1", "bottom-left", {
    mode: "replace",
    text: "はじめてのおもちゃ",
    styleId: null,
    kind: "caption",
  }, 1);
  const row = next.spreads[0].texts[0];
  assert.equal(row.userText, "はじめてのおもちゃ");
  assert.equal(row.aiText, null);
  assert.equal(row.overrideMode, "replace");
  assert.equal(resolveEffectiveText(row).text, "はじめてのおもちゃ");
});

test("2. text replace does not copy over AI text", () => {
  const started = applyTextState(view(), "spread-1", "bottom-left", {
    mode: "inherit",
    text: null,
    styleId: null,
    kind: "caption",
  }, 1);
  started.spreads[0].texts[0].aiText = "朝の遊び";
  const next = applyTextState(started, "spread-1", "bottom-left", {
    mode: "replace",
    text: "朝のひなたぼっこ",
    styleId: "warm",
    kind: "caption",
  }, 2);
  const row = next.spreads[0].texts[0];
  assert.equal(row.aiText, "朝の遊び");
  assert.equal(row.userText, "朝のひなたぼっこ");
  assert.equal(resolveEffectiveText(row).text, "朝のひなたぼっこ");
});

test("3. text hidden stays hidden", () => {
  const row = textRow({ overrideMode: "hidden", userText: "" });
  const effective = resolveEffectiveText(row);
  assert.equal(effective.visible, false);
  assert.equal(effective.mode, "hidden");
  assert.equal(row.aiText, "朝の遊び");
});

test("4. text inherit shows AI text, including after a blank replace is reset", () => {
  const replaced = textRow({ overrideMode: "replace", userText: "" });
  assert.equal(resolveEffectiveText(replaced).visible, false);
  assert.equal(resolveEffectiveText(replaced).mode, "replace");
  const inherited = textRow({ overrideMode: "inherit", userText: null });
  assert.equal(resolveEffectiveText(inherited).visible, true);
  assert.equal(resolveEffectiveText(inherited).text, "朝の遊び");
});

test("5. text reload round-trips user override and AI text", () => {
  const stored = mapTextRow({
    id: "text-1",
    draft_spread_id: "spread-1",
    slot_id: "top-left",
    kind: "title",
    ai_text: "朝の遊び",
    user_text: "わかの夏",
    ai_style_id: "editorial",
    user_style_id: "handwritten",
    override_mode: "replace",
    position: 0,
    revision: 4,
    client_seq: 9,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  });
  assert.equal(stored.aiText, "朝の遊び");
  assert.equal(stored.userText, "わかの夏");
  assert.equal(stored.userStyleId, "handwritten");
  assert.equal(resolveEffectiveText(stored).text, "わかの夏");
  assert.deepEqual(visibleTextLayers("L02", [stored]).map((item) => item.slotId), ["top-left"]);
});

test("6. text undo restores the previous user override", () => {
  let session = createHistorySession();
  session = noteEdit(session, "page", {
    targetId: "text:spread-1:bottom-left",
    field: "text",
    before: { mode: "inherit", text: null },
    after: { mode: "replace", text: "はじめてのおもちゃ" },
  });
  const undone = undoHistory(session, "page");
  assert.deepEqual(undone.entry.before, { mode: "inherit", text: null });
  const restored = applyTextState(view(), "spread-1", "bottom-left", {
    mode: "inherit",
    text: null,
    styleId: null,
    kind: "caption",
  }, 2);
  assert.equal(resolveEffectiveText(restored.spreads[0].texts[0]).text, "");
});

test("7. text redo restores the typed caption", () => {
  let session = createHistorySession();
  session = pushEdit(session, "page", {
    targetId: "text:spread-1:bottom-left",
    field: "text",
    before: { mode: "inherit", text: null },
    after: { mode: "replace", text: "はじめてのおもちゃ" },
  });
  const undone = undoHistory(session, "page");
  const redone = redoHistory(undone.session, "page");
  assert.deepEqual(redone.entry.after, { mode: "replace", text: "はじめてのおもちゃ" });
});

test("8. text length validation rejects oversized captions and titles", () => {
  assert.equal(plainTextIssue("title", "あ".repeat(41)), "文字数が上限を超えています。");
  assert.equal(plainTextIssue("caption", "あ".repeat(81)), "文字数が上限を超えています。");
  assert.equal(plainTextIssue("date", "July 2, 2023"), null);
  assert.equal(plainTextIssue("date", "あ".repeat(25)), "文字数が上限を超えています。");
  assert.match(migration, /char_length\(coalesce\(user_text, ''\)\) <= 40/);
  assert.match(migration, /char_length\(p_user_text\) > v_limit/);
});

test("9. invalid style is rejected", () => {
  assert.equal(styleIssue("comic-sans"), "未対応の文字スタイルです。");
  assert.equal(styleIssue("warm"), null);
  assert.match(migration, /未対応の文字スタイルです/);
});

test("10. decoration insert keeps AI decoration empty", () => {
  const next = applyDecorationState(view(), "spread-1", "deco-top-right", {
    mode: "replace",
    decorationId: "paw",
    scale: "small",
  }, 1);
  const row = next.spreads[0].decorations[0];
  assert.equal(row.userDecorationId, "paw");
  assert.equal(row.aiDecorationId, null);
  assert.equal(resolveEffectiveDecoration(row).decorationId, "paw");
});

test("11. decoration replace does not change the AI decoration", () => {
  const started = {
    ...view(),
    spreads: [{ ...view().spreads[0], decorations: [decorationRow()] }],
  };
  const next = applyDecorationState(started, "spread-1", "deco-top-left", {
    mode: "replace",
    decorationId: "heart",
    scale: "small",
  }, 2);
  const row = next.spreads[0].decorations[0];
  assert.equal(row.aiDecorationId, "leaf");
  assert.equal(row.userDecorationId, "heart");
  assert.equal(resolveEffectiveDecoration(row).decorationId, "heart");
});

test("12. decoration hidden stays hidden and keeps the AI id", () => {
  const row = decorationRow({ overrideMode: "hidden" });
  assert.equal(resolveEffectiveDecoration(row).visible, false);
  assert.equal(row.aiDecorationId, "leaf");
});

test("13. decoration inherit shows the AI decoration", () => {
  const row = decorationRow({ overrideMode: "inherit", userDecorationId: "heart" });
  const effective = resolveEffectiveDecoration(row);
  assert.equal(effective.mode, "inherit");
  assert.equal(effective.decorationId, "leaf");
});

test("14. decoration reload round-trips hidden and replace", () => {
  const hidden = mapDecorationRow({
    id: "deco-1",
    draft_spread_id: "spread-1",
    slot_id: "deco-top-left",
    ai_decoration_id: "leaf",
    user_decoration_id: null,
    ai_scale_preset: "small",
    user_scale_preset: null,
    override_mode: "hidden",
    position: 0,
    revision: 3,
    client_seq: 6,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  });
  assert.equal(hidden.overrideMode, "hidden");
  assert.equal(visibleDecorationLayers("L02", [hidden]).length, 0);
  const shown = { ...hidden, overrideMode: "inherit" };
  assert.equal(visibleDecorationLayers("L02", [shown])[0].decorationId, "leaf");
});

test("15. decoration undo and redo move the user decoration", () => {
  let session = createHistorySession();
  const before = { mode: "inherit", decorationId: null, scale: null };
  const after = { mode: "replace", decorationId: "paw", scale: "small" };
  session = pushEdit(session, "page", {
    targetId: "decoration:spread-1:deco-top-right",
    field: "decoration",
    before,
    after,
  });
  const undone = undoHistory(session, "page");
  assert.deepEqual(undone.entry.before, before);
  const redone = redoHistory(undone.session, "page");
  assert.deepEqual(redone.entry.after, after);
});

test("16. decoration limit is three visible marks", () => {
  assert.equal(DECORATION_PER_SPREAD, 3);
  const rows = ["deco-top-left", "deco-top-right", "deco-bottom-left"].map((slotId, index) =>
    decorationRow({
      id: `deco-${index}`,
      slotId,
      aiDecorationId: null,
      userDecorationId: "star",
      overrideMode: "replace",
    }),
  );
  const extra = decorationRow({
    id: "deco-extra",
    slotId: "deco-bottom-right",
    aiDecorationId: null,
    userDecorationId: "paw",
    overrideMode: "replace",
  });
  assert.equal(canPlaceDecoration(rows, extra.slotId, extra), false);
  const hidden = { ...extra, overrideMode: "hidden", userDecorationId: null };
  assert.equal(canPlaceDecoration(rows, hidden.slotId, hidden), true);
  assert.match(migration, /v_visible >= 3/);
  assert.match(migration, /装飾は見開きあたり3つまでです/);
});

test("17. invalid slot is rejected", () => {
  assert.equal(textSlotIssue("L02", "free-canvas", "caption"), "このレイアウトには使えない位置です。");
  assert.equal(decorationSlotIssue("L02", "anywhere"), "このレイアウトには使えない位置です。");
  assert.match(migration, /このレイアウトには使えない位置です/);
});

test("18. ordered albums reject text and decoration writes", () => {
  assert.match(migration, /album_draft_text_elements_guard/);
  assert.match(migration, /album_draft_decorations_guard/);
  assert.equal(migration.match(/このアルバムは注文済みのため変更できません/g).length >= 2, true);
  assert.match(pageHook, /if \(!current \|\| !spread \|\| !kind \|\| readonly\) return/);
  assert.match(pageScreen, /disabled=\{readonly\}/);
});

test("19. cross-owner select and update are denied", () => {
  assert.match(migration, /album_draft_text_elements: owner select/);
  assert.match(migration, /album_draft_text_elements: owner update/);
  assert.match(migration, /album_draft_decorations: owner select/);
  assert.match(migration, /album_draft_decorations: owner update/);
  assert.doesNotMatch(migration, /using \(true\)/);
  assert.doesNotMatch(migration, /grant delete/i);
});

test("20. AI state stays unchanged by user writes", () => {
  const started = textRow();
  const next = applyTextState(
    { ...view(), spreads: [{ ...view().spreads[0], texts: [started] }] },
    "spread-1",
    "bottom-left",
    { mode: "replace", text: "わかの夏", styleId: "minimal", kind: "caption" },
    3,
  );
  assert.equal(next.spreads[0].texts[0].aiText, "朝の遊び");
  assert.equal(next.spreads[0].texts[0].aiStyleId, "editorial");
  assert.match(migration, /AI Stateは変更できません/);
  assert.match(migration, /set user_text = p_user_text/);
  assert.doesNotMatch(migration, /set ai_text/);
  assert.doesNotMatch(migration, /set ai_decoration_id/);
});

test("21. text and decoration edits do not call Vision", () => {
  assert.doesNotMatch(pageHook, /openai|images\/generations|photo-analysis|analyzePhoto/i);
  assert.doesNotMatch(service, /openai|images\/generations|analyzePhoto/i);
  assert.doesNotMatch(coverScreen, /PagePolishControls/);
});

test("slots stay off photos, off the gutter, and off the scoring catalog", () => {
  const scoring = ALBUM_LAYOUTS.find((layout) => layout.id === "L02");
  assert.equal(scoring.textSlots, undefined);
  const polished = layoutWithPolish(scoring);
  assert.equal(polished.textSlots.length > 0, true);
  assert.equal(polished.decorationSlots.length > 0, true);
  for (const layout of [...ALBUM_LAYOUTS, ...DRAFT_HIERARCHY_LAYOUTS]) {
    const slots = polishForLayout(layout.id);
    for (const slot of [...slots.text, ...slots.decoration]) {
      assert.equal(intersects(slot.rect, { x: 0.47, y: 0, w: 0.06, h: 1 }), false, layout.id);
      assert.equal(layout.frames.some((frame) => intersects(slot.rect, frame.rect)), false, `${layout.id}:${slot.id}`);
    }
  }
  assert.equal(plainTextIssue("caption", "<script>alert(1)</script>"), "テキストはプレーンテキストのみです。");
  const placed = toSpreadNorm(polished.textSlots[0].rect);
  assert.equal(placed.y > 0.15 && placed.y < 0.85, true);
  assert.equal(placed.x > 0.08 && placed.x + placed.w < 0.92, true);
});
