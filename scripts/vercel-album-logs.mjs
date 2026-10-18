#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROJECT = "uchinoco";
const ENVIRONMENT = "production";
const EVENT_NAMES = ["albumLayoutRecovery", "photoFrameMatching", "photoSubsetSelection", "editorialDensity", "albumGenerationCompletion", "completion"];
const SENSITIVE_KEY = /(?:photo|pet|album|user|request|deployment|project).*id|email|caption|storage.?path|signed.?url|token|cookie/i;

export function parseOptions(args) {
  const options = { since: "1h", limit: 100, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const [key, inlineValue] = argument.split("=", 2);
    if (key === "--since") {
      options.since = inlineValue ?? args[++index];
      if (!options.since) throw new Error("--since requires a duration or ISO timestamp");
      continue;
    }
    if (key === "--limit") {
      const value = inlineValue ?? args[++index];
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be an integer from 1 to 1000");
      options.limit = limit;
      continue;
    }
    throw new Error(`Unsupported option: ${argument}`);
  }
  return options;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(child)]));
}

const MAX_PAYLOAD_LENGTH = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_VALUES = 10000;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// Only a data grammar: objects, arrays, quoted strings, finite numbers and literals.
// Node inspection placeholders remain opaque strings, never invented nested data.
function parseLegacyPayload(source) {
  let index = 0, values = 0;
  const invalid = () => { throw new Error("Unsupported log payload"); };
  const whitespace = () => { while (/\s/.test(source[index] ?? "") && index < source.length) index++; };
  function quoted() {
    const quote = source[index++];
    let value = "";
    while (index < source.length) {
      const char = source[index++];
      if (char === quote) return value;
      if (char.charCodeAt(0) < 32) invalid();
      if (char !== "\\") { value += char; continue; }
      const escaped = source[index++];
      const escapes = { '"': '"', "'": "'", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (Object.hasOwn(escapes, escaped)) value += escapes[escaped];
      else if (escaped === "u" && /^[\da-f]{4}$/i.test(source.slice(index, index + 4))) {
        value += String.fromCharCode(Number.parseInt(source.slice(index, index + 4), 16)); index += 4;
      } else invalid();
    }
    invalid();
  }
  function value(depth) {
    if (depth > MAX_DEPTH || ++values > MAX_VALUES) invalid();
    whitespace();
    for (const placeholder of ["[Object]", "[Array]"]) {
      if (source.startsWith(placeholder, index)) { index += placeholder.length; return placeholder; }
    }
    const char = source[index];
    if (char === '"' || char === "'") return quoted();
    if (char === "{" || char === "[") {
      const object = char === "{", close = object ? "}" : "]";
      const items = [], keys = new Set(); index++; whitespace();
      if (source[index] === close) { index++; return object ? {} : []; }
      while (index < source.length) {
        if (object) {
          whitespace();
          let key;
          if (source[index] === '"' || source[index] === "'") key = quoted();
          else {
            const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
            if (!match) invalid();
            key = match[0]; index += key.length;
          }
          if (UNSAFE_KEYS.has(key) || keys.has(key)) invalid();
          keys.add(key); whitespace();
          if (source[index++] !== ":") invalid();
          items.push([key, value(depth + 1)]);
        } else items.push(value(depth + 1));
        whitespace();
        if (source[index] === close) { index++; return object ? Object.fromEntries(items) : items; }
        if (source[index++] !== ",") invalid();
        whitespace();
        if (source[index] === close) { index++; return object ? Object.fromEntries(items) : items; }
      }
      invalid();
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]]) {
      if (source.startsWith(literal, index)) { index += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (!number || !Number.isFinite(Number(number[0]))) invalid();
    index += number[0].length;
    return Number(number[0]);
  }
  const result = value(0); whitespace();
  if (index !== source.length) invalid();
  return result;
}

function validatePayload(value, depth = 0, budget = { count: 0 }) {
  if (depth > MAX_DEPTH || ++budget.count > MAX_VALUES) throw new Error("Log payload limit exceeded");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Nonfinite log number");
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new Error("Unsupported log key");
    validatePayload(child, depth + 1, budget);
  }
  return value;
}

