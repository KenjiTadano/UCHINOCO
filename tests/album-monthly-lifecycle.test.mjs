import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  currentTokyoMonth,
  deriveMonthlyAlbumLifecycle,
  monthKeyForTimestamp,
  parseTokyoMonthKey,
  periodMatchesMonth,
  previousTokyoMonth,
  tokyoMonth,
} from "../lib/album-monthly-lifecycle.ts";
import { passiveCandidateFingerprint } from "../lib/passive-album-candidate.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("month rollover creates separate JST periods and fingerprints", () => {
  const september = tokyoMonth(2026, 9);
  const october = tokyoMonth(2026, 10);
  assert.equal(september.period.end, october.period.start);
  const base = { petIds: ["pet"], photoIds: ["photo"] };
  assert.notEqual(
    passiveCandidateFingerprint({ ...base, period: september.period }),
    passiveCandidateFingerprint({ ...base, period: october.period }),
  );
});

test("JST boundary keeps 00:00 in the new month", () => {
  assert.equal(monthKeyForTimestamp("2026-09-30T14:59:59.999Z"), "2026-09");
  assert.equal(monthKeyForTimestamp("2026-09-30T15:00:00.000Z"), "2026-10");
  assert.deepEqual(currentTokyoMonth(new Date("2026-09-30T15:00:00.000Z")), tokyoMonth(2026, 10));
  assert.deepEqual(previousTokyoMonth(new Date("2026-09-30T15:00:00.000Z")), tokyoMonth(2026, 9));
});

test("collecting, candidate, draft, accepted, ordered and finalized precedence", () => {
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 0 }).state, "COLLECTING");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 3 }).state, "COLLECTING");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 12, candidateReady: true }).state, "CANDIDATE_READY");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 12, candidateReady: true, hasDraft: true }).state, "DRAFT");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 12, hasDraft: true, accepted: true }).state, "ACCEPTED");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 12, accepted: true, ordered: true }).state, "ORDERED");
  assert.equal(deriveMonthlyAlbumLifecycle({ photoCount: 12, ordered: true, finalized: true }).state, "FINALIZED");
});

test("low-photo month reports real remaining count and never ready", () => {
  const state = deriveMonthlyAlbumLifecycle({ photoCount: 3 });
  assert.equal(state.ready, false);
  assert.equal(state.remaining, state.threshold - 3);
});

test("month key parser rejects malformed input", () => {
  assert.equal(parseTokyoMonthKey("2026-10")?.month, 10);
  assert.equal(parseTokyoMonthKey("2026-13"), null);
  assert.equal(parseTokyoMonthKey("October"), null);
});

test("period matching distinguishes previous and current month", () => {
  const september = tokyoMonth(2026, 9);
  const october = tokyoMonth(2026, 10);
  assert.equal(periodMatchesMonth(september.period.start, september.period.end, september), true);
  assert.equal(periodMatchesMonth(september.period.start, september.period.end, october), false);
});

test("candidate queries are period-scoped and candidate route carries month key", async () => {
  const server = await source("lib/passive-album-candidate-server.ts");
  const page = await source("app/(app)/pets/[petId]/album/candidate/page.tsx");
  const action = await source("app/(app)/pets/[petId]/album/candidate/actions.ts");
  assert.match(server, /\.gte\("timeline_at", period\.start\)/);
  assert.match(server, /\.lt\("timeline_at", period\.end\)/);
  assert.match(server, /\.lt\("period_from", period\.end\)/);
  assert.match(server, /\.gt\("period_to", period\.start\)/);
  assert.match(server, /monthKey/);
  assert.match(page, /searchParams/);
  assert.match(action, /parseTokyoMonthKey\(monthKey\)/);
});

test("late previous-month photos route to Task064 and not the current candidate", async () => {
  const suggestions = await source("lib/album-new-photo-suggestions.ts");
  const passive = await source("lib/passive-album-candidate-server.ts");
  assert.match(suggestions, /\.gte\("timeline_at", album\.period_from\)/);
  assert.match(suggestions, /\.lt\("timeline_at", album\.period_to\)/);
  assert.match(suggestions, /detectNewPhotoIds/);
  assert.match(suggestions, /suggestionIsProtected/);
  assert.match(passive, /candidatePeriod\(input\.monthKey/);
});

test("Album list is chronological and NOW prioritizes current month", async () => {
  const albumPage = await source("app/(app)/pets/[petId]/album/page.tsx");
  const home = await source("app/(app)/home/page.tsx");
  assert.match(albumPage, /right\.monthKey/);
  assert.match(albumPage, /previousPassiveCandidate/);
  assert.match(home, /periodMatchesMonth/);
  assert.match(home, /monthKey: currentMonth\.key/);
  assert.match(home, /monthKey: previousMonth\.key/);
});

test("single-pet passive candidate constraint remains in place", async () => {
  const home = await source("app/(app)/home/page.tsx");
  assert.match(home, /selectedPet\s*\?/);
  assert.doesNotMatch(home, /petIds:\s*selectedPetIds/);
});
