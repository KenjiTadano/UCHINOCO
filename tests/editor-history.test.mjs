import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  applyCoverPhoto,
  applyCoverTitle,
  toCoverEditor,
} from "../lib/album-persistence/cover.ts";
import { EDITOR_HISTORY_LIMIT } from "../lib/album-persistence/config.ts";
import {
  applyFrameCrop,
  applyFramePhoto,
  applySpreadLayout,
  assembleEditorSpread,
  toAlbumEditorSpread,
} from "../lib/album-persistence/editor.ts";
import { decideWrite } from "../lib/album-persistence/resolve.ts";
import {
  beginGesture,
  canRedoHistory,
  canUndoHistory,
  commitOpen,
  createHistorySession,
  historyValuesEqual,
  noteEdit,
  pushEdit,
  redoHistory,
  undoHistory,
} from "../lib/album-persistence/history.ts";

const pageHook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/use-page-edit-draft.ts", "utf8");
const coverHook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/use-cover-edit-draft.ts", "utf8");
const pageScreen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page-edit-screen.tsx", "utf8");
const coverScreen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/cover-edit-screen.tsx", "utf8");
const historyHook = await readFile("./lib/album-persistence/use-editor-history.ts", "utf8");
const historySource = await readFile("./lib/album-persistence/history.ts", "utf8");
const spreadView = await readFile("./app/(app)/pets/[petId]/album/_components/draft-spread-view.tsx", "utf8");
const controls = await readFile("./app/(app)/pets/[petId]/album/_components/editor-history-controls.tsx", "utf8");

const spread = (id, position, layoutId) => ({
  id,
  draftVersionId: "version-1",
  storySpreadId: `story-${position}`,
  position,
  storyType: "single",
  recommendedDensity: "light",
  importance: 70,
  coherence: 80,
  aiLayoutId: layoutId,
  userLayoutId: null,
  warnings: [],
  revision: 1,
  clientSeq: 0,
});

const frame = (id, spreadId, position, frameId, role, photoId, crop) => ({
  id,
  draftSpreadId: spreadId,
  frameId,
  role,
  position,
  aiPhotoId: photoId,
  aiCropX: crop.x,
  aiCropY: crop.y,
  aiCropScale: crop.scale,
  userPhotoId: null,
  userCropX: null,
  userCropY: null,
  userCropScale: null,
  matchTier: "STRICT",
  cropQuality: 100,
  warnings: [],
  revision: 1,
  clientSeq: 0,
});

function view() {
  const urls = new Map([
    ["photo-a", "https://example.test/a.jpg"],
    ["photo-b", "https://example.test/b.jpg"],
  ]);
  const first = spread("spread-1", 0, "L02");
  const third = spread("spread-3", 2, "L01");
  return {
    albumId: "album-1",
    versionId: "version-1",
    status: "ready",
    revision: 1,
    signature: "sig",
    previewUrls: Object.fromEntries(urls),
    spreads: [
      assembleEditorSpread(first, [
        frame("frame-1", first.id, 0, "L02-a", "primary", "photo-a", { x: 0.43, y: 0.43, scale: 1.15 }),
      ], urls),
      assembleEditorSpread(third, [
        frame("frame-5", third.id, 0, "L01-hero", "hero", "photo-a", { x: 0.5, y: 0.37, scale: 1 }),
      ], urls),
    ],
  };
}

function coverModel() {
  return toCoverEditor({
    id: "cover-1",
    draftVersionId: "version-1",
    coverType: "front",
    aiPhotoId: "photo-a",
    userPhotoId: null,
    aiTitle: "7月の思い出",
    userTitle: null,
    aiSubtitle: "わかの",
    userSubtitle: null,
    aiTemplateId: "simple",
    userTemplateId: null,
    aiColorId: "white",
    userColorId: null,
    revision: 1,
    clientSeq: 0,
  }, { "photo-a": "https://example.test/a.jpg", "photo-b": "https://example.test/b.jpg" });
}

test("1. layout undo restores the previous user override", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "spread-3",
    field: "layout",
    before: null,
    after: "L01b",
  });
  const undone = undoHistory(session, "page");
  assert.equal(undone.entry.before, null);
  const next = applySpreadLayout(view(), "spread-3", undone.entry.before, 2);
  assert.equal(next.spreads[1].userLayoutId, null);
  assert.equal(next.spreads[1].effectiveLayoutId, "L01");
  assert.equal(next.spreads[1].source.aiLayoutId, "L01");
});

