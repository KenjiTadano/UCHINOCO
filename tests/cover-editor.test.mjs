import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { applyCoverColor, applyCoverPhoto, applyCoverSubtitle, applyCoverTemplate, applyCoverTitle, mergeServerCover, resolveEffectiveCover, toCoverEditor } from "../lib/album-persistence/cover.ts";
import { decideWrite } from "../lib/album-persistence/resolve.ts";
import { formatAlbumPeriodLabels } from "../lib/album-cover-title.ts";

const migration = await readFile("./supabase/migrations/20260928150000_album_draft_covers.sql", "utf8");
const page = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/page.tsx", "utf8");
const screen = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/cover-edit-screen.tsx", "utf8");
const book = await readFile("./app/(app)/pets/[petId]/album/_components/album-cover-book.tsx", "utf8");
const hook = await readFile("./app/(app)/pets/[petId]/album/[albumId]/cover/edit/use-cover-edit-draft.ts", "utf8");
const service = await readFile("./app/(app)/album-draft-service.ts", "utf8");
const oldDraft = await readFile("./supabase/migrations/20260927120000_album_draft_persistence.sql", "utf8");

function row(patch = {}) {
  return {
    id: "cover-1",
    draftVersionId: "version-1",
    coverType: "front",
    aiPhotoId: "photo-a",
    userPhotoId: null,
    aiTitle: "9月の思い出",
    userTitle: null,
    aiSubtitle: "わかの",
    userSubtitle: null,
    aiTemplateId: "simple",
    userTemplateId: null,
    aiColorId: "white",
    userColorId: null,
    revision: 1,
    clientSeq: 0,
    ...patch,
  };
}

function model(patch = {}, urls = { "photo-a": "https://cdn.test/object/sign/pet-photos/a.jpg", "photo-b": "https://cdn.test/object/sign/pet-photos/b.jpg" }) {
  return toCoverEditor(row(patch), urls);
}

test("load cover uses the saved draft and does not regenerate", () => {
  assert.match(page, /loadCoverEditor/);
  assert.doesNotMatch(page, /generatePetAlbum|photo_ai_analyses|openai/);
  assert.match(service, /album_draft_covers/);
  assert.match(service, /23505/);
  assert.doesNotMatch(screen, /onPointer|onWheel|user_crop/);
});

test("effective photo falls back to the AI photo", () => {
  assert.equal(resolveEffectiveCover(row()).photoId, "photo-a");
  assert.equal(resolveEffectiveCover(row()).photoOverridden, false);
});

test("effective title and subtitle fall back per field", () => {
  const effective = resolveEffectiveCover(row({ userTitle: "夏の午後", userSubtitle: null }));
  assert.equal(effective.title, "夏の午後");
  assert.equal(effective.subtitle, "わかの");
  assert.equal(effective.titleOverridden, true);
  assert.equal(effective.subtitleOverridden, false);
});

test("effective template and color fall back to the AI design", () => {
  const effective = resolveEffectiveCover(row());
  assert.equal(effective.templateId, "simple");
  assert.equal(effective.colorId, "white");
  assert.equal(effective.templateOverridden, false);
  assert.equal(effective.colorOverridden, false);
});

test("photo override replaces the preview with the original url", () => {
  const next = applyCoverPhoto(model(), "photo-b", 2, "https://cdn.test/object/sign/pet-photos/b.jpg");
  assert.equal(next.photoId, "photo-b");
  assert.equal(next.photoOverridden, true);
  assert.equal(next.previewUrl, "https://cdn.test/object/sign/pet-photos/b.jpg");
  assert.equal(next.source.aiPhotoId, "photo-a");
});

test("photo reset returns the AI photo", () => {
  const overridden = applyCoverPhoto(model(), "photo-b", 2, "https://cdn.test/object/sign/pet-photos/b.jpg");
  const reset = applyCoverPhoto(overridden, null, 3);
  assert.equal(reset.photoId, "photo-a");
  assert.equal(reset.photoOverridden, false);
  assert.equal(reset.source.userPhotoId, null);
});

test("title override and reset", () => {
  const overridden = applyCoverTitle(model(), "海の日", 2);
  assert.equal(overridden.title, "海の日");
  assert.equal(overridden.source.aiTitle, "9月の思い出");
  const reset = applyCoverTitle(overridden, null, 3);
  assert.equal(reset.title, "9月の思い出");
  assert.equal(reset.titleOverridden, false);
});

test("subtitle, template, and color overrides keep AI columns", () => {
  let next = applyCoverSubtitle(model(), "午後の", 2);
  next = applyCoverTemplate(next, "polaroid", 3);
  next = applyCoverColor(next, "pink", 4);
  assert.equal(next.subtitle, "午後の");
  assert.equal(next.templateId, "polaroid");
  assert.equal(next.colorId, "pink");
  assert.equal(next.source.aiTemplateId, "simple");
  assert.equal(next.source.aiColorId, "white");
});

