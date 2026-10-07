import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("production dependencies are pinned to the patched Next.js line", async () => {
  const pkg = JSON.parse(await readFile("./package.json", "utf8"));
  assert.match(pkg.dependencies.next, /^\^?16\.4\./);
  assert.equal(pkg.devDependencies["eslint-config-next"], "16.4.0");
});

test("all dev pages share a fail-closed production allowlist boundary", async () => {
  const source = await readFile("./app/(app)/dev/layout.tsx", "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /UCHINOCO_INTERNAL_USER_IDS/);
  assert.match(source, /if \(!allowed\.has\(user\.id\)\) notFound\(\)/);
});

test("global recovery, not-found, loading, and robots boundaries exist", async () => {
  const [globalError, appError, notFound, loading, robots] = await Promise.all([
    readFile("./app/global-error.tsx", "utf8"),
    readFile("./app/(app)/error.tsx", "utf8"),
    readFile("./app/not-found.tsx", "utf8"),
    readFile("./app/(app)/loading.tsx", "utf8"),
    readFile("./app/robots.ts", "utf8"),
  ]);
  assert.match(globalError, /もう一度試す/);
  assert.match(appError, /reset/);
  assert.match(notFound, /404/);
  assert.match(loading, /LoadingState/);
  assert.match(robots, /"\/dev\/"/);
  assert.match(robots, /"\/api\/"/);
});

test("security response headers are configured globally", async () => {
  const source = await readFile("./next.config.ts", "utf8");
  for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.match(source, new RegExp(header));
  }
});

test("print commerce environment defaults remain fail-closed", async () => {
  const env = await readFile("./.env.example", "utf8");
  assert.match(env, /^PRINT_COMMERCE_MODE=disabled$/m);
  assert.match(env, /^PRINT_PROVIDER=mock$/m);
  assert.match(env, /^PRODIGI_ENV=sandbox$/m);
  assert.match(env, /^PRODIGI_API_KEY=$/m);
});

test("Stripe webhook logs contain no raw event/order IDs or provider messages", async () => {
  const source = await readFile("./app/api/stripe/webhook/route.ts", "utf8");
  assert.doesNotMatch(source, /console\.(?:log|error)\(`\[webhook\].*event\.id/);
  assert.doesNotMatch(source, /console\.error\([^\n]*error\.message/);
  assert.match(source, /logWebhookFailure\("signature_verification"\)/);
});
