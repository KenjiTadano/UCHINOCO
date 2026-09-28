import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shellViewParam } from "../lib/app-shell-view.ts";

const header = readFileSync(
  new URL("../app/(app)/pets/[petId]/album/_components/order-flow-header.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("../app/(app)/_components/app-shell.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../app/(app)/layout.tsx", import.meta.url),
  "utf8",
);

test("OrderFlowHeader does not read time, randomness, window, or locale", () => {
  assert.equal(header.includes("suppressHydrationWarning"), false);
  assert.equal(/\bDate\b|\bMath\.random\b|\bwindow\b|toLocale|useSearchParams|usePathname/.test(header), false);
});

test("search params for checkout do not change the order shell", () => {
  const params = new URLSearchParams("product=standard&pages=20&snapshot=abc");
  assert.equal(shellViewParam(params), null);
});

test("the app shell fallback still renders the page", () => {
  assert.match(shell, /fallback=\{<AppShellFrame[^>]*viewParam=\{null\}/);
  assert.match(shell, /\{children\}/);
  assert.equal(layout.includes("fallback={null}"), false);
});
