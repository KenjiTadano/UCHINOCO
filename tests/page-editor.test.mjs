import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { applyFrameCrop, applyFramePhoto, applyPreviewUrls, applySpreadLayout, assembleEditorSpread, clientSeqOf, editorIsReadonly, editorPhotoIds, EDITOR_MISSING_DRAFT_MESSAGE, EDITOR_ORDERED_MESSAGE, layoutChoices, mergeServerDraft, originalSignedObjectPath, presentSaveError, toAlbumEditorSpread } from "../lib/album-persistence/editor.ts";
import { decideWrite } from "../lib/album-persistence/resolve.ts";
import { digitalFrameRect, digitalSpreadGeometry } from "../lib/album-draft/pages.ts";
import { ALBUM_DRAFT_CONFIG } from "../lib/album-draft/config.ts";
import { ALBUM_PRINT_SPEC } from "../lib/album-print/print-spec.ts";

const migration = await readFile("./supabase/migrations/20260927120000_album_draft_persistence.sql", "utf8");
const page = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page.tsx", "utf8");
const screen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page-edit-screen.tsx", "utf8");
const hook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/use-page-edit-draft.ts", "utf8");
const service = await readFile("./app/(app)/album-draft-service.ts", "utf8");
const reader = await readFile("./lib/album-persistence/read-draft.ts", "utf8");
const editorSource = await readFile("./lib/album-persistence/editor.ts", "utf8");
const viewSource = await readFile("./app/(app)/pets/[petId]/album/_components/draft-spread-view.tsx", "utf8");
const printPreviewSource = await readFile("./app/(app)/pets/[petId]/album/[albumId]/print/print-preview-screen.tsx", "utf8");

test("digital spread geometry uses the existing page rectangles and print aspect ratio", () => {
  const geometry = digitalSpreadGeometry();
  const left = digitalFrameRect(ALBUM_DRAFT_CONFIG.book.left);
  const right = digitalFrameRect(ALBUM_DRAFT_CONFIG.book.right);
  assert.equal(left.x, 0);
  assert.equal(left.y, 0);
  assert.equal(left.w + right.w < 1, true);
  assert.equal(right.x > left.x + left.w, true);
  assert.equal(geometry.aspectRatio, geometry.width / geometry.height);
  assert.ok(Math.abs(ALBUM_DRAFT_CONFIG.book.left.w / ALBUM_DRAFT_CONFIG.book.left.h - ALBUM_PRINT_SPEC.pageAspectRatio) < 1e-9);
  assert.ok(Math.abs(ALBUM_DRAFT_CONFIG.book.right.w / ALBUM_DRAFT_CONFIG.book.right.h - ALBUM_PRINT_SPEC.pageAspectRatio) < 1e-9);
});

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
    ["photo-c", "https://example.test/c.jpg"],
    ["photo-d", "https://example.test/d.jpg"],
  ]);
  const first = spread("spread-1", 0, "L02");
  const second = spread("spread-2", 1, "L02");
  const third = spread("spread-3", 2, "L01");
  return {
    albumId: "album-1",
    versionId: "version-1",
    status: "ready",
    revision: 1,
    signature: "sig",
    previewUrls: Object.fromEntries(urls),
    spreads: [
      assembleEditorSpread(first, [frame("frame-1", first.id, 0, "L02-a", "primary", "photo-a", { x: 0.43, y: 0.43, scale: 1.15 }), frame("frame-2", first.id, 1, "L02-b", "secondary", "photo-b", { x: 0.45, y: 0.46, scale: 1.1 })], urls),
      assembleEditorSpread(second, [frame("frame-3", second.id, 0, "L02-a", "primary", "photo-c", { x: 0.45, y: 0.45, scale: 1.1 }), frame("frame-4", second.id, 1, "L02-b", "hero", "photo-d", { x: 0.49, y: 0.45, scale: 1.1 })], urls),
      assembleEditorSpread(third, [frame("frame-5", third.id, 0, "L01-hero", "hero", "photo-a", { x: 0.5, y: 0.37, scale: 1 })], urls),
    ],
  };
}

