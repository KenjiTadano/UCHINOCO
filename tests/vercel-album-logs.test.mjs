import assert from "node:assert/strict";
import { test } from "node:test";
import { matchingEvents, parseJsonLines, parseOptions } from "../scripts/vercel-album-logs.mjs";

test("log parser selects only target album recovery events from JSONL records", () => {
  const records = parseJsonLines([
    JSON.stringify({ timestamp: 1000, level: "info", requestPath: "/", logs: [] }),
    JSON.stringify({ timestamp: 2000, level: "info", logs: [{ event: "albumLayoutRecovery", spreadCount: 12, unrecoveredCount: 1 }] }),
    JSON.stringify({ timestamp: 3000, level: "info", logs: [{ message: "photoFrameMatching", data: { comparedPairCount: 24, initialUnsafeAfterMatching: 1 } }] }),
  ].join("\n"));
  const events = records.flatMap(matchingEvents);
  assert.deepEqual(events.map((event) => event.event), ["albumLayoutRecovery", "photoFrameMatching"]);
  assert.equal(events[0].timestamp, 2000);
  assert.equal(events[0].data.spreadCount, 12);
  assert.equal(events[1].data.data.initialUnsafeAfterMatching, 1);
});

test("matching log output redacts photo/pet/user identifiers and private image details", () => {
  const events = matchingEvents({ logs: [{ event: "albumLayoutRecovery", photoId: "photo-secret", petId: "pet-secret", albumId: "album-secret", caption: "private", safeCount: 8 }] });
  assert.deepEqual(events[0].data, { photoId: "[redacted]", petId: "[redacted]", albumId: "[redacted]", caption: "[redacted]", safeCount: 8 });
});

test("matchingEvents parses structured string logs without echoing unstructured text", () => {
  const events = matchingEvents({
    timestamp: 4000,
    logs: [
      'albumLayoutRecovery {"photoId":"photo-secret","recoveredCount":3}',
      "photoFrameMatching failed for private photo data",
    ],
  });
  assert.deepEqual(events, [
    {
      event: "albumLayoutRecovery",
      timestamp: 4000,
      level: null,
      data: { photoId: "[redacted]", recoveredCount: 3 },
    },
    { event: "photoFrameMatching", timestamp: 4000, level: null, data: {} },
  ]);
});

test("CLI options default to one hour and enforce a bounded limit", () => {
  assert.deepEqual(parseOptions([]), { since: "1h", limit: 100, help: false });
  assert.deepEqual(parseOptions(["--since=24h", "--limit", "50"]), { since: "24h", limit: 50, help: false });
  assert.throws(() => parseOptions(["--limit", "0"]), /1 to 1000/);
  assert.throws(() => parseOptions(["--follow"]), /Unsupported option/);
});
