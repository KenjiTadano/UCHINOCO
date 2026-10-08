import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Task076 public pages describe the service, plans, and print status accurately", async () => {
  const [home, pricing, contact, legal] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/pricing/page.tsx"),
    read("../app/contact/page.tsx"),
    read("../app/legal/page.tsx"),
  ]);
  const publicCopy = [home, pricing, contact, legal].join("\n");

  for (const label of ["写真を追加", "AIが整理", "ベストショット", "AI Album", "家族共有", "思い出検索", "Year in Review"]) {
    assert.ok(publicCopy.includes(label), `missing public feature: ${label}`);
  }
  assert.ok(pricing.includes("FREE"));
  assert.ok(pricing.includes("PLUS"));
  assert.match(pricing, /本番価格と提供条件が確定するまで、料金は表示していません/);
  assert.doesNotMatch(home, /Year in Review.{0,30}提供予定|家族共有.{0,30}提供予定/);
  assert.match(publicCopy, /Production Printの注文受付は現在行っていません/);
  assert.doesNotMatch(publicCopy, /フォトブック注文可能|フォトブックを注文できます|ご注文いただけます/);
  assert.doesNotMatch(publicCopy, /¥\s*[0-9]|[0-9][0-9,]*\s*円/);
  assert.doesNotMatch(publicCopy, /support@uchinoco\.app|sk_live_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/);
});

test("Task076 public routes have canonical metadata and shared legal navigation", async () => {
  const [frame, rootLayout, robots, pricing, contact, legal, privacy, terms] = await Promise.all([
    read("../app/_components/public-site.tsx"),
    read("../app/layout.tsx"),
    read("../app/robots.ts"),
    read("../app/pricing/page.tsx"),
    read("../app/contact/page.tsx"),
    read("../app/legal/page.tsx"),
    read("../app/privacy/page.tsx"),
    read("../app/terms/page.tsx"),
  ]);
  const publicRoutes = [pricing, contact, legal, privacy, terms].join("\n");

  for (const route of ["/pricing", "/privacy", "/terms", "/contact", "/legal", "/login"]) {
    assert.ok(frame.includes(`href="${route}"`), `missing footer link: ${route}`);
  }
  for (const route of ["/pricing", "/contact", "/legal", "/privacy", "/terms"]) {
    assert.ok(publicRoutes.includes(`"${route}"`), `missing canonical route: ${route}`);
  }
  assert.match(rootLayout, /metadataBase: new URL\("https:\/\/www\.uchinoco\.app"\)/);
  assert.match(rootLayout, /openGraph:/);
  for (const route of ["/pricing", "/contact", "/legal", "/privacy", "/terms"]) {
    assert.ok(robots.includes(`"${route}"`), `robots does not allow ${route}`);
  }
  for (const route of ["/api/", "/auth/", "/dev/", "/home", "/login", "/pets/", "/search", "/signup"]) {
    assert.ok(robots.includes(`"${route}"`), `robots does not disallow ${route}`);
  }
});

test("Task076 keeps the public root unauthenticated and app routes protected", async () => {
  const [root, appLayout, login] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/(app)/layout.tsx"),
    read("../app/(auth)/login/page.tsx"),
  ]);

  assert.doesNotMatch(root, /redirect\(/);
  assert.match(root, /<PublicSiteFrame>/);
  assert.match(appLayout, /if \(error \|\| !user\)\s*\{\s*redirect\("\/login"\)/);
  assert.match(login, /export default async function LoginPage/);
});