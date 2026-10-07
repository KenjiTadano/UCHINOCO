import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PASSIVE_ALBUM_MIN_PHOTOS,
  isCandidateStale,
  isPassiveCandidateReady,
  passiveCandidateAlbumId,
  passiveCandidateFingerprint,
} from "../lib/passive-album-candidate.ts";
import { selectUchinocoNowHero } from "../lib/uchinoco-now.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const identity = (photos = Array.from({ length: PASSIVE_ALBUM_MIN_PHOTOS }, (_, index) => `photo-${index}`)) => ({
  petIds: ["pet-a"],
  period: { start: "2026-09-30T15:00:00.000Z", end: "2026-10-31T15:00:00.000Z" },
  photoIds: photos,
});

test("threshold未満ではcandidate readyにならない", () => {
  assert.equal(isPassiveCandidateReady(PASSIVE_ALBUM_MIN_PHOTOS - 1, (PASSIVE_ALBUM_MIN_PHOTOS - 1) * 2), false);
  assert.equal(isPassiveCandidateReady(PASSIVE_ALBUM_MIN_PHOTOS, PASSIVE_ALBUM_MIN_PHOTOS * 2), true);
});

test("同じfingerprintは同じcandidateとalbum idを再利用する", () => {
  const left = passiveCandidateFingerprint(identity());
  const right = passiveCandidateFingerprint(identity([...identity().photoIds].reverse()));
  assert.equal(left, right);
  assert.equal(passiveCandidateAlbumId(left), passiveCandidateAlbumId(right));
});

test("写真集合が変わると既存candidateはstaleになる", () => {
  const original = identity();
  const fingerprint = passiveCandidateFingerprint(original);
  assert.equal(isCandidateStale(fingerprint, original), false);
  assert.equal(isCandidateStale(fingerprint, identity([...original.photoIds, "new-photo"])), true);
});

test("Candidate fingerprintは解析・layout・rhythm versionを含む", async () => {
  const implementation = await source("lib/passive-album-candidate.ts");
  assert.match(implementation, /DRAFT_GENERATION_METADATA/);
  assert.match(implementation, /layoutEngine/);
  assert.match(implementation, /album-rhythm-v2/);
});

test("準備は保存済み解析だけを使いVision再解析を開始しない", async () => {
  const server = await source("lib/passive-album-candidate-server.ts");
  const draft = await source("app/(app)/dev/album-draft/actions.ts");
  assert.match(server, /storedOnly: true/);
  assert.match(draft, /storedOnly: options\?\.storedOnly/);
});

test("open時だけ正式Draftをmaterializeし、fingerprint由来IDで二重生成を防ぐ", async () => {
  const action = await source("app/(app)/pets/[petId]/album/candidate/actions.ts");
  assert.match(action, /passiveCandidateAlbumId\(expectedFingerprint\)/);
  assert.match(action, /passive_candidate_fingerprint/);
  assert.match(action, /materialize_passive_album_candidate/);
  assert.match(action, /status === "editing"/);
  assert.match(action, /status === "ordered"/);
});

test("Candidate準備自体はalbumやDraft rowを作らない", async () => {
  const server = await source("lib/passive-album-candidate-server.ts");
  assert.doesNotMatch(server, /\.from\("albums"\)\.insert/);
  assert.doesNotMatch(server, /save_album_draft_version/);
});

test("NOWは準備済みcandidateをALBUM_READYとして案内する", () => {
  const pet = { id: "pet-a", name: "むぎ" };
  const hero = selectUchinocoNowHero({
    selectedPet: pet,
    pets: [pet],
    anniversary: null,
    readyAlbum: null,
    passiveCandidate: { petId: pet.id, title: "むぎの2026年10月の思い出", photoCount: 12, href: "/pets/pet-a/album/candidate" },
    albumProgress: null,
    familyActivity: null,
    todayBestShot: null,
    todayLatestPhoto: null,
    fallbackPhoto: null,
    onThisDay: null,
    capturePromptAvailable: true,
    addPhotoHref: "/photos/new",
    memoriesHref: "/memories",
  });
  assert.equal(hero?.type, "ALBUM_READY");
  assert.equal(hero?.title, "今月のアルバム、できています");
  assert.equal(hero?.cta.label, "アルバムを見る");
});

test("multi-petは単一pet候補へ暗黙materializeしない", async () => {
  const home = await source("app/(app)/home/page.tsx");
  assert.match(home, /!readyAlbum && selectedPet/);
  assert.doesNotMatch(home, /petIds:\s*selectedPetIds/);
});

test("Album listは未確認candidateを正式albumと区別する", async () => {
  const page = await source("app/(app)/pets/[petId]/album/page.tsx");
  assert.match(page, /AIがまとめました · 未確認/);
  assert.match(page, /\/album\/candidate/);
});
