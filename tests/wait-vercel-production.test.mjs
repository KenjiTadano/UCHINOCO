import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterDeployments,
  parseDuration,
  parseOptions,
  pollDeploymentStatus,
  redactText,
} from "../scripts/wait-vercel-production.mjs";

const sampleDeployments = [
  {
    url: "uchinoco-prod-latest.vercel.app",
    name: "uchinoco",
    target: "production",
    state: "READY",
    meta: {
      githubCommitSha: "996e84c1c78f0919431addee72f5ffb20ca3e5c1",
      githubCommitRef: "main",
    },
  },
  {
    url: "uchinoco-preview-1.vercel.app",
    name: "uchinoco",
    target: "preview",
    state: "READY",
    meta: {
      githubCommitSha: "996e84c1c78f0919431addee72f5ffb20ca3e5c1",
      githubCommitRef: "main",
    },
  },
  {
    url: "uchinoco-prod-old.vercel.app",
    name: "uchinoco",
    target: "production",
    state: "READY",
    meta: {
      githubCommitSha: "f46dfea2497ef5471f667f1f254ed2a3f120ff24",
      githubCommitRef: "main",
    },
  },
  {
    url: "uchinoco-feature-prod.vercel.app",
    name: "uchinoco",
    target: "production",
    state: "BUILDING",
    meta: {
      githubCommitSha: "aabbcc11223344556677889900aabbccddeeff00",
      githubCommitRef: "feature/awesome",
    },
  },
];

test("parseOptions handles options and flags correctly", () => {
  const opts = parseOptions([
    "--commit=1234567",
    "--branch", "main",
    "--interval", "5s",
    "--timeout", "1m",
    "--logs",
  ]);
  assert.equal(opts.commit, "1234567");
  assert.equal(opts.branch, "main");
  assert.equal(opts.intervalMs, 5000);
  assert.equal(opts.timeoutMs, 60000);
  assert.equal(opts.runLogs, true);
  assert.equal(opts.help, false);

  assert.throws(() => parseOptions(["--unknown"]), /Unsupported option/);
  assert.throws(() => parseOptions(["--interval", "50ms"]), /at least 100ms/);
  assert.throws(() => parseOptions(["--timeout", "500ms"]), /at least 1s/);
});

test("parseDuration supports seconds, minutes, hours, and raw ms", () => {
  assert.equal(parseDuration("10s"), 10000);
  assert.equal(parseDuration("5m"), 300000);
  assert.equal(parseDuration("1h"), 3600000);
  assert.equal(parseDuration("1500"), 1500);
  assert.throws(() => parseDuration("invalid"), /Invalid duration format/);
});

test("filterDeployments strictly excludes preview deployments even if commit matches", () => {
  const filtered = filterDeployments(sampleDeployments, {
    commitSha: "996e84c1c78f0919431addee72f5ffb20ca3e5c1",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].url, "uchinoco-prod-latest.vercel.app");
  assert.equal(filtered[0].target, "production");
});

test("filterDeployments supports short commit SHA prefixes", () => {
  const filtered = filterDeployments(sampleDeployments, {
    commitSha: "996e84c",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].url, "uchinoco-prod-latest.vercel.app");
});

test("filterDeployments excludes deployments with wrong branch / wrong commit", () => {
  const wrongCommit = filterDeployments(sampleDeployments, {
    commitSha: "0000000000000000000000000000000000000000",
  });
  assert.equal(wrongCommit.length, 0);

  const wrongBranch = filterDeployments(sampleDeployments, {
    branch: "nonexistent-branch",
  });
  assert.equal(wrongBranch.length, 0);
});

test("filterDeployments matches by branch when commit is not matching", () => {
  const filtered = filterDeployments(sampleDeployments, {
    branch: "feature/awesome",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].url, "uchinoco-feature-prod.vercel.app");
});