test("1. load active draft reads the saved version and does not create one", () => {
  assert.match(reader, /album_draft_versions/);
  assert.match(reader, /is_active/);
  assert.match(reader, /order\("position"/);
  assert.match(service, /loadActiveDraft/);
  const loadActive = service.slice(service.indexOf("export async function loadActiveDraft"), service.indexOf("export async function refreshDraftPhotoUrls"));
  assert.equal(loadActive.includes("save_album_draft_version"), false);
  assert.equal(loadActive.includes(".insert("), false);
  assert.match(page, /readDraft\(supabase, albumId\)/);
  assert.equal(page.includes("buildAlbumEditSpreads"), false);
});

test("2. effective layout comes from the resolver", () => {
  const editor = toAlbumEditorSpread(view().spreads[2], view().previewUrls);
  assert.equal(editor.layoutId, "L01");
  assert.equal(editor.layoutOverridden, false);
  assert.match(editorSource, /resolveEffectiveSpread/);
  assert.equal(editorSource.includes("userLayoutId ??"), false);
});

test("3. effective photo comes from the resolver", () => {
  const editor = toAlbumEditorSpread(view().spreads[0], view().previewUrls);
  assert.deepEqual(
    editor.frames.map((item) => item.photoId),
    ["photo-a", "photo-b"],
  );
  assert.equal(
    editor.frames.every((item) => item.photoOverridden === false),
    true,
  );
  assert.match(editorSource, /resolveEffectiveFrame/);
});

test("4. effective crop comes from the resolver", () => {
  const editor = toAlbumEditorSpread(view().spreads[2], view().previewUrls);
  assert.deepEqual(editor.frames[0].crop, { x: 0.5, y: 0.37, scale: 1 });
  assert.equal(editor.frames[0].cropOverridden, false);
});

test("5. layout override keeps the AI layout and shows the user layout", () => {
  const next = applySpreadLayout(view(), "spread-3", "L01b", 1);
  const editor = toAlbumEditorSpread(next.spreads[2], next.previewUrls);
  assert.equal(editor.layoutId, "L01b");
  assert.equal(editor.layoutOverridden, true);
  assert.equal(next.spreads[2].source.aiLayoutId, "L01");
  assert.equal(next.spreads[2].preview.layoutId, "L01b");
  assert.deepEqual(
    layoutChoices(1, "L01").map((item) => item.id),
    ["L01", "L01b", "P1_FULL_BLEED", "P1_CENTER_LANDSCAPE", "P1_CAPTION_BOTTOM", "P1_SIDE_TEXT"],
  );
});

test("ranked picker shows the scored AI top four before the full catalog", () => {
  const catalog = layoutChoices(5, "L13").map((item) => item.id);
  const rankedIds = [catalog[2], catalog[0], catalog[3], catalog[1]];
  const candidate = (layoutId, score) => ({
    layoutId,
    score,
    layoutScore: score,
    finalScore: score - 2,
    tier: "STRICT",
    matchTier: "STRICT",
    composition: "hero",
    orientationFit: 3,
    heroFit: 2,
    captionFit: 1,
    storyFit: 3,
    debugReasons: [],
  });
  const choices = layoutChoices(5, "L13", {
    selectedLayout: candidate(rankedIds[0], 91),
    alternatives: [candidate(rankedIds[1], 84), candidate(rankedIds[2], 72), candidate(rankedIds[3], 63)],
  });
  assert.deepEqual(
    choices.slice(0, 4).map((item) => item.id),
    rankedIds,
  );
  assert.deepEqual(
    choices.slice(0, 4).map((item) => item.aiScore),
    [91, 84, 72, 63],
  );
  assert.deepEqual(
    choices.slice(0, 4).map((item) => item.aiRank),
    [0, 1, 2, 3],
  );
  assert.equal(choices[0].recommended, true);
  assert.equal(choices[0].id === "L13", false);
  assert.ok(choices.length > 4);
  assert.match(screen, /AIおすすめ/);
  assert.match(screen, /AI次点候補/);
  assert.match(screen, /AI次々点/);
  assert.match(screen, /AI第4候補/);
});

test("picker contains draft-only same-count hierarchy layouts for two-photo spreads", () => {
  const legacy = layoutChoices(2, "L02").map((item) => item.id);
  assert.ok(legacy.includes("L12"));
  assert.ok(legacy.includes("L12b"));
  const ranked = layoutChoices(2, "L02", {
    selectedLayout: { layoutId: "L12", score: 90, layoutScore: 90, finalScore: 86, tier: "STRICT", matchTier: "STRICT", composition: "story", orientationFit: 3, heroFit: 3, captionFit: 0, storyFit: 3, debugReasons: [] },
    alternatives: [{ layoutId: "L12b", score: 82, layoutScore: 82, finalScore: 80, tier: "STRICT", matchTier: "STRICT", composition: "story", orientationFit: 1, heroFit: 3, captionFit: 0, storyFit: 3, debugReasons: [] }],
  });
  assert.deepEqual(
    ranked.slice(0, 2).map((item) => item.id),
    ["L12", "L12b"],
  );
});

test("legacy picker has no fabricated AI scores and keeps current layout first", () => {
  const stable = layoutChoices(5, "missing").map((item) => item.id);
  const legacy = layoutChoices(5, "L14");
  assert.deepEqual(
    legacy.map((item) => item.id),
    ["L14", ...stable.filter((id) => id !== "L14")],
  );
  assert.equal(legacy[0].aiRank, null);
  assert.equal(legacy[0].aiScore, null);
  assert.equal(legacy[0].recommended, false);
});

test("picker does not promote a next-best candidate when the AI best is unavailable", () => {
  const ranking = {
    selectedLayout: { layoutId: "removed-template", score: 91, layoutScore: 91, finalScore: 88, tier: "STRICT", matchTier: "STRICT", composition: "hero", orientationFit: 3, heroFit: 3, captionFit: 0, storyFit: 3, debugReasons: [] },
    alternatives: [{ layoutId: "L14", score: 84, layoutScore: 84, finalScore: 82, tier: "STRICT", matchTier: "STRICT", composition: "grid", orientationFit: 1, heroFit: 0, captionFit: 0, storyFit: 1, debugReasons: [] }],
  };
  const choices = layoutChoices(5, "L13", ranking);
  assert.equal(choices[0].id, "L13");
  assert.equal(choices[0].aiRank, null);
  assert.equal(choices.find((item) => item.id === "L14")?.recommended, false);
});

test("6. layout reset returns the AI layout", () => {
  const overridden = applySpreadLayout(view(), "spread-3", "L01b", 1);
  const reset = applySpreadLayout(overridden, "spread-3", null, 2);
  const editor = toAlbumEditorSpread(reset.spreads[2], reset.previewUrls);
  assert.equal(editor.layoutId, "L01");
  assert.equal(editor.layoutOverridden, false);
  assert.equal(reset.spreads[2].source.userLayoutId, null);
  assert.equal(reset.spreads[2].source.aiLayoutId, "L01");
});

test("7. crop override stores user crop and leaves AI crop", () => {
  const next = applyFrameCrop(view(), "frame-3", { x: 0.2, y: 0.8, scale: 1.6 }, 4);
  const source = next.spreads[1].sourceFrames[0];
  const editor = toAlbumEditorSpread(next.spreads[1], next.previewUrls);
  assert.deepEqual(editor.frames[0].crop, { x: 0.2, y: 0.8, scale: 1.6 });
  assert.equal(editor.frames[0].cropOverridden, true);
  assert.equal(source.aiCropX, 0.45);
  assert.equal(source.aiCropY, 0.45);
  assert.equal(source.aiCropScale, 1.1);
});

test("8. crop reset returns the AI crop", () => {
  const overridden = applyFrameCrop(view(), "frame-3", { x: 0.2, y: 0.8, scale: 1.6 }, 4);
  const reset = applyFrameCrop(overridden, "frame-3", null, 5);
  const editor = toAlbumEditorSpread(reset.spreads[1], reset.previewUrls);
  assert.deepEqual(editor.frames[0].crop, { x: 0.45, y: 0.45, scale: 1.1 });
  assert.equal(editor.frames[0].cropOverridden, false);
  assert.equal(reset.spreads[1].sourceFrames[0].userCropX, null);
});

test("9. photo override keeps the frame role", () => {
  const next = applyFramePhoto(view(), "frame-4", "photo-b", 2, "https://example.test/b.jpg");
  const source = next.spreads[1].sourceFrames[1];
  const editor = toAlbumEditorSpread(next.spreads[1], next.previewUrls);
  assert.equal(editor.frames[1].photoId, "photo-b");
  assert.equal(editor.frames[1].photoOverridden, true);
  assert.equal(editor.frames[1].role, "hero");
  assert.equal(source.role, "hero");
  assert.equal(source.aiPhotoId, "photo-d");
});

test("10. photo reset returns the AI photo", () => {
  const overridden = applyFramePhoto(view(), "frame-4", "photo-b", 2, "https://example.test/b.jpg");
  const reset = applyFramePhoto(overridden, "frame-4", null, 3);
  const editor = toAlbumEditorSpread(reset.spreads[1], reset.previewUrls);
  assert.equal(editor.frames[1].photoId, "photo-d");
  assert.equal(editor.frames[1].photoOverridden, false);
  assert.equal(editor.frames[1].role, "hero");
});

test("11. autosave stale rejection keeps the newer edit", () => {
  const local = applyFrameCrop(view(), "frame-3", { x: 0.15, y: 0.2, scale: 1.8 }, 3);
  const older = applyFrameCrop(view(), "frame-3", { x: 0.9, y: 0.9, scale: 1.2 }, 1);
  assert.equal(mergeServerDraft(local, older, 1, "frame-3"), local);
  assert.equal(clientSeqOf(local, "frame-3"), 3);
  assert.equal(decideWrite({ storedRevision: 2, storedSeq: 3, expectedRevision: 1, clientSeq: 1 }), "stale");
  assert.match(hook, /AUTOSAVE_DEBOUNCE_MS/);
  assert.match(service, /p_client_seq: clientSeq/);
});

test("12. reload restoration reads the overridden source", () => {
  const overridden = applySpreadLayout(view(), "spread-3", "L01b", 1);
  const cropped = applyFrameCrop(overridden, "frame-5", { x: 0.25, y: 0.3, scale: 1.4 }, 2);
  const stored = cropped.spreads[2];
  const reloaded = assembleEditorSpread(stored.source, stored.sourceFrames, new Map(Object.entries(cropped.previewUrls)));
  const editor = toAlbumEditorSpread(reloaded, cropped.previewUrls);
  assert.equal(editor.layoutId, "L01b");
  assert.deepEqual(editor.frames[0].crop, { x: 0.25, y: 0.3, scale: 1.4 });
  assert.equal(editorPhotoIds(cropped).length, 4);
});

test("13. ordered album is readonly without treating the UI as the only guard", () => {
  assert.equal(editorIsReadonly("ordered"), true);
  assert.equal(editorIsReadonly("draft"), false);
  assert.match(page, /readonly=\{editorIsReadonly\(album\.status\)\}/);
  assert.equal(page.includes("redirect(`/pets/${petId}/album/${albumId}`)"), false);
  assert.match(screen, /data-readonly/);
  assert.match(screen, /disabled=\{readonly\}/);
});

test("14. ordered DB rejection stays in the draft guard", () => {
  assert.match(migration, /このアルバムは注文済みのため変更できません/);
  assert.match(service, /apply_draft_spread_layout/);
  assert.match(service, /apply_draft_frame_override/);
  assert.equal(presentSaveError("このアルバムは注文済みのため変更できません。"), EDITOR_ORDERED_MESSAGE);
  assert.match(screen, /注文済みのため編集できません/);
});

test("15. missing draft does not create an empty draft", () => {
  assert.match(service, /EDITOR_MISSING_DRAFT_MESSAGE/);
  assert.equal(service.includes("save_album_draft_version"), false);
  assert.match(page, /EDITOR_MISSING_DRAFT_MESSAGE/);
  assert.match(screen, /初稿を作成する/);
  assert.equal(EDITOR_MISSING_DRAFT_MESSAGE.includes("初稿"), true);
});

test("16. cross-owner photo replacement is denied on the server", () => {
  assert.match(service, /uploader_user_id/);
  assert.match(service, /photo\.pet_id !== album\.pet_id/);
  assert.match(migration, /この写真はこのアルバムに使えません/);
  assert.match(migration, /p\.uploader_user_id = v_owner/);
});

test("17. AI state stays unchanged by an editor override", () => {
  const next = applyFrameCrop(applySpreadLayout(view(), "spread-1", "L03", 1), "frame-1", { x: 0.1, y: 0.2, scale: 1.3 }, 2);
  const sourceSpread = next.spreads[0].source;
  const sourceFrame = next.spreads[0].sourceFrames[0];
  assert.equal(sourceSpread.aiLayoutId, "L02");
  assert.equal(sourceFrame.aiPhotoId, "photo-a");
  assert.equal(sourceFrame.aiCropX, 0.43);
  assert.match(migration, /AI Stateは変更できません/);
});

test("18. editor load does not call Vision or regenerate the album", () => {
  const sources = [page, screen, hook, service, reader, editorSource, viewSource].join("\n");
  assert.equal(/openai|analyzePhotoIntelligence|generatePetAlbum|prepareGroupingPhoto|responses\.create/.test(sources), false);
  assert.match(reader, /createPhotoPreviewUrls/);
  assert.doesNotMatch(reader, /from\("pet-photos"\)/);
  assert.match(service, /refreshDraftPhotoUrls/);
});

test("19. frame preview uses the original object and the picker uses the thumbnail", () => {
  const url = "https://example.supabase.co/storage/v1/object/sign/pet-photos/pets/a.jpg?token=abc";
  assert.equal(originalSignedObjectPath(url), "pets/a.jpg");
  assert.equal(originalSignedObjectPath("https://example.supabase.co/storage/v1/object/sign/pet-photo-thumbnails/pets/a.jpg?token=abc"), "");
  assert.match(screen, /knownOriginal \|\| candidate\.src/);
  assert.match(screen, /src=\{candidate\.thumb\}/);
  assert.match(viewSource, /data-image-kind=\{originalPath \? "original" : "preview"\}/);
  assert.match(viewSource, /originalSignedObjectPath\(src\)/);
  assert.match(service, /pet-photo-thumbnails|createListImageUrls/);
});

test("20. Digital Editor uses page surfaces and the existing crop history", () => {
  assert.match(screen, /digital/);
  assert.match(screen, /selectedFrameId/);
  assert.match(screen, /setSelectedFrameId\(frameId\)/);
  assert.match(screen, /page-edit-crop-toolbar/);
  assert.match(screen, /draft\.setCrop\(selectedFrame\.id/);
  assert.match(screen, /draft\.resetCrop\(selectedFrame\.id\)/);
  assert.match(screen, /<EditorHistoryControls/);
  assert.match(screen, /draft\.beginCrop\(selectedFrame\.id\)/);
  assert.match(screen, /onPointerUp=\{draft\.endCrop\}/);
  assert.match(viewSource, /digital \? \(/);
  assert.match(viewSource, /page-edit-digital-page/);
  assert.match(viewSource, /page-edit-draft-blank/);
  assert.match(viewSource, /data-selected=/);
});

test("21. crop drag keeps pointer events captured by its frame", () => {
  assert.match(viewSource, /pointerId: number/);
  assert.match(viewSource, /hit\.slot\.setPointerCapture\(event\.pointerId\)/);
  assert.match(viewSource, /drag\.pointerId !== event\.pointerId/);
});

test("22. free page elements share editor history, selection, manipulation, and draft persistence", async () => {
  const elementMigration = await readFile("./supabase/migrations/20261001120000_album_draft_page_elements.sql", "utf8");
  assert.match(screen, /data-testid="page-edit-add-text"/);
  assert.match(screen, /data-testid="page-edit-add-stamp"/);
  assert.match(screen, /data-testid="page-edit-add-decoration"/);
  assert.match(screen, /data-testid="page-edit-change-background"/);
  assert.match(screen, /data-testid="page-edit-element-duplicate"/);
  assert.match(screen, /data-testid="page-edit-element-delete"/);
  assert.match(screen, /draft\.beginPageElementGesture/);
  assert.match(screen, /draft\.setPageElement/);
  assert.match(screen, /suggestSpreadCaption/);
  assert.match(viewSource, /data-page-element-id/);
  assert.match(viewSource, /data-element-handle="resize"/);
  assert.match(viewSource, /data-element-handle="rotate"/);
  assert.match(viewSource, /snapPageElement/);
  assert.match(hook, /field: "element"/);
  assert.match(hook, /field: "background"/);
  assert.match(hook, /overridePageElement/);
  assert.match(hook, /overrideSpreadBackground/);
  assert.match(reader, /album_draft_page_elements/);
  assert.match(reader, /album_draft_spread_backgrounds/);
  assert.match(elementMigration, /is_deleted boolean not null/);
  assert.match(printPreviewSource, /elements=\{spread\.elements\}/);
  assert.match(printPreviewSource, /backgrounds=\{spread\.backgrounds\}/);
  assert.match(printPreviewSource, /digital/);
});

test("Task059 recommendations preview first, preserve user elements, and share Undo/Redo", () => {
  assert.match(screen, /data-testid="page-edit-decoration-recommendation"/);
  assert.match(screen, /data-testid="page-edit-decoration-recommendations"/);
  assert.match(screen, /data-testid="page-edit-recommendation-keep"/);
  assert.match(screen, /data-testid="page-edit-recommendation-apply"/);
  assert.match(screen, /data-testid="page-edit-clear-ai-decorations"/);
  assert.ok(screen.includes('interactive={!readonly && addPanel !== "recommendation"}'));
  assert.ok(screen.includes('interactiveElements={!readonly && addPanel !== "recommendation"}'));
  assert.match(screen, /draft\.applyDecorationRecommendation/);
  assert.match(screen, /draft\.clearAIRecommendations/);
  assert.match(hook, /userElements\.length > 0 \|\| hasUserPolish \|\| hasManualBackground/);
  assert.match(hook, /field: "recommendation"/);
  assert.match(hook, /recommendationBackgroundsBefore/);
  assert.match(hook, /recommendationId: undefined/);
});

test("23. first, middle, and last spread elements survive every derived spread rebuild", () => {
  const base = view();
  const types = ["text", "stamp", "decoration"];
  const populated = {
    ...base,
    spreads: base.spreads.map((spreadView, index) => {
      const common = { x: index === 1 ? 0.58 : 0.12, y: 0.16, width: 0.22, height: 0.08, rotation: 0, zIndex: index, printTarget: "print", revision: 2, clientSeq: 3, colorId: "ink" };
      const type = types[index];
      const element = type === "text" ? { ...common, id: `element-${index}`, type, text: `spread ${index}`, fontId: "minimal", fontSize: 16, bold: false, align: "left" } : type === "stamp" ? { ...common, id: `element-${index}`, type, stampId: "paw" } : { ...common, id: `element-${index}`, type, decorationId: "line" };
      const extra = index === 1 ? [{ ...common, id: "element-middle-extra", type: "text", text: "middle extra", fontId: "warm", fontSize: 14, bold: false, align: "right" }] : [];
      return assembleEditorSpread(spreadView.source, spreadView.sourceFrames, new Map(Object.entries(base.previewUrls)), spreadView.texts, spreadView.decorations, [element, ...extra], { left: { backgroundId: "sage", revision: 1, clientSeq: 1 }, right: { backgroundId: "rose", revision: 1, clientSeq: 1 } });
    }),
  };

  const assertPreserved = (candidate) => {
    assert.deepEqual(
      candidate.spreads.map((item) => item.elements.map((element) => element.id)),
      [["element-0"], ["element-1", "element-middle-extra"], ["element-2"]],
    );
    assert.equal(
      candidate.spreads.every((item) => item.backgrounds.left.backgroundId === "sage" && item.backgrounds.right.backgroundId === "rose"),
      true,
    );
  };

  assertPreserved(populated);
  assertPreserved(applyPreviewUrls(populated, { "photo-c": "https://example.test/c-refreshed.jpg" }));
  assertPreserved(applySpreadLayout(populated, "spread-1", "P2_MIXED_PAIR", 4));
  assertPreserved(applyFrameCrop(populated, "frame-3", { x: 0.4, y: 0.6, scale: 1.2 }, 4));
  assertPreserved(applyFramePhoto(populated, "frame-5", "photo-b", 4));

  const reloaded = {
    ...populated,
    spreads: populated.spreads.map((item) => assembleEditorSpread(item.source, item.sourceFrames, new Map(Object.entries(populated.previewUrls)), item.texts, item.decorations, item.elements, item.backgrounds)),
  };
  assertPreserved(reloaded);
});