test("title race keeps only the latest sequence", () => {
  const first = applyCoverTitle(model(), "abc", 2);
  const second = applyCoverTitle(first, "abcd", 3);
  const third = applyCoverTitle(second, "abcde", 4);
  const stale = model({ userTitle: "abc", clientSeq: 2, revision: 2 });
  assert.equal(mergeServerCover(third, stale, 2).title, "abcde");
  assert.equal(mergeServerCover(third, third, 4).title, "abcde");
  assert.equal(decideWrite({ storedRevision: 1, storedSeq: 4, expectedRevision: 1, clientSeq: 3 }), "stale");
  assert.equal(decideWrite({ storedRevision: 1, storedSeq: 3, expectedRevision: 9, clientSeq: 4 }), "applied");
});

test("cover autosave reuses the page debounce and sequence", () => {
  assert.match(hook, /AUTOSAVE_DEBOUNCE_MS/);
  assert.match(hook, /overrideCover/);
  assert.match(hook, /setTitle/);
  assert.match(hook, /presentSaveError/);
  assert.doesNotMatch(hook, /setTimeout\(send, 300\)|setTimeout\(send, 1000\)/);
});

test("AI cover columns are immutable", () => {
  assert.match(migration, /AI Stateは変更できません/);
  assert.match(migration, /new\.ai_photo_id is distinct from old\.ai_photo_id/);
  assert.match(migration, /new\.ai_title is distinct from old\.ai_title/);
  assert.match(migration, /new\.ai_template_id is distinct from old\.ai_template_id/);
});

test("ordered albums cannot change the cover", () => {
  assert.match(migration, /このアルバムは注文済みのため変更できません/);
  assert.match(migration, /v_album_status = 'ordered'/);
  assert.match(screen, /注文済みのため編集できません/);
  assert.match(page, /editorIsReadonly/);
  assert.doesNotMatch(page, /status === "ordered"/);
});

test("cover rows are owner scoped", () => {
  assert.match(migration, /album_draft_covers: owner select/);
  assert.match(migration, /album_draft_covers: owner insert/);
  assert.match(migration, /album_draft_covers: owner update/);
  assert.match(migration, /a\.owner_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /for delete/);
});

test("another owner's photo cannot become the cover", () => {
  assert.match(migration, /この写真はこのアルバムに使えません/);
  assert.match(migration, /p\.uploader_user_id = v_owner/);
  assert.match(service, /この写真はこのアルバムに使えません。/);
});

test("cover writes do not change page draft frames", () => {
  assert.doesNotMatch(migration, /update public\.album_draft_frames/);
  assert.doesNotMatch(migration, /update public\.album_draft_spreads/);
  assert.match(oldDraft, /create table public\.album_draft_frames/);
  assert.doesNotMatch(oldDraft, /album_draft_covers/);
});

test("cover editor uses cached preview photos without calling Vision", () => {
  assert.match(page, /signedPreviewUrls/);
  assert.match(service, /signedPreviewUrls/);
  assert.match(screen, /c\.thumb \|\| c\.src/);
  assert.match(screen, /imagePath=\{originalSignedObjectPath/);
  assert.match(book, /data-image-kind/);
  assert.doesNotMatch(page, /createListImageUrls\(supabase, photosForUrls\)/);
});

test("one cover row per draft version and no crop controls", () => {
  assert.match(migration, /draft_version_id uuid not null unique/);
  assert.match(migration, /cover_type text not null default 'front'/);
  assert.doesNotMatch(migration, /user_crop_x/);
  assert.doesNotMatch(screen, /切り抜き/);
});

test("reload keeps the user title when the sequence has landed", () => {
  const local = applyCoverTitle(model(), "abcde", 4);
  const server = model({ userTitle: "abcde", clientSeq: 4, revision: 5 });
  assert.equal(mergeServerCover(local, server, 4).title, "abcde");
  assert.equal(mergeServerCover(local, server, 4).revision, 5);
});

test("empty title is a user override and null is the AI title", () => {
  const cleared = applyCoverTitle(model(), "", 2);
  assert.equal(cleared.title, "");
  assert.equal(cleared.titleOverridden, true);
  assert.equal(resolveEffectiveCover(row({ userTitle: null })).title, "9月の思い出");
});

test("cover period labels include the full album period in Tokyo time", () => {
  assert.deepEqual(formatAlbumPeriodLabels("2026-07-02T00:00:00.000Z", "2026-10-02T00:00:00.000Z"), {
    monthLabel: "7〜10月",
    coverDateLabel: "2026.07-10",
  });
  assert.deepEqual(formatAlbumPeriodLabels("2025-12-15T00:00:00.000Z", "2026-02-15T00:00:00.000Z"), {
    monthLabel: "2025年12月〜2026年2月",
    coverDateLabel: "2025.12-2026.02",
  });
});
