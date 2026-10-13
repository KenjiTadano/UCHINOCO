#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const PROJECT = "uchinoco";
export const ENVIRONMENT = "production";
export const DEFAULT_INTERVAL_MS = 10_000;
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes = 900,000ms

const SENSITIVE_PATTERN = /(?:secret[_-]?[a-z0-9]*|token|password|cookie|authorization|key|photo[_-]?id|pet[_-]?id|user[_-]?id)[=:][\s"']?([^\s&"',;]+)/gi;

export function redactText(text) {
  if (typeof text !== "string") return text;
  return text.replace(SENSITIVE_PATTERN, (match, val) => match.replace(val, "[redacted]"));
}

export function parseDuration(val, defaultMs) {
  if (!val) return defaultMs;
  if (/^\d+$/.test(val)) return Number(val);
  const match = /^(\d+)(ms|s|m|h)?$/i.exec(val);
  if (!match) throw new Error(`Invalid duration format: ${val}`);
  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount;
}

export function parseOptions(args) {
  const options = {
    commit: null,
    branch: null,
    intervalMs: DEFAULT_INTERVAL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    runLogs: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--logs") {
      options.runLogs = true;
      continue;
    }
    const [key, inlineVal] = arg.split("=", 2);
    if (key === "--commit") {
      options.commit = inlineVal ?? args[++i];
      if (!options.commit) throw new Error("--commit requires a commit SHA");
      continue;
    }
    if (key === "--branch") {
      options.branch = inlineVal ?? args[++i];
      if (!options.branch) throw new Error("--branch requires a branch name");
      continue;
    }
    if (key === "--poll-interval" || key === "--interval") {
      const val = inlineVal ?? args[++i];
      options.intervalMs = parseDuration(val, DEFAULT_INTERVAL_MS);
      if (options.intervalMs < 100) throw new Error("Interval must be at least 100ms");
      continue;
    }
    if (key === "--timeout") {
      const val = inlineVal ?? args[++i];
      options.timeoutMs = parseDuration(val, DEFAULT_TIMEOUT_MS);
      if (options.timeoutMs < 1000) throw new Error("Timeout must be at least 1s");
      continue;
    }
    throw new Error(`Unsupported option: ${arg}`);
  }

  return options;
}

export function getLocalGitInfo(execFn = execSync) {
  let commit = null;
  let branch = null;
  try {
    commit = execFn("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Git might not be available
  }
  try {
    branch = execFn("git branch --show-current", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Branch might be detached or unavailable
  }
  return { commit: commit || null, branch: branch || null };
}

export function filterDeployments(deployments, criteria = {}) {
  if (!Array.isArray(deployments)) return [];

  // Strictly filter to production target only (no Preview)
  const productionOnly = deployments.filter((d) => {
    const target = d.target || d.environment;
    return target === "production";
  });

  const { commitSha, branch } = criteria;

  if (commitSha) {
    const shaTarget = commitSha.trim().toLowerCase();
    const matchedBySha = productionOnly.filter((d) => {
      const dSha = d.meta?.githubCommitSha?.toLowerCase();
      if (!dSha) return false;
      return dSha === shaTarget || dSha.startsWith(shaTarget) || shaTarget.startsWith(dSha);
    });
    if (matchedBySha.length > 0) return matchedBySha;
  }

  if (branch) {
    const branchTarget = branch.trim();
    const matchedByBranch = productionOnly.filter((d) => {
      const dBranch = d.meta?.githubCommitRef;
      return dBranch === branchTarget;
    });
    if (matchedByBranch.length > 0) return matchedByBranch;
  }

  // If no commit or branch criteria specified, return all production deployments
  if (!commitSha && !branch) {
    return productionOnly;
  }

  return [];
}

export function defaultVercelListFetcher() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    "vercel@latest",
    "list",
    PROJECT,
    "--environment", ENVIRONMENT,
    "--limit", "20",
    "--json",
    "--non-interactive",
  ];
  const res = spawnSync(npx, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) throw new Error(`Vercel list spawn error: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`Vercel list failed (code ${res.status}): ${res.stderr.trim()}`);

  try {
    const parsed = JSON.parse(res.stdout);
    return parsed.deployments || [];
  } catch (err) {
    throw new Error(`Failed to parse Vercel list JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function defaultInspectLogsFetcher(url) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    "vercel@latest",
    "inspect",
    url,
    "--logs",
    "--non-interactive",
  ];
  const res = spawnSync(npx, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error || res.status !== 0) return null;
  return redactText(res.stdout);
}

