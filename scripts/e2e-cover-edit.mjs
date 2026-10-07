/**
 * 07.3 cover-edit interaction smoke (Playwright).
 * Requires: next on :3001, /tmp/uchinoco-owner-session.json
 * Run: node scripts/e2e-cover-edit.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/tmp/node_modules/playwright-core");

const BASE = process.env.UCHINOCO_BASE ?? "http://localhost:3001";
const PET = process.env.UCHINOCO_PET ?? "645f30fe-700f-441c-8878-6658caef0870";
const ALBUM_CANDIDATES = (
  process.env.UCHINOCO_ALBUM
    ? [process.env.UCHINOCO_ALBUM]
    : [
        "a2533aee-cb29-4714-acfb-22264ca45c45",
        "4b88b20c-79fc-41bf-a162-a2c82fc1418c",
        "aa141415-9edc-44cc-8719-f6376c9dd67f",
        "3843c594-1f93-441e-a619-50db06ad07a3",
        "0da9f4fe-7f6b-4b28-b486-2eb61917e57d",
        "9b0c4916-4d6f-48d0-98b4-2ba632c26ee7",
      ]
);
const OUT = "/Users/tadanokenji/dev/uchinoco/docs/cover-edit-ui-compare";
mkdirSync(OUT, { recursive: true });

const TEMPLATES = [
  "simple",
  "natural",
  "polaroid",
  "seasonal",
  "handwritten",
  "custom",
];

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const session = JSON.parse(readFileSync("/tmp/uchinoco-owner-session.json", "utf8"));
const projectRef = "jfqbztzqghgjmwrgskft";
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  expires_in: 3600,
  token_type: "bearer",
});

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const MAX = 3180;
const chunks = [];
for (let i = 0; i < cookieValue.length; i += MAX) chunks.push(cookieValue.slice(i, i + MAX));
const domains = ["localhost", "127.0.0.1"];
for (const domain of domains) {
  if (chunks.length === 1) {
    await context.addCookies([
      {
        name: cookieName,
        value: cookieValue,
        domain,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  } else {
    for (let i = 0; i < chunks.length; i++) {
      await context.addCookies([
        {
          name: `${cookieName}.${i}`,
          value: chunks[i],
          domain,
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    }
  }
}

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

async function previewTplClass() {
  return (
    (await page.locator(".cover-edit-book").first().getAttribute("class")) ?? ""
  );
}

try {
  let ALBUM = ALBUM_CANDIDATES[0];
  let best = { album: ALBUM, ok: false };

  for (const candidate of ALBUM_CANDIDATES) {
    await page.goto(`${BASE}/pets/${PET}/album/${candidate}/cover/edit`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    if (page.url().includes("/login")) continue;
    const has = (await page.locator(".cover-edit-page").count()) > 0;
    console.log("PROBE", candidate, "cover-edit", has, page.url());
    if (has) {
      best = { album: candidate, ok: true };
      ALBUM = candidate;
      break;
    }
  }
  if (!best.ok) ALBUM = best.album;
  console.log("USING_ALBUM", ALBUM);

  // A. 07.1 → 07.3
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/edit`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const coverLink = page.getByTestId("album-edit-cover-change");
  if ((await coverLink.count()) > 0) {
    await coverLink.click();
    await page.waitForURL(/\/cover\/edit/, { timeout: 15000 });
    log("A 07.1→07.3", page.url().includes("/cover/edit"), page.url());
  } else {
    const byText = page.getByRole("link", { name: /表紙を変更/ });
    if ((await byText.count()) > 0) {
      await byText.click();
      await page.waitForURL(/\/cover\/edit/, { timeout: 15000 });
      log("A 07.1→07.3", page.url().includes("/cover/edit"), page.url());
    } else {
      log("A 07.1→07.3", false, `cover link missing; url=${page.url()}`);
      await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/cover/edit`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
  }

  await page.waitForSelector(".cover-edit-page", { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/after-390-viewport.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/after-390-full.png`, fullPage: true });

  // B–G templates
  for (const id of TEMPLATES) {
    const btn = page.getByTestId(`cover-edit-template-${id}`);
    await btn.click();
    await page.waitForTimeout(200);
    const pressed = await btn.getAttribute("aria-pressed");
    const cls = await previewTplClass();
    const overlaySrc = await page
      .locator(".cover-edit-book .album-cover-book-overlay")
      .first()
      .getAttribute("src")
      .catch(() => null);
    const ok =
      pressed === "true" &&
      cls.includes(`album-cover-book--tpl-${id}`) &&
      (overlaySrc ? overlaySrc.includes(`${id}-overlay`) : id === "simple");
    log(`${id} template`, ok, `pressed=${pressed}; overlay=${overlaySrc}`);
  }

  // H cover color
  const colorBtn = page.getByTestId("cover-edit-color-pink");
  await colorBtn.click();
  await page.waitForTimeout(200);
  const colorSelected = await colorBtn.getAttribute("aria-selected");
  const hasTint = (await page.locator(".cover-edit-book.has-tint").count()) > 0;
  log("H cover color", colorSelected === "true" && hasTint, `aria-selected=${colorSelected}; hasTint=${hasTint}`);

  // I title
  await page.getByTestId("cover-edit-tab-title").click();
  await page.waitForTimeout(150);
  const titleInput = page.getByTestId("cover-edit-title-input");
  await titleInput.fill("テストの思い出");
  await page.waitForTimeout(150);
  const titleText = await page
    .locator(".cover-edit-book .album-cover-book-title-main")
    .first()
    .innerText();
  log("I title", titleText.includes("テストの思い出"), titleText);

  // J subtitle
  await page.getByTestId("cover-edit-tab-subtitle").click();
  await page.waitForTimeout(150);
  const subtitleInput = page.getByTestId("cover-edit-subtitle-input");
  await subtitleInput.fill("テストペットの");
  await page.waitForTimeout(150);
  const prefixText = await page
    .locator(".cover-edit-book .album-cover-book-title-prefix")
    .first()
    .innerText();
  log("J subtitle", prefixText.includes("テストペットの"), prefixText);

  // back to design for photo change screenshot context
  await page.getByTestId("cover-edit-tab-design").click();

  // K photo change
  await page.getByTestId("cover-edit-change-photo").click();
  await page.waitForSelector('[data-testid="cover-edit-picker"]', { timeout: 5000 });
  const pickerItems = page.locator(".cover-edit-picker-item");
  const pickerCount = await pickerItems.count();
  if (pickerCount > 0) {
    const beforeSrc = await page
      .locator(".cover-edit-book .album-cover-book-photo img")
      .first()
      .getAttribute("src")
      .catch(() => null);
    await pickerItems.nth(Math.min(1, pickerCount - 1)).click();
    await page.waitForTimeout(400);
    const closed = (await page.getByTestId("cover-edit-picker").count()) === 0;
    const afterSrc = await page
      .locator(".cover-edit-book .album-cover-book-photo img")
      .first()
      .getAttribute("src")
      .catch(() => null);
    log(
      "K photo change",
      closed && pickerCount > 0 && Boolean(afterSrc),
      `candidates=${pickerCount}; changed=${beforeSrc !== afterSrc}`,
    );
  } else {
    log("K photo change", false, "no candidates");
  }

  // L done
  await page.getByTestId("cover-edit-done").click();
  await page.waitForURL(/\/album\/[^/]+\/edit\/?$/, { timeout: 15000 });
  log("L 完了", /\/edit\/?$/.test(new URL(page.url()).pathname), page.url());

  // M back
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/cover/edit`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector(".cover-edit-page", { timeout: 20000 });
  await page.getByTestId("cover-edit-back").click();
  await page.waitForURL(/\/album\/[^/]+\/edit\/?$/, { timeout: 15000 });
  log("M 戻る", /\/edit\/?$/.test(new URL(page.url()).pathname), page.url());

  // final 390 compare shot
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/cover/edit`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector(".cover-edit-page", { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/e2e-390-viewport.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/e2e-390-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/after-390-viewport.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/after-390-full.png`, fullPage: true });
  log("390px screenshot", true, `${OUT}/e2e-390-viewport.png`);

  const serious = consoleErrors.filter(
    (e) =>
      !e.includes("photo-analysis") &&
      !e.includes("503") &&
      !e.includes("Download the React DevTools") &&
      !e.includes("Largest Contentful Paint"),
  );
  log("console major errors", serious.length === 0, serious.slice(0, 5).join(" | "));
} catch (err) {
  log("suite", false, String(err));
  try {
    await page.screenshot({ path: `${OUT}/e2e-error.png`, fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
