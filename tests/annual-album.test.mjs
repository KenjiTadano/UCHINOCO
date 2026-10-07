import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ANNUAL_ALBUM_CONFIG,
  annualCandidateAlbumId,
  annualCandidateFingerprint,
  annualCandidateTitle,
  annualCandidateYear,
  annualEligibility,
  annualPeriod,
  annualSeasonForTimestamp,
  groupAnnualSelectionBySeason,
} from "../lib/annual-album.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("annual period is a JST calendar-year half-open range", () => {
  assert.deepEqual(annualPeriod(2026), { start: "2025-12-31T15:00:00.000Z", end: "2026-12-31T15:00:00.000Z" });
  assert.equal(annualPeriod(2026).end, annualPeriod(2027).start);
});

const eligibility = (overrides = {}) => annualEligibility({
  totalPhotoCount: 60,
  analyzedPhotoCount: 48,
  populatedMonthCount: 12,
  representedMonthCount: 10,
  selectedPhotoCount: 30,
  completedAnnualExists: false,
  ...overrides,
});

test("all analyzed and one unanalyzed are both eligible", () => {
  assert.equal(eligibility({ analyzedPhotoCount: 60 }).eligible, true);
  assert.equal(eligibility({ analyzedPhotoCount: 59 }).eligible, true);
});

test("many unanalyzed photos and insufficient analyzed ratio are rejected", () => {
  assert.equal(eligibility({ analyzedPhotoCount: 30 }).eligible, false);
  assert.equal(eligibility({ analyzedPhotoCount: 38, totalPhotoCount: 60 }).eligible, false);
  assert.equal(eligibility({ totalPhotoCount: 47, analyzedPhotoCount: 47 }).eligible, false);
});

test("sufficient month coverage can skip an empty-analysis month, insufficient coverage cannot", () => {
  assert.equal(eligibility({ representedMonthCount: 8 }).eligible, true);
  assert.equal(eligibility({ representedMonthCount: 5 }).eligible, false);
  assert.equal(eligibility({ populatedMonthCount: 10, representedMonthCount: 6 }).eligible, false);
  assert.equal(eligibility({ populatedMonthCount: 8, representedMonthCount: 6 }).eligible, true);
  assert.equal(eligibility({ completedAnnualExists: true }).eligible, false);
});

test("season structure follows Japanese calendar months and skips empty seasons", () => {
  assert.equal(annualSeasonForTimestamp("2026-01-01T00:00:00+09:00"), "WINTER");
  assert.equal(annualSeasonForTimestamp("2026-04-01T00:00:00+09:00"), "SPRING");
  assert.equal(annualSeasonForTimestamp("2026-08-01T00:00:00+09:00"), "SUMMER");
  assert.equal(annualSeasonForTimestamp("2026-10-01T00:00:00+09:00"), "AUTUMN");
  const grouped = groupAnnualSelectionBySeason([{ id: "spring", timelineAt: "2026-04-01T00:00:00+09:00" }, { id: "autumn", timelineAt: "2026-10-01T00:00:00+09:00" }]);
  assert.deepEqual(grouped.map((item) => item.key), ["SPRING", "AUTUMN"]);
});

test("annual fingerprint is deterministic, year-scoped and duplicate-safe", () => {
  const base = { petIds: ["pet"], analyzedPhotoIds: ["b", "a"], selectedPhotoIds: ["b"] };
  const first = annualCandidateFingerprint({ ...base, year: 2026 });
  assert.equal(first, annualCandidateFingerprint({ ...base, analyzedPhotoIds: ["a", "b"], year: 2026 }));
  assert.notEqual(first, annualCandidateFingerprint({ ...base, year: 2027 }));
  assert.notEqual(first, annualCandidateFingerprint({ ...base, analyzedPhotoIds: ["a", "b", "c"], year: 2026 }));
  assert.equal(annualCandidateAlbumId(first), annualCandidateAlbumId(first));
});

test("annual title safely uses the single pet name", () => {
  assert.equal(annualCandidateTitle(2026, "Waka"), "2026年のWaka");
  assert.equal(annualCandidateTitle(2026, "  "), "2026年のうちの子");
});

test("NOW visibility is limited to mid-December through January", () => {
  assert.equal(annualCandidateYear(new Date("2026-12-14T14:59:59Z")), null);
  assert.equal(annualCandidateYear(new Date("2026-12-14T15:00:00Z")), 2026);
  assert.equal(annualCandidateYear(new Date("2027-01-31T14:59:59Z")), 2026);
  assert.equal(annualCandidateYear(new Date("2027-01-31T15:00:00Z")), null);
});

test("server candidate reuses stored analysis, Best Shot, Story, Layout and Rhythm without Vision", async () => {
  const server = await source("lib/passive-annual-candidate-server.ts");
  assert.match(server, /storedOnly: true/);
  assert.match(server, /buildPetAlbumDraft/);
  assert.match(server, /role === "hero"/);
  assert.match(server, /buildAlbumCompositionPlan/);
  assert.doesNotMatch(server, /responses\.create|analyzePhotoWithVision/);
  assert.equal(ANNUAL_ALBUM_CONFIG.maxSelectedPhotos, 36);
});

test("accepted monthly albums are reuse inputs and monthly rows are never updated", async () => {
  const server = await source("lib/passive-annual-candidate-server.ts");
  const action = await source("app/(app)/pets/[petId]/album/year/[year]/actions.ts");
  assert.match(server, /acceptedMonthlySources/);
  assert.match(server, /annual_monthly_source_album_ids|monthlySourceAlbumIds/);
  assert.doesNotMatch(action, /\.from\("albums"\)\.update/);
});

test("annual composition keeps non-empty seasons and records print awareness", async () => {
  const server = await source("lib/passive-annual-candidate-server.ts");
  assert.match(server, /groupAnnualSelectionBySeason/);
  assert.match(server, /estimatedPageCount/);
  assert.match(server, /printSafe/);
  assert.match(server, /birthday, adoption_date/);
  assert.match(server, /adoptionOccurrence/);
});

test("Annual Candidate is passive, atomic on open and protected from duplicates", async () => {
  const action = await source("app/(app)/pets/[petId]/album/year/[year]/actions.ts");
  const migration = await source("supabase/migrations/20261005120000_atomic_passive_annual_materialization.sql");
  assert.match(action, /materialize_passive_annual_candidate/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /stale annual candidate/);
  assert.match(migration, /existing annual album is protected/);
  assert.match(migration, /Monthly albums are deliberately ignored/);
});

test("NOW and Album list expose a distinct annual experience", async () => {
  const now = await source("lib/uchinoco-now.ts");
  const home = await source("app/(app)/home/page.tsx");
  const list = await source("app/(app)/pets/[petId]/album/page.tsx");
  assert.match(now, /YEAR IN REVIEW/);
  assert.match(now, /1年を振り返る/);
  assert.match(home, /annualCandidateYear/);
  assert.match(list, /YEAR IN REVIEW/);
  assert.match(list, /annualAlbumIds/);
});

test("single-pet scope and print-safe payload remain explicit", async () => {
  const server = await source("lib/passive-annual-candidate-server.ts");
  const action = await source("app/(app)/pets/[petId]/album/year/[year]/actions.ts");
  assert.match(server, /petIds: \[input\.petId\]/);
  assert.match(action, /\.eq\("owner_user_id", user\.id\)/);
  assert.match(action, /annual_print: candidate\.print/);
});