test("2. layout redo reapplies the user layout", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "spread-3",
    field: "layout",
    before: null,
    after: "L01b",
  });
  const redone = redoHistory(undoHistory(session, "page").session, "page");
  assert.equal(redone.entry.after, "L01b");
  const next = applySpreadLayout(view(), "spread-3", redone.entry.after, 3);
  assert.equal(next.spreads[1].userLayoutId, "L01b");
  assert.equal(next.spreads[1].source.aiLayoutId, "L01");
});

test("3. crop undo restores the previous user crop", () => {
  let session = beginGesture(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "crop",
    before: null,
    after: null,
  });
  session = noteEdit(session, "page", {
    targetId: "frame-1",
    field: "crop",
    before: null,
    after: { x: 0.4, y: 0.4, scale: 1.1 },
  });
  session = noteEdit(session, "page", {
    targetId: "frame-1",
    field: "crop",
    before: null,
    after: { x: 0.2, y: 0.3, scale: 1.1 },
  });
  assert.equal(session.undo.length, 0);
  const undone = undoHistory(session, "page");
  assert.equal(undone.entry.before, null);
  assert.equal(undone.entry.after.x, 0.2);
  const next = applyFrameCrop(view(), "frame-1", undone.entry.before, 2);
  assert.equal(next.spreads[0].sourceFrames[0].userCropX, null);
  assert.equal(next.spreads[0].sourceFrames[0].aiCropX, 0.43);
});

test("4. crop redo reapplies the gesture end", () => {
  let session = beginGesture(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "crop",
    before: null,
    after: null,
  });
  session = noteEdit(session, "page", {
    targetId: "frame-1",
    field: "crop",
    before: null,
    after: { x: 0.2, y: 0.3, scale: 1.1 },
  });
  const redone = redoHistory(undoHistory(session, "page").session, "page");
  assert.equal(redone.entry.after.scale, 1.1);
  const next = applyFrameCrop(view(), "frame-1", redone.entry.after, 3);
  assert.equal(next.spreads[0].sourceFrames[0].userCropScale, 1.1);
  assert.equal(next.spreads[0].sourceFrames[0].aiCropScale, 1.15);
});

test("5. photo undo restores the previous user photo", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "photo",
    before: null,
    after: "photo-b",
  });
  const undone = undoHistory(session, "page");
  const next = applyFramePhoto(view(), "frame-1", undone.entry.before, 2);
  assert.equal(next.spreads[0].sourceFrames[0].userPhotoId, null);
  assert.equal(next.spreads[0].frames[0].effectivePhotoId, "photo-a");
  assert.equal(next.spreads[0].sourceFrames[0].aiPhotoId, "photo-a");
});

test("6. photo redo reapplies the replacement", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "photo",
    before: null,
    after: "photo-b",
  });
  const redone = redoHistory(undoHistory(session, "page").session, "page");
  const next = applyFramePhoto(view(), "frame-1", redone.entry.after, 3, "https://example.test/b.jpg");
  const editor = toAlbumEditorSpread(next.spreads[0], next.previewUrls);
  assert.equal(editor.frames[0].photoId, "photo-b");
  assert.equal(next.spreads[0].sourceFrames[0].aiPhotoId, "photo-a");
  assert.match(editor.frames[0].previewUrl, /b\.jpg/);
});

test("7. reset layout undo returns the user layout", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "spread-3",
    field: "layout",
    before: "L01b",
    after: null,
  });
  const undone = undoHistory(session, "page");
  assert.equal(undone.entry.before, "L01b");
  assert.equal(undone.entry.after, null);
  const next = applySpreadLayout(view(), "spread-3", undone.entry.before, 4);
  assert.equal(next.spreads[1].userLayoutId, "L01b");
  assert.equal(next.spreads[1].source.aiLayoutId, "L01");
});

test("8. reset crop undo returns the custom crop", () => {
  const custom = { x: 0.2, y: 0.3, scale: 1.4 };
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "crop",
    before: custom,
    after: null,
  });
  const undone = undoHistory(session, "page");
  const next = applyFrameCrop(view(), "frame-1", undone.entry.before, 4);
  assert.equal(next.spreads[0].sourceFrames[0].userCropScale, 1.4);
  assert.equal(next.spreads[0].sourceFrames[0].aiCropScale, 1.15);
});