export function parseMessagePayload(message) {
  if (typeof message !== "string") return message;
  if (message.length > MAX_PAYLOAD_LENGTH) return message;
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start < 0 || end < start) return message;
  if (message.slice(end + 1).trim()) return message;
  const slice = message.slice(start, end + 1);

  // 1. First attempt standard JSON parsing
  try {
    return validatePayload(JSON.parse(slice));
  } catch {
    // Try only the restricted legacy data grammar below.
  }

  try {
    return validatePayload(parseLegacyPayload(slice));
  } catch {
    // continue
  }

  return message;
}

export function matchingEvents(record) {
  const matches = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "string") {
      const matchingName = EVENT_NAMES.find((name) => value.includes(name));
      if (!matchingName) return;
      const parsedMessage = parseMessagePayload(value);
      matches.push({
        event: matchingName,
        timestamp: record.timestamp ?? null,
        level: record.level ?? null,
        data: parsedMessage && typeof parsedMessage === "object" ? redact(parsedMessage) : {},
      });
      return;
    }
    if (!value || typeof value !== "object") return;
    const fields = [value.event, value.name, value.message, value.msg].filter((field) => typeof field === "string");
    const matchingName = EVENT_NAMES.find((name) => fields.some((field) => field.includes(name)));
    if (matchingName) {
      const message = fields.find((field) => field.includes(matchingName));
      const parsedMessage = message ? parseMessagePayload(message) : null;
      const payload = { ...value };
      delete payload.message;
      delete payload.msg;
      delete payload.event;
      delete payload.name;
      delete payload.level;
      delete payload.timestamp;

      let combinedData = {};
      if (parsedMessage && typeof parsedMessage === "object") {
        combinedData = { ...payload, ...parsedMessage };
      } else if (Object.keys(payload).length > 0) {
        combinedData = payload;
      }

      matches.push({
        event: matchingName,
        timestamp: value.timestamp ?? record.timestamp ?? null,
        level: value.level ?? record.level ?? null,
        data: redact(combinedData),
      });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const matchingKey = EVENT_NAMES.find((name) => key.includes(name));
      if (matchingKey) {
        let childData = child;
        if (typeof child === "string") {
          const parsed = parseMessagePayload(child);
          childData = typeof parsed === "object" ? parsed : {};
        }
        matches.push({
          event: matchingKey,
          timestamp: value.timestamp ?? record.timestamp ?? null,
          level: value.level ?? record.level ?? null,
          data: redact(childData),
        });
      } else {
        visit(child);
      }
    }
  };
  visit(record);
  return matches;
}

export function parseJsonLines(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      throw new Error(`Vercel returned invalid JSONL at line ${index + 1}`);
    }
  }
  return records;
}

function printHelp() {
  console.log("Usage: node scripts/vercel-album-logs.mjs [--since 1h] [--limit 100]");
  console.log(`Read-only Production logs for ${EVENT_NAMES.join(", ")}.`);
}

function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid options");
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["--yes", "vercel@latest", "logs", "--project", PROJECT, "--environment", ENVIRONMENT, "--since", options.since, "--limit", String(options.limit), "--expand", "--json", "--non-interactive"];
  const result = spawnSync(npx, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) {
    console.error(`Unable to run npx Vercel CLI: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exitCode = result.status ?? 1;
    return;
  }

  try {
    const records = parseJsonLines(result.stdout);
    const events = records.flatMap(matchingEvents);
    for (const event of events) console.log(JSON.stringify(event));
    console.error(`Fetched ${records.length} Production records; matched ${events.length} album recovery events.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to parse Vercel logs");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