test("pollDeploymentStatus succeeds immediately when deployment is already READY", async () => {
  const logs = [];
  const result = await pollDeploymentStatus({
    fetchDeployments: async () => sampleDeployments,
    criteria: { commitSha: "996e84c" },
    logger: {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    },
    intervalMs: 100,
    timeoutMs: 1000,
  });

  assert.equal(result.success, true);
  assert.equal(result.deployment.url, "uchinoco-prod-latest.vercel.app");
  assert.ok(logs.some((l) => l.includes("Deployment ready:")));
  assert.ok(logs.some((l) => l.includes("Status: READY")));
});

test("pollDeploymentStatus handles transition from BUILDING to READY", async () => {
  let step = 0;
  const mockFetch = async () => {
    step++;
    if (step === 1) {
      return [
        {
          url: "uchinoco-transition.vercel.app",
          target: "production",
          state: "BUILDING",
          meta: { githubCommitSha: "abcdef123456" },
        },
      ];
    }
    return [
      {
        url: "uchinoco-transition.vercel.app",
        target: "production",
        state: "READY",
        meta: { githubCommitSha: "abcdef123456" },
      },
    ];
  };

  const logs = [];
  const sleeps = [];
  const result = await pollDeploymentStatus({
    fetchDeployments: mockFetch,
    criteria: { commitSha: "abcdef1" },
    intervalMs: 100,
    timeoutMs: 2000,
    logger: {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    },
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.deployment.state, "READY");
  assert.equal(sleeps.length, 1);
  assert.ok(logs.some((l) => l.includes("status: BUILDING")));
  assert.ok(logs.some((l) => l.includes("Deployment ready:")));
});

test("pollDeploymentStatus reports failure on ERROR state and displays logs", async () => {
  const mockFetch = async () => [
    {
      url: "uchinoco-error.vercel.app",
      target: "production",
      state: "ERROR",
      meta: { githubCommitSha: "error123456" },
    },
  ];

  const logs = [];
  let inspectCalled = false;
  const result = await pollDeploymentStatus({
    fetchDeployments: mockFetch,
    inspectLogs: async () => {
      inspectCalled = true;
      return "Build Error: Next.js build failed\nsecret_token=abc123secret";
    },
    criteria: { commitSha: "error123456" },
    intervalMs: 100,
    timeoutMs: 2000,
    logger: {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    },
  });

  assert.equal(result.success, false);
  assert.ok(result.error.includes("ERROR"));
  assert.equal(inspectCalled, true);
  assert.ok(logs.some((l) => l.includes("Deployment failed:")));
  // Verify secret is redacted in output
  assert.ok(logs.some((l) => l.includes("[redacted]")));
  assert.ok(!logs.some((l) => l.includes("abc123secret")));
});

test("pollDeploymentStatus reports timeout when deployment remains BUILDING", async () => {
  const mockFetch = async () => [
    {
      url: "uchinoco-slow.vercel.app",
      target: "production",
      state: "BUILDING",
      meta: { githubCommitSha: "slow123456" },
    },
  ];

  const fakeSleep = async () => {};

  const result = await pollDeploymentStatus({
    fetchDeployments: mockFetch,
    criteria: { commitSha: "slow123456" },
    intervalMs: 200,
    timeoutMs: 500,
    logger: { log: () => {}, error: () => {} },
    sleepFn: fakeSleep,
  });

  assert.equal(result.success, false);
  assert.ok(result.error.includes("Timed out"));
});

test("pollDeploymentStatus retries and handles no deployment found until timeout", async () => {
  const mockFetch = async () => [];

  const logs = [];
  const result = await pollDeploymentStatus({
    fetchDeployments: mockFetch,
    criteria: { commitSha: "notfound123" },
    intervalMs: 150,
    timeoutMs: 400,
    logger: {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    },
    sleepFn: async () => {},
  });

  assert.equal(result.success, false);
  assert.ok(result.error.includes("Timed out"));
  assert.ok(logs.some((l) => l.includes("No Production deployment found yet")));
});

test("redactText strips tokens and sensitive parameters", () => {
  const input = "Error: authorization=Bearer12345 and photo_id=photo-xyz failed with token=secretToken99";
  const output = redactText(input);
  assert.ok(!output.includes("Bearer12345"));
  assert.ok(!output.includes("photo-xyz"));
  assert.ok(!output.includes("secretToken99"));
  assert.ok(output.includes("[redacted]"));
});
