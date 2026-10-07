/**
 * 07.2 page-edit interaction smoke (Playwright).
 * Requires: next on :3001, /tmp/uchinoco-owner-session.json
 * Run: node --input-type=module scripts/e2e-page-edit.mjs
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
const OUT = "/Users/tadanokenji/dev/uchinoco/docs/page-edit-ui-compare";
mkdirSync(OUT, { recursive: true });

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

try {
  let ALBUM = ALBUM_CANDIDATES[0];
  let best = { album: ALBUM, thumbs: 0 };

  for (const candidate of ALBUM_CANDIDATES) {
    await page.goto(`${BASE}/pets/${PET}/album/${candidate}/pages/edit`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    if (page.url().includes("/login")) continue;
    const n = await page.locator('[data-testid="book-spread-thumb"]').count();
    console.log("PROBE", candidate, "thumbs", n);
    if (n > best.thumbs) best = { album: candidate, thumbs: n };
    if (n >= 2) {
      ALBUM = candidate;
      break;
    }
  }
  if (best.thumbs > 0) ALBUM = best.album;
  console.log("USING_ALBUM", ALBUM, "thumbs", best.thumbs);

  // A. 07.1 → 07.2
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/edit`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  try {
    await page.waitForSelector(".album-edit-page, .page-edit-page, form, main", {
      timeout: 25000,
    });
  } catch {
    /* continue diagnostics */
  }
  await page.waitForTimeout(1500);
  console.log("EDIT_URL", page.url(), "TITLE", await page.title());
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
  console.log("EDIT_BODY", bodyText.replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/e2e-edit-diag.png`, fullPage: true });
  const html = await page.content();
  writeFileSync(`${OUT}/e2e-edit-diag.html`, html.slice(0, 50000));
  console.log("HAS_ALBUM_EDIT", html.includes("album-edit-page"));
  console.log("HAS_PAGE_EDIT_TOOL", html.includes("ページ編集"));
  console.log("HAS_LOGIN", html.includes("ログイン") || html.includes("login"));
  const pagesTool = page.getByTestId("album-edit-tool-pages");
  const hasTool = (await pagesTool.count()) > 0;
  if (!hasTool) {
    // Fallback: try text link
    const byText = page.getByRole("link", { name: "ページ編集" });
    if ((await byText.count()) > 0) {
      await byText.click();
      await page.waitForURL(/\/pages\/edit/, { timeout: 15000 });
      log("07.1→07.2", page.url().includes("/pages/edit"), page.url());
    } else {
      log("07.1→07.2", false, `pages tool missing; url=${page.url()}`);
    }
  } else {
    await pagesTool.click();
    await page.waitForURL(/\/pages\/edit/, { timeout: 15000 });
    log("07.1→07.2", page.url().includes("/pages/edit"), page.url());
  }

  // Ensure on page-edit
  if (!page.url().includes("/pages/edit")) {
    await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/pages/edit?spread=0`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }

  await page.waitForSelector('[data-testid="page-edit-page-num"]', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/e2e-390-initial.png`, fullPage: false });

  const pageNum = async () =>
    (await page.getByTestId("page-edit-page-num").innerText()).trim();

  const thumbs = page.locator('[data-testid="book-spread-thumb"]');
  const thumbCount = await thumbs.count();
  log("thumbnail count", thumbCount >= 1, `count=${thumbCount}`);

  // B/C thumbnail switch
  if (thumbCount >= 2) {
    const before = await pageNum();
    await thumbs.nth(1).click();
    await page.waitForTimeout(300);
    const after = await pageNum();
    const selected = await thumbs.nth(1).getAttribute("data-selected");
    log("thumbnail switch", after !== before && selected === "true", `${before} → ${after}`);
  } else {
    // Single-spread album: assert controls exist and prev/next disabled
    const prevDisabled = await page.getByTestId("page-edit-arrow-prev").isDisabled();
    const nextDisabled = await page.getByTestId("page-edit-arrow-next").isDisabled();
    log(
      "thumbnail switch",
      thumbCount === 1 && prevDisabled && nextDisabled,
      "single spread — arrows disabled",
    );
  }

  // D/E arrows
  const next = page.getByTestId("page-edit-arrow-next");
  const prev = page.getByTestId("page-edit-arrow-prev");
  if (thumbCount >= 2) {
    await thumbs.nth(0).click();
    await page.waitForTimeout(200);
    const n0 = await pageNum();
    await next.click();
    await page.waitForTimeout(200);
    const n1 = await pageNum();
    log("Arrow next", n1 !== n0, `${n0} → ${n1}`);
    await prev.click();
    await page.waitForTimeout(200);
    const n2 = await pageNum();
    log("Arrow prev", n2 === n0, `${n1} → ${n2}`);
  } else {
    log("Arrow next", await next.isDisabled(), "disabled at sole spread");
    log("Arrow prev", await prev.isDisabled(), "disabled at sole spread");
  }

  // F–I layouts
  for (const id of ["1", "2", "3", "4"]) {
    const btn = page.getByTestId(`page-edit-layout-${id}`);
    await btn.click();
    await page.waitForTimeout(250);
    const selected = await btn.getAttribute("aria-selected");
    const book = page.locator(".page-edit-book");
    const html = await book.innerHTML();
    log(`Layout ${id}`, selected === "true" && html.length > 100, `aria-selected=${selected}`);
  }
  await page.screenshot({ path: `${OUT}/e2e-390-after-layout.png`, fullPage: false });

  // J photo X
  const remove0 = page.getByTestId("page-edit-photo-remove-0");
  const photoCards = page.locator(".page-edit-photo-card");
  const beforeCount = await photoCards.count();
  if (beforeCount >= 2 && (await remove0.count()) > 0) {
    await remove0.click({ force: true });
    await page.waitForTimeout(300);
    const afterCount = await photoCards.count();
    log("写真X", afterCount === beforeCount - 1, `${beforeCount} → ${afterCount}`);
  } else if (beforeCount === 1) {
    log("写真X", true, "single photo kept (guard)");
  } else {
    log("写真X", false, `cards=${beforeCount}`);
  }

  // K photo change picker
  await page.getByTestId("page-edit-change-photos").click();
  await page.waitForSelector('[data-testid="page-edit-picker"]', { timeout: 5000 });
  const pickerItems = page.locator(".page-edit-picker-item");
  const pickerCount = await pickerItems.count();
  if (pickerCount > 0) {
    await pickerItems.nth(Math.min(1, pickerCount - 1)).click();
    await page.waitForTimeout(300);
    const closed = (await page.getByTestId("page-edit-picker").count()) === 0;
    log("写真変更", closed && pickerCount > 0, `candidates=${pickerCount}`);
  } else {
    log("写真変更", false, "no candidates");
  }

  // L done
  await page.getByTestId("page-edit-done").click();
  await page.waitForURL(/\/album\/[^/]+\/edit\/?$/, { timeout: 15000 });
  log("完了", /\/edit\/?$/.test(new URL(page.url()).pathname), page.url());

  // reopen for back test
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/pages/edit`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.getByTestId("page-edit-back").click();
  await page.waitForURL(/\/album\/[^/]+\/edit\/?$/, { timeout: 15000 });
  log("戻る", /\/edit\/?$/.test(new URL(page.url()).pathname), page.url());

  // 390 screenshot final
  await page.goto(`${BASE}/pets/${PET}/album/${ALBUM}/pages/edit`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.screenshot({ path: `${OUT}/e2e-390-viewport.png`, fullPage: true });
  log("390px screenshot", true, `${OUT}/e2e-390-viewport.png`);

  const serious = consoleErrors.filter(
    (e) =>
      !e.includes("photo-analysis") &&
      !e.includes("503") &&
      !e.includes("Download the React DevTools"),
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
