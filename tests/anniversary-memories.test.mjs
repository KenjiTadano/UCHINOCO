import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { anniversaryEventsToday, growthCompatibility } from "../lib/anniversary-memories.ts";
import { selectUchinocoNowHero } from "../lib/uchinoco-now.ts";

const now = new Date("2026-10-05T03:00:00.000Z");
const pet = { id: "pet-a", name: "Waka", birthday: "2021-10-05", adoption_date: "2022-04-10" };

test("birthday and adoption anniversaries use saved dates only", () => {
  assert.deepEqual(anniversaryEventsToday([pet], now), [{ petId: "pet-a", petName: "Waka", kind: "birthday", years: 5, sourceDate: "2021-10-05" }]);
  assert.deepEqual(anniversaryEventsToday([{ ...pet, birthday: null, adoption_date: "2023-10-05" }], now), [{ petId: "pet-a", petName: "Waka", kind: "adoption", years: 3, sourceDate: "2023-10-05" }]);
  assert.deepEqual(anniversaryEventsToday([{ ...pet, birthday: null, adoption_date: null }], now), []);
});

test("multiple pets keep separate anniversary events", () => {
  const events = anniversaryEventsToday([pet, { id: "pet-b", name: "Mugi", birthday: null, adoption_date: "2024-10-05" }], now);
  assert.deepEqual(events.map((event) => event.petId), ["pet-a", "pet-b"]);
});

test("growth comparison requires stored visibility, quality, and compatible orientation", () => {
  assert.equal(growthCompatibility({ beforeOrientation: "portrait", afterOrientation: "portrait", beforeScore: 78, afterScore: 82, beforePetVisible: true, afterPetVisible: true }), 90);
  assert.equal(growthCompatibility({ beforeOrientation: "portrait", afterOrientation: "landscape", beforeScore: 78, afterScore: 82, beforePetVisible: true, afterPetVisible: true }), null);
  assert.equal(growthCompatibility({ beforeOrientation: "portrait", afterOrientation: "portrait", beforeScore: 40, afterScore: 82, beforePetVisible: true, afterPetVisible: true }), null);
  assert.equal(growthCompatibility({ beforeOrientation: "portrait", afterOrientation: "portrait", beforeScore: 78, afterScore: 82, beforePetVisible: false, afterPetVisible: true }), null);
});

test("anniversary remains NOW priority one and shows exact adoption years", () => {
  const hero = selectUchinocoNowHero({
    selectedPet: { id: "pet-a", name: "Waka" }, pets: [{ id: "pet-a", name: "Waka" }],
    anniversary: { petId: "pet-a", petName: "Waka", kind: "adoption", years: 3 },
    readyAlbum: { id: "album", petId: "pet-a", title: "Album", status: "ready" }, passiveCandidate: null,
    albumProgress: null, familyActivity: null, todayBestShot: null, todayLatestPhoto: null, fallbackPhoto: null,
    onThisDay: null, capturePromptAvailable: true, addPhotoHref: "/add", memoriesHref: "/memories",
  });
  assert.equal(hero?.priority, 1);
  assert.equal(hero?.title, "Wakaを迎えて3年。");
  assert.equal(hero?.cta.href, "/pets/pet-a/anniversary");
});

test("implementation uses bounded exact-day queries, pet scope, stored analysis, and no Vision call", async () => {
  const source = await readFile(new URL("../lib/anniversary-memories.ts", import.meta.url), "utf8");
  assert.match(source, /selectedPetIds/);
  assert.match(source, /tokyoRange\(today\.year - yearsAgo, today\.month, today\.day\)/);
  assert.match(source, /loadPhotosInRange\([^;]+, 6\)/s);
  assert.match(source, /photo_analysis_results/);
  assert.match(source, /PHOTO_INTELLIGENCE_SEMANTIC/);
  assert.match(source, /SUBJECT_GEOMETRY/);
  assert.doesNotMatch(source, /openai|responses\.create|analyzePhoto/i);
});

test("annual candidate reuses saved birthday and adoption metadata without changing existing albums", async () => {
  const source = await readFile(new URL("../lib/passive-annual-candidate-server.ts", import.meta.url), "utf8");
  assert.match(source, /select\("birthday, adoption_date"\)/);
  assert.match(source, /kind: "birthday"/);
  assert.match(source, /kind: "adoption"/);
});

test("anniversary page keeps signed private delivery and existing album flow", async () => {
  const source = await readFile(new URL("../app/(app)/pets/[petId]/anniversary/page.tsx", import.meta.url), "utf8");
  assert.match(source, /createListImageUrls/);
  assert.match(source, /album\/new/);
  assert.doesNotMatch(source, /getPublicUrl|createSignedUrl\(/);
  assert.doesNotMatch(source, /analytics|petName.*event_data|photo.*event_data/i);
});
