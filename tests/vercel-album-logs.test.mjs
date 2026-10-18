import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
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

test("legacy data grammar preserves nested counters, escapes and opaque inspection placeholders", () => {
  assert.deepEqual(parseMessagePayload(String.raw`event { count: -1.5e2, ready: true, reason: null, nested: { attempts: 12, }, items: [1, false, 'it\'s\n\u65e5', [Object], [Array]], }`), {
    count: -150, ready: true, reason: null, nested: { attempts: 12 },
    items: [1, false, "it's\n日", "[Object]", "[Array]"],
  });
});

for (const event of ["albumLayoutRecovery", "photoFrameMatching", "photoSubsetSelection", "editorialDensity", "albumGenerationCompletion", "completion"]) {
  test(`${event}: JSON, legacy and structured records retain normal diagnostics`, () => {
    const data = { count: 3, nested: { success: true }, status: "complete", outcome: "ready" };
    for (const record of [
      { message: `${event} ${JSON.stringify(data)}` },
      { message: `${event} { count: 3, nested: { success: true }, status: 'complete', outcome: 'ready' }` },
      { [event]: data },
      { event, ...data },
    ]) {
      const parsed = matchingEvents(record);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].event, event);
      assert.deepEqual(parsed[0].data, data);
    }
  });
}

test("host objects and executable syntax never execute or escape from log text", () => {
  const sentinel = "__uchinocoLogParserProbe";
  const previous = Object.getOwnPropertyDescriptor(globalThis, sentinel);
  const previousEnv = process.env[sentinel];
  Object.defineProperty(globalThis, sentinel, { value: 0, writable: true, configurable: true });
  process.env[sentinel] = "unchanged";
  const attacks = [
    `{ value: process.env.${sentinel} = 'changed' }`,
    `{ value: globalThis.${sentinel} = 1 }`,
    // The old sandbox's host Array exposed the host constructor chain.
    `{ value: Array.constructor.constructor('return process')().env.${sentinel} = 'changed' }`,
    `{ constructor: { prototype: { ${sentinel}: 1 } } }`,
    `{"__proto__":{"${sentinel}":1}}`,
    String.raw`{ '\u005f_proto__': { polluted: true } }`,
    `{ get value() { globalThis.${sentinel} = 1; return 1; } }`,
    `{ value: function () { globalThis.${sentinel} = 1; } }`,
    `{ value: (() => { globalThis.${sentinel} = 1; return 1; })() }`,
    '{ value: `${globalThis.' + sentinel + ' = 1}` }',
    `{ value: new Date() }`,
    `{ value: 1 + 2 }`,
    `{ ...globalThis }`,
    `{ ['computed']: 1 }`,
    `{ value: /pattern/ }`,
  ];
  try {
    for (const payload of attacks) {
      const raw = `albumLayoutRecovery ${payload}`;
      assert.equal(parseMessagePayload(raw), raw, payload);
      assert.deepEqual(matchingEvents({ message: raw })[0].data, {}, payload);
      assert.equal(globalThis[sentinel], 0, payload);
      assert.equal(process.env[sentinel], "unchanged", payload);
      assert.equal(Object.prototype[sentinel], undefined, payload);
    }
    // Quoted keywords are ordinary data and must not be evaluated either.
    assert.deepEqual(parseMessagePayload(`event { text: 'process globalThis constructor __proto__ getter function IIFE \\n' }`), {
      text: "process globalThis constructor __proto__ getter function IIFE \n",
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, sentinel, previous);
    else delete globalThis[sentinel];
    if (previousEnv === undefined) delete process.env[sentinel];
    else process.env[sentinel] = previousEnv;
  }
});

test("malformed, trailing expression, oversized and deeply nested payloads stay raw", () => {
  for (const raw of [
    'event { x: 1 } trailing', 'event { x: 1, x: 2 }', 'event { x: NaN }',
    'event { x: 1e999 }', 'event { x: "unterminated }', 'event { x: [1,,2] }',
    'event { x: ' + '['.repeat(40) + '0' + ']'.repeat(40) + ' }',
    'event {"x":' + '['.repeat(40) + '0' + ']'.repeat(40) + '}',
    'event { x: "' + 'a'.repeat(1024 * 1024) + '" }',
  ]) assert.equal(parseMessagePayload(raw), raw);
});

test("large normal structured diagnostics are not truncated at 64 KiB", () => {
  const data = { spreadDiagnostics: Array.from({ length: 36 }, (_, spreadIndex) => ({ spreadIndex, counters: Array(250).fill(123456789) })) };
  const raw = JSON.stringify(data);
  assert.ok(raw.length > 65536);
  assert.deepEqual(parseMessagePayload(`albumLayoutRecovery ${raw}`), data);
});

test("parser implementation contains no executable evaluation fallback", async () => {
  const source = await readFile(new URL('../scripts/vercel-album-logs.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:vm|\beval\s*\(|\bFunction\s*\(|runIn(?:New)?Context|\bimport\s*\(/);
});
