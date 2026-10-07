import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectUchinocoNowHero } from "../lib/uchinoco-now.ts";

const pet = { id: "pet-a", name: "むぎ" };
const photo = (id, petId = pet.id) => ({
  id,
  pet_id: petId,
  storage_path: `${petId}/${id}.jpg`,
  thumbnail_path: `${petId}/${id}.webp`,
  taken_at: "2026-10-02T01:00:00.000Z",
  created_at: "2026-10-02T01:00:00.000Z",
  favorite: false,
  caption: null,
});

function context(overrides = {}) {
  return {
    selectedPet: pet,
    pets: [pet],
    anniversary: null,
    readyAlbum: null,
    passiveCandidate: null,
    albumProgress: null,
    familyActivity: null,
    todayBestShot: null,
    todayLatestPhoto: null,
    fallbackPhoto: null,
    onThisDay: null,
    capturePromptAvailable: true,
    addPhotoHref: `/pets/${pet.id}/photos/new`,
    memoriesHref: `/pets/${pet.id}`,
    ...overrides,
  };
}

test("anniversary wins over every lower priority", () => {
  const hero = selectUchinocoNowHero(context({
    anniversary: { petId: pet.id, petName: pet.name, kind: "birthday" },
    readyAlbum: { id: "album", petId: pet.id, title: "10月", status: "ready" },
    familyActivity: { count: 2, href: "/family" },
    todayBestShot: photo("best"),
  }));
  assert.equal(hero?.type, "ANNIVERSARY");
});

test("album ready wins over family and today's shot", () => {
  const hero = selectUchinocoNowHero(context({
    readyAlbum: { id: "album", petId: pet.id, title: "10月", status: "ready" },
    familyActivity: { count: 2, href: "/family" },
    todayBestShot: photo("best"),
  }));
  assert.equal(hero?.type, "ALBUM_READY");
});

test("editing album leads with review and keeps editing optional", () => {
  const hero = selectUchinocoNowHero(context({
    readyAlbum: { id: "album", petId: pet.id, title: "2026年4月のアルバム", status: "editing" },
  }));
  assert.equal(hero?.title, "AIがアルバムをまとめました。");
  assert.equal(hero?.message, "2026年4月のアルバム");
  assert.equal(hero?.cta.label, "アルバムを確認する");
  assert.match(hero?.cta.href ?? "", /\/pets\/pet-a\/album\/album\?view=complete$/);
  assert.equal(hero?.secondary?.label, "少し編集する");
  assert.match(hero?.secondary?.href ?? "", /\/pages\/edit$/);
});

test("ready album copy stays month-neutral", () => {
  const hero = selectUchinocoNowHero(context({
    readyAlbum: { id: "album", petId: pet.id, title: "2026年4月のアルバム", status: "ready" },
  }));
  assert.equal(hero?.title, "アルバムが完成しました。");
  assert.equal(hero?.cta.label, "アルバムを確認する");
});

test("family activity wins over today's shot", () => {
  const hero = selectUchinocoNowHero(context({
    familyActivity: { count: 2, href: "/family" },
    todayBestShot: photo("best"),
  }));
  assert.equal(hero?.type, "FAMILY_NEW");
});

test("stored best shot wins over capture prompt", () => {
  const hero = selectUchinocoNowHero(context({ todayBestShot: photo("best") }));
  assert.equal(hero?.type, "TODAY_BEST_SHOT");
  assert.equal(hero.photo?.id, "best");
});

test("capture prompt wins over on-this-day in normal Home mode", () => {
  const hero = selectUchinocoNowHero(context({
    onThisDay: { photo: photo("past"), yearsAgo: 2 },
  }));
  assert.equal(hero?.type, "TODAY_CAPTURE");
});

test("selection is deterministic for identical input", () => {
  const input = context({ todayLatestPhoto: photo("latest") });
  assert.deepEqual(selectUchinocoNowHero(input), selectUchinocoNowHero(input));
});

test("multi-pet anniversary preserves the matching pet context", () => {
  const second = { id: "pet-b", name: "こむぎ" };
  const hero = selectUchinocoNowHero(context({
    selectedPet: null,
    pets: [pet, second],
    anniversary: { petId: second.id, petName: second.name, kind: "adoption" },
  }));
  assert.equal(hero?.petId, second.id);
  assert.match(hero?.cta.href ?? "", /pet-b/);
});

test("no photo yields a useful capture prompt", () => {
  const hero = selectUchinocoNowHero(context());
  assert.equal(hero?.type, "TODAY_CAPTURE");
  assert.match(hero?.cta.href ?? "", /photos\/new/);
});

test("no album or family safely falls back to today's latest photo", () => {
  const hero = selectUchinocoNowHero(context({ todayLatestPhoto: photo("latest") }));
  assert.equal(hero?.type, "TODAY_BEST_SHOT");
  assert.equal(hero?.photo?.id, "latest");
});

test("on-this-day remains available when capture prompt is intentionally unavailable", () => {
  const hero = selectUchinocoNowHero(context({
    capturePromptAvailable: false,
    onThisDay: { photo: photo("past"), yearsAgo: 3 },
  }));
  assert.equal(hero?.type, "ON_THIS_DAY");
});

test("album progress uses the explicit target and exact remaining count", () => {
  const hero = selectUchinocoNowHero(context({
    albumProgress: { photoCount: 10, target: 12, href: "/album" },
  }));
  assert.equal(hero?.type, "ALBUM_PROGRESS");
  assert.match(hero?.title ?? "", /あと2枚/);
});

test("threshold count alone does not fake candidate ready while analysis is pending", () => {
  const hero = selectUchinocoNowHero(context({
    albumProgress: { photoCount: 12, target: 12, href: "/album", candidateReady: false },
  }));
  assert.equal(hero?.type, "ALBUM_PROGRESS");
  assert.equal(hero?.title, "今月の写真を整理しています。");
  assert.doesNotMatch(hero?.title ?? "", /できています|完成/);
});

test("annual candidate is year-end ready UX and does not become a normal-month message", () => {
  const hero = selectUchinocoNowHero(context({
    annualCandidate: { petId: "pet-a", year: 2026, photoCount: 120, href: "/pets/pet-a/album/year/2026" },
  }));
  assert.equal(hero?.type, "ALBUM_READY");
  assert.match(hero?.title ?? "", /2026年/);
  assert.equal(hero?.cta.label, "1年を振り返る");
  assert.doesNotMatch(hero?.title ?? "", /今月/);
});

test("Home signs thumbnail-preferred paths in a batch", async () => {
  const source = await readFile(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  assert.match(source, /createListImageUrls\(supabase, displayPhotos\)/);
  assert.match(source, /listImagePath\(photo\)/);
  assert.doesNotMatch(source, /createSignedUrl\(/);
});

test("selected-pet Home uses the get_pet_photos_page cursor argument names", async () => {
  const source = await readFile(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");
  assert.match(source, /p_cursor_at:\s*null/);
  assert.match(source, /p_cursor_id:\s*null/);
  assert.doesNotMatch(source, /p_before_sort_at|p_before_id/);
});
