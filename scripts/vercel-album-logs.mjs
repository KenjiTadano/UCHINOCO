#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROJECT = "uchinoco";
const ENVIRONMENT = "production";
const EVENT_NAMES = ["albumLayoutRecovery", "photoFrameMatching"];
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

function parseMessagePayload(message) {
  const start = message.indexOf("{");
  if (start < 0) return message;
  try {
    return JSON.parse(message.slice(start));
  } catch {
    return message;
  }
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
      const payload = { ...value };
      delete payload.message;
      delete payload.msg;
      delete payload.event;
      delete payload.name;
      const parsedMessage = message ? parseMessagePayload(message) : null;
      matches.push({ event: matchingName, timestamp: value.timestamp ?? record.timestamp ?? null, level: value.level ?? record.level ?? null, data: redact(Object.keys(payload).length ? payload : parsedMessage) });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const matchingKey = EVENT_NAMES.find((name) => key.includes(name));
      if (matchingKey) {
        matches.push({ event: matchingKey, timestamp: value.timestamp ?? record.timestamp ?? null, level: value.level ?? record.level ?? null, data: redact(child) });
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
  console.log("Read-only Production logs for albumLayoutRecovery and photoFrameMatching.");
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
  const args = [
    "--yes",
    "vercel@latest",
    "logs",
    "--project", PROJECT,
    "--environment", ENVIRONMENT,
    "--since", options.since,
    "--limit", String(options.limit),
    "--expand",
    "--json",
    "--non-interactive",
  ];
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
