import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  applyFrameCrop,
  applyFramePhoto,
  applySpreadLayout,
  assembleEditorSpread,
  clientSeqOf,
  editorIsReadonly,
  editorPhotoIds,
  EDITOR_MISSING_DRAFT_MESSAGE,
  EDITOR_ORDERED_MESSAGE,
  layoutChoices,
  mergeServerDraft,
  originalSignedObjectPath,
  presentSaveError,
  toAlbumEditorSpread,
} from "../lib/album-persistence/editor.ts";
import { decideWrite } from "../lib/album-persistence/resolve.ts";

const migration = await readFile("./supabase/migrations/20260927120000_album_draft_persistence.sql", "utf8");
const page = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page.tsx", "utf8");
const screen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/page-edit-screen.tsx", "utf8");
const hook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/pages/edit/use-page-edit-draft.ts", "utf8");
const service = await readFile("./app/(app)/album-draft-service.ts", "utf8");
const reader = await readFile("./lib/album-persistence/read-draft.ts", "utf8");
const editorSource = await readFile("./lib/album-persistence/editor.ts", "utf8");
const viewSource = await readFile("./app/(app)/pets/[petId]/album/_components/draft-spread-view.tsx", "utf8");

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
      assembleEditorSpread(first, [
        frame("frame-1", first.id, 0, "L02-a", "primary", "photo-a", { x: 0.43, y: 0.43, scale: 1.15 }),
        frame("frame-2", first.id, 1, "L02-b", "secondary", "photo-b", { x: 0.45, y: 0.46, scale: 1.1 }),
      ], urls),
      assembleEditorSpread(second, [
        frame("frame-3", second.id, 0, "L02-a", "primary", "photo-c", { x: 0.45, y: 0.45, scale: 1.1 }),
        frame("frame-4", second.id, 1, "L02-b", "hero", "photo-d", { x: 0.49, y: 0.45, scale: 1.1 }),
      ], urls),
      assembleEditorSpread(third, [
        frame("frame-5", third.id, 0, "L01-hero", "hero", "photo-a", { x: 0.5, y: 0.37, scale: 1 }),
      ], urls),
    ],
  };
}

test("1. load active draft reads the saved version and does not create one", () => {
  assert.match(reader, /album_draft_versions/);
  assert.match(reader, /is_active/);
  assert.match(reader, /order\("position"/);
  assert.match(service, /loadActiveDraft/);
  const loadActive = service.slice(
    service.indexOf("export async function loadActiveDraft"),
    service.indexOf("export async function refreshDraftPhotoUrls"),
  );
  assert.equal(loadActive.includes("save_album_draft_version"), false);
  assert.equal(loadActive.includes(".insert("), false);
  assert.match(page, /loadActiveDraft\(albumId\)/);
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
  assert.deepEqual(editor.frames.map((item) => item.photoId), ["photo-a", "photo-b"]);
  assert.equal(editor.frames.every((item) => item.photoOverridden === false), true);
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
  assert.deepEqual(layoutChoices(1, "L01").map((item) => item.id), ["L01", "L01b"]);
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
  assert.match(reader, /from\("pet-photos"\)/);
  assert.match(reader, /originalUrlCache/);
  assert.match(service, /refreshDraftPhotoUrls/);
});

test("19. frame preview uses the original object and the picker uses the thumbnail", () => {
  const url = "https://example.supabase.co/storage/v1/object/sign/pet-photos/pets/a.jpg?token=abc";
  assert.equal(originalSignedObjectPath(url), "pets/a.jpg");
  assert.equal(originalSignedObjectPath("https://example.supabase.co/storage/v1/object/sign/pet-photo-thumbnails/pets/a.jpg?token=abc"), "");
  assert.match(screen, /knownOriginal \|\| candidate\.src/);
  assert.match(screen, /src=\{candidate\.thumb\}/);
  assert.match(viewSource, /data-image-kind="original"/);
  assert.match(service, /pet-photo-thumbnails|createListImageUrls/);
});