test("9. reset photo undo returns the replaced photo", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "frame-1",
    field: "photo",
    before: "photo-b",
    after: null,
  });
  const undone = undoHistory(session, "page");
  const next = applyFramePhoto(view(), "frame-1", undone.entry.before, 4, "https://example.test/b.jpg");
  assert.equal(next.spreads[0].sourceFrames[0].userPhotoId, "photo-b");
  assert.equal(next.spreads[0].sourceFrames[0].aiPhotoId, "photo-a");
});

test("10. pending crop autosave is cancelled by undo", () => {
  assert.match(pageHook, /clearTimeout\(pending\)/);
  const undo = pageHook.slice(pageHook.indexOf("function undo("));
  assert.match(undo, /history\.undo\(\)/);
  assert.match(undo, /applyEntry\(entry, entry\.before\)/);
  assert.match(pageHook, /writeCrop\(entry\.targetId, \(value as CropTriple \| null\) \?\? null, false, false\)/);
  assert.equal(decideWrite({ storedRevision: 1, storedSeq: 4, expectedRevision: 1, clientSeq: 3 }), "stale");
});

test("11. title undo restores the previous user title", () => {
  let session = noteEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "title",
    before: null,
    after: "abc",
  });
  session = noteEdit(session, "cover", {
    targetId: "cover-1",
    field: "title",
    before: null,
    after: "abcd",
  });
  session = noteEdit(session, "cover", {
    targetId: "cover-1",
    field: "title",
    before: null,
    after: "abcde",
  });
  const undone = undoHistory(session, "cover");
  assert.equal(session.undo.length, 0);
  assert.equal(undone.entry.after, "abcde");
  assert.equal(undone.entry.before, null);
  const next = applyCoverTitle(coverModel(), undone.entry.before, 2);
  assert.equal(next.source.userTitle, null);
  assert.equal(next.title, "7月の思い出");
  assert.equal(next.source.aiTitle, "7月の思い出");
});

test("12. title redo reapplies the grouped text", () => {
  let session = noteEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "title",
    before: null,
    after: "わかの夏",
  });
  const redone = redoHistory(undoHistory(session, "cover").session, "cover");
  const next = applyCoverTitle(coverModel(), redone.entry.after, 3);
  assert.equal(next.source.userTitle, "わかの夏");
  assert.equal(next.source.aiTitle, "7月の思い出");
});

test("13. subtitle undo restores the previous user subtitle", () => {
  const session = pushEdit(commitOpen(noteEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "subtitle",
    before: null,
    after: "うちのこの夏",
  }), "cover"), "cover", {
    targetId: "cover-1",
    field: "template",
    before: null,
    after: "natural",
  });
  const undone = undoHistory(undoHistory(session, "cover").session, "cover");
  assert.equal(undone.entry.field, "subtitle");
  assert.equal(undone.entry.before, null);
});

test("14. template undo restores the previous user template", () => {
  const session = pushEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "template",
    before: null,
    after: "natural",
  });
  const undone = undoHistory(session, "cover");
  assert.equal(undone.entry.before, null);
  assert.equal(undone.entry.after, "natural");
});

test("15. color undo restores the previous user color", () => {
  const session = pushEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "color",
    before: null,
    after: "pink",
  });
  assert.equal(undoHistory(session, "cover").entry.before, null);
});

test("16. cover photo undo restores the previous user photo", () => {
  const session = pushEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "photo",
    before: null,
    after: "photo-b",
  });
  const undone = undoHistory(session, "cover");
  const next = applyCoverPhoto(coverModel(), undone.entry.before, 2);
  assert.equal(next.source.userPhotoId, null);
  assert.equal(next.photoId, "photo-a");
  assert.equal(next.source.aiPhotoId, "photo-a");
});

test("17. reset cover photo undo returns the replacement", () => {
  const session = pushEdit(createHistorySession(), "cover", {
    targetId: "cover-1",
    field: "photo",
    before: "photo-b",
    after: null,
  });
  const undone = undoHistory(session, "cover");
  const next = applyCoverPhoto(coverModel(), undone.entry.before, 3, "https://example.test/b.jpg");
  assert.equal(next.source.userPhotoId, "photo-b");
  assert.equal(next.photoId, "photo-b");
  assert.equal(next.source.aiPhotoId, "photo-a");
});

