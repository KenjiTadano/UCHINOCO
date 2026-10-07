import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { discoveryDateBounds, interpretMemoryQuery } from "../lib/memory-discovery.ts";
import { parseSearchState, searchValues } from "../lib/search-state.ts";

const blank = () => ({ q: "", pet: "", kind: "", word: "", favorite: false, from: "", to: "", year: "", month: "", season: "", best: false, anniversary: "", story: "" });
const now = new Date("2026-10-07T03:00:00.000Z");

test("natural language-lite parses year, month, season, Best Shot, and anniversaries", () => {
  let parsed = interpretMemoryQuery({ ...blank(), q: "2025年のベストショット" }, now);
  assert.equal(parsed.understood, true); assert.equal(parsed.state.year, "2025"); assert.equal(parsed.state.best, true); assert.equal(parsed.photoQuery, "");
  parsed = interpretMemoryQuery({ ...blank(), q: "2026年8月" }, now);
  assert.equal(parsed.state.year, "2026"); assert.equal(parsed.state.month, "8");
  parsed = interpretMemoryQuery({ ...blank(), q: "夏の写真" }, now);
  assert.equal(parsed.state.year, "2026"); assert.equal(parsed.state.season, "summer");
  parsed = interpretMemoryQuery({ ...blank(), q: "去年の誕生日" }, now);
  assert.equal(parsed.state.year, "2025"); assert.equal(parsed.state.anniversary, "birthday");
  parsed = interpretMemoryQuery({ ...blank(), q: "お迎えした頃" }, now);
  assert.equal(parsed.state.anniversary, "adoption");
});

test("unknown natural language safely falls back to existing keyword search", () => {
  const parsed = interpretMemoryQuery({ ...blank(), q: "ふわふわの毛布" }, now);
  assert.equal(parsed.understood, false);
  assert.equal(parsed.photoQuery, "ふわふわの毛布");
});

test("last year today and structured date filters use JST boundaries", () => {
  const lastYear = interpretMemoryQuery({ ...blank(), q: "去年の今日" }, now);
  assert.equal(lastYear.state.from, "2025-10-07"); assert.equal(lastYear.state.to, "2025-10-07");
  assert.deepEqual(discoveryDateBounds({ ...blank(), year: "2026", month: "8" }), { from: "2026-07-31T15:00:00.000Z", to: "2026-08-31T15:00:00.000Z" });
  assert.deepEqual(discoveryDateBounds({ ...blank(), year: "2026", season: "summer" }), { from: "2026-05-31T15:00:00.000Z", to: "2026-08-31T15:00:00.000Z" });
});

test("structured pet, year, month, season, Best Shot, anniversary, and story filters validate and round-trip", () => {
  const params = { pet: "123e4567-e89b-42d3-a456-426614174000", year: "2025", month: "7", season: "summer", best: "1", anniversary: "birthday", story: "event" };
  const parsed = parseSearchState(params);
  assert.equal(parsed.error, null);
  assert.deepEqual(searchValues(parsed.state), params);
  assert.match(parseSearchState({ season: "monsoon" }).error ?? "", /季節/);
  assert.match(parseSearchState({ story: "made-up" }).error ?? "", /Story/);
});

test("search remains server-bounded, RLS-scoped, paginated, private, and Vision-free", async () => {
  const [loader, screen] = await Promise.all([
    readFile(new URL("../lib/memory-discovery.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(app)/search/_components/search-screen.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(loader, /RLS returns both owned pets and explicitly shared family pets/);
  assert.doesNotMatch(loader, /service_role|createPublicUrl/);
  assert.match(loader, /limit\(120\)/); assert.match(loader, /limit\(24\)/); assert.match(loader, /slice\(0, 6\)/);
  assert.match(screen, /search_photos_page/); assert.match(screen, /SEARCH_PAGE_SIZE/); assert.match(screen, /p_cursor_at/); assert.match(screen, /createListImageUrls/);
  assert.doesNotMatch(loader + screen, /responses\.create|openai|analyzePhoto|createPublicUrl/i);
  assert.doesNotMatch(loader + screen, /search_query|query_text|event_data/);
});

test("result UX groups Anniversary, Best Shot, Stories, Photos, and Albums", async () => {
  const source = await readFile(new URL("../app/(app)/search/_components/search-screen.tsx", import.meta.url), "utf8");
  for (const label of ["記念日", "Best Shot", "Stories", "Photos", "Albums"]) assert.match(source, new RegExp(label));
  assert.match(source, /見つかりませんでした/);
  assert.match(source, /Best Shotを見る/);
});

test("multi-pet relation scope is explicitly handled for photos and albums", async () => {
  const source = await readFile(new URL("../lib/memory-discovery.ts", import.meta.url), "utf8");
  assert.match(source, /from\("photo_pets"\)/);
  assert.match(source, /confirmed_by_user/);
  assert.match(source, /from\("album_pets"\)/);
});
