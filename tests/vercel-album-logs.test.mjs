import assert from "node:assert/strict";
import { test } from "node:test";
import { matchingEvents, parseJsonLines, parseMessagePayload, parseOptions } from "../scripts/vercel-album-logs.mjs";

test("log parser selects only target album recovery events from JSONL records", () => {
  const records = parseJsonLines(
    [
      JSON.stringify({ timestamp: 1000, level: "info", requestPath: "/", logs: [] }),
      JSON.stringify({ timestamp: 2000, level: "info", logs: [{ event: "albumLayoutRecovery", spreadCount: 12, unrecoveredCount: 1 }] }),
      JSON.stringify({ timestamp: 3000, level: "info", logs: [{ message: "photoFrameMatching", data: { comparedPairCount: 24, initialUnsafeAfterMatching: 1 } }] }),
    ].join("\n"),
  );
  const events = records.flatMap(matchingEvents);
  assert.deepEqual(
    events.map((event) => event.event),
    ["albumLayoutRecovery", "photoFrameMatching"],
  );
  assert.equal(events[0].timestamp, 2000);
  assert.equal(events[0].data.spreadCount, 12);
  assert.equal(events[1].data.data.initialUnsafeAfterMatching, 1);
});

test("preserves full structured log payload from Node.js formatted console output without reducing to level:info", () => {
  const rawConsoleMessage = `albumLayoutRecovery {\n  spreadCount: 12,\n  initialUnsafeSpreadCount: 6,\n  unrecoveredCount: 0,\n  photoFrameMatching: {\n    comparedPairCount: 1022,\n    averageScore: 0.736\n  },\n  spreadDiagnostics: [ [Object] ]\n}`;
  const record = {
    timestamp: 1791857659710,
    level: "info",
    logs: [
      {
        level: "info",
        message: rawConsoleMessage,
      },
    ],
  };

  const events = matchingEvents(record);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.event, "albumLayoutRecovery");
  assert.equal(event.timestamp, 1791857659710);
  assert.equal(event.level, "info");
  assert.notDeepEqual(event.data, { level: "info" });
  assert.equal(event.data.spreadCount, 12);
  assert.equal(event.data.initialUnsafeSpreadCount, 6);
  assert.equal(event.data.unrecoveredCount, 0);
  assert.deepEqual(event.data.photoFrameMatching, {
    comparedPairCount: 1022,
    averageScore: 0.736,
  });
});

test("parseMessagePayload parses both JSON and Node.js object literal formats", () => {
  const jsonParsed = parseMessagePayload('event {"count": 42}');
  assert.deepEqual(jsonParsed, { count: 42 });

  const nodeLiteralParsed = parseMessagePayload("event {\n  spreadCount: 12,\n  mode: 'recovery'\n}");
  assert.deepEqual(nodeLiteralParsed, { spreadCount: 12, mode: "recovery" });
});

test("matching log output redacts photo/pet/user identifiers and private image details", () => {
  const events = matchingEvents({ logs: [{ event: "albumLayoutRecovery", photoId: "photo-secret", petId: "pet-secret", albumId: "album-secret", caption: "private", safeCount: 8 }] });
  assert.deepEqual(events[0].data, { photoId: "[redacted]", petId: "[redacted]", albumId: "[redacted]", caption: "[redacted]", safeCount: 8 });
});

test("matchingEvents parses structured string logs without echoing unstructured text", () => {
  const events = matchingEvents({
    timestamp: 4000,
    logs: ['albumLayoutRecovery {"photoId":"photo-secret","recoveredCount":3}', "photoFrameMatching failed for private photo data"],
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