export async function pollDeploymentStatus({
  fetchDeployments = defaultVercelListFetcher,
  inspectLogs = defaultInspectLogsFetcher,
  criteria = {},
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
  sleepFn = delay,
}) {
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempt++;
    let deployments;
    try {
      deployments = await fetchDeployments();
    } catch (err) {
      logger.error(`Error querying Vercel deployments: ${err instanceof Error ? err.message : String(err)}`);
    }

    const matched = filterDeployments(deployments, criteria);
    if (!matched || matched.length === 0) {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const queryInfo = criteria.commitSha ? `commit ${criteria.commitSha.slice(0, 7)}` : criteria.branch ? `branch ${criteria.branch}` : "production";
      logger.log(`[attempt ${attempt}] No Production deployment found yet for ${queryInfo} (${elapsedSec}s elapsed). Retrying...`);
    } else {
      const latest = matched[0]; // Deployment list is ordered newest first
      const state = (latest.state || "").toUpperCase();
      const url = latest.url;
      const sha = latest.meta?.githubCommitSha || "unknown";

      if (state === "READY") {
        logger.log("Deployment ready:");
        logger.log(`URL: https://${url}`);
        logger.log(`Commit: ${sha}`);
        logger.log(`Status: READY`);
        return { success: true, deployment: latest };
      }

      if (state === "ERROR" || state === "CANCELED") {
        logger.error(`Deployment failed:`);
        logger.error(`URL: https://${url}`);
        logger.error(`Commit: ${sha}`);
        logger.error(`Status: ${state}`);

        if (inspectLogs) {
          try {
            const logs = await inspectLogs(url);
            if (logs) {
              const safeLogs = redactText(logs);
              logger.error(`\n--- Build Logs ---\n${safeLogs.slice(0, 4000)}`);
            }
          } catch {
            // best effort inspection
          }
        }
        return { success: false, error: `Deployment finished with status ${state}`, deployment: latest };
      }

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      logger.log(`[attempt ${attempt}] Deployment found (${url.slice(0, 30)}...), status: ${state} (${elapsedSec}s elapsed). Waiting...`);
    }

    const remaining = timeoutMs - (Date.now() - startTime);
    if (remaining <= 0) break;
    const waitTime = Math.min(intervalMs, remaining);
    await sleepFn(waitTime);
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  return { success: false, error: `Timed out after ${totalSec}s waiting for Production deployment to become READY.` };
}

export function runAlbumLogs(logger = console) {
  logger.log("\nExecuting read-only album logs check (npm run vercel:album-logs)...");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(npm, ["run", "vercel:album-logs", "--", "--since", "1h", "--limit", "100"], {
    stdio: "inherit",
  });
  return res.status === 0;
}

function printHelp() {
  console.log("Usage: node scripts/wait-vercel-production.mjs [options]");
  console.log("\nWait for automatic Vercel Git Integration Production deployment to become Ready (read-only).");
  console.log("\nOptions:");
  console.log("  --commit <sha>        Target commit SHA (defaults to local git rev-parse HEAD)");
  console.log("  --branch <branch>     Target branch name (defaults to local git branch --show-current)");
  console.log("  --interval <duration> Polling interval (e.g. 10s, 5000ms; default 10s)");
  console.log("  --timeout <duration>  Maximum wait duration (e.g. 15m, 300s; default 15m)");
  console.log("  --logs                Run album logs script (npm run vercel:album-logs) after Ready");
  console.log("  --help, -h            Show this help message");
}

export async function main() {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const gitInfo = getLocalGitInfo();
  const criteria = {
    commitSha: options.commit || gitInfo.commit,
    branch: options.branch || gitInfo.branch,
  };

  console.log(`Watching for UCHINOCO Production deployment...`);
  if (criteria.commitSha) console.log(`Target Commit SHA : ${criteria.commitSha}`);
  if (criteria.branch) console.log(`Target Branch     : ${criteria.branch}`);
  console.log(`Poll Interval     : ${options.intervalMs / 1000}s`);
  console.log(`Max Timeout       : ${options.timeoutMs / 1000}s\n`);

  const result = await pollDeploymentStatus({
    criteria,
    intervalMs: options.intervalMs,
    timeoutMs: options.timeoutMs,
  });

  if (!result.success) {
    console.error(`\nFailure: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  if (options.runLogs) {
    const logsSuccess = runAlbumLogs();
    if (!logsSuccess) {
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