test("18. a new edit clears redo", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "spread-3",
    field: "layout",
    before: null,
    after: "L01b",
  });
  const undone = undoHistory(session, "page");
  assert.equal(canRedoHistory(undone.session), true);
  const next = pushEdit(undone.session, "page", {
    targetId: "spread-3",
    field: "layout",
    before: null,
    after: "L03",
  });
  assert.equal(next.redo.length, 0);
  assert.equal(canRedoHistory(next), false);
});

test("19. an unchanged value is not recorded", () => {
  const session = pushEdit(createHistorySession(), "page", {
    targetId: "spread-3",
    field: "layout",
    before: "L01b",
    after: "L01b",
  });
  assert.equal(session.undo.length, 0);
  assert.equal(historyValuesEqual({ x: 0.2, y: 0.3, scale: 1.1 }, { scale: 1.1, y: 0.3, x: 0.20001 }), true);
  assert.equal(canUndoHistory(session), false);
});

test("20. history keeps only the configured limit", () => {
  let session = createHistorySession();
  for (let index = 0; index < 5; index += 1) {
    session = pushEdit(session, "page", {
      targetId: `spread-${index}`,
      field: "layout",
      before: null,
      after: `L0${index}`,
    }, index, 3);
  }
  assert.equal(session.undo.length, 3);
  assert.equal(session.undo[0].targetId, "spread-2");
  assert.equal(EDITOR_HISTORY_LIMIT >= 50 && EDITOR_HISTORY_LIMIT <= 100, true);
});

test("21. ordered albums disable undo and redo", () => {
  assert.match(pageScreen, /disabled=\{readonly \|\| !view\}/);
  assert.match(coverScreen, /disabled=\{readonly \|\| missing \|\| !cover\}/);
  assert.match(pageHook, /if \(readonly \|\| !viewRef\.current\) return null/);
  assert.match(coverHook, /if \(readonly \|\| !coverRef\.current\) return/);
  assert.match(pageHook, /canUndo: !readonly && Boolean\(view\) && history\.canUndo/);
});

test("22. reload starts from an empty session history", () => {
  const fresh = createHistorySession();
  assert.equal(fresh.undo.length, 0);
  assert.equal(fresh.redo.length, 0);
  assert.match(historyHook, /createHistorySession\(\)/);
  assert.equal(historyHook.includes("localStorage"), false);
  assert.equal(historySource.includes("album_draft"), false);
});

test("23. undo saves through the newest client sequence", () => {
  assert.match(pageHook, /const nextSeq = bump\(spreadId, spread\.source\.clientSeq\)/);
  assert.match(pageHook, /overrideSpreadLayout\(spreadId, revision, nextSeq, layoutId\)/);
  assert.match(pageHook, /overrideFrameCrop\(frameId, revision, nextSeq, crop\)/);
  assert.match(coverHook, /overrideCover\(current\.id, revision, nextSeq, field, value\)/);
  assert.equal(decideWrite({ storedRevision: 2, storedSeq: 5, expectedRevision: 2, clientSeq: 6 }), "applied");
  assert.equal(pageHook.includes("save_album_draft_version"), false);
});

test("24. history apply does not rewrite AI state", () => {
  const laid = applySpreadLayout(view(), "spread-3", null, 2);
  assert.equal(laid.spreads[1].source.aiLayoutId, "L01");
  const cropped = applyFrameCrop(view(), "frame-1", null, 2);
  assert.equal(cropped.spreads[0].sourceFrames[0].aiCropX, 0.43);
  const titled = applyCoverTitle(coverModel(), null, 2);
  assert.equal(titled.source.aiTitle, "7月の思い出");
  assert.equal(historySource.includes("aiLayoutId"), false);
  assert.equal(historySource.includes("ai_title"), false);
});

test("25. undo does not call Vision", () => {
  const sources = [historySource, historyHook, pageHook, coverHook, pageScreen, coverScreen, spreadView, controls].join("\n");
  assert.equal(/openai|analyzePhotoIntelligence|generatePetAlbum|prepareGroupingPhoto|responses\.create/.test(sources), false);
  assert.match(spreadView, /onCropStart/);
  assert.match(spreadView, /onCropEnd/);
  assert.match(pageScreen, /revealSpread/);
  assert.match(controls, /tag === "INPUT"/);
  assert.match(controls, /data-testid="editor-undo"/);
  assert.match(coverScreen, /EditorHistoryControls/);
});
