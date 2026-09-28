import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildCancelUrl,
  buildSuccessUrl,
  resolveCheckoutSiteUrl,
} from "../lib/checkout-session-helpers.ts";

const PET = "8bec8241-a4a4-4aa1-9051-5ef2bddd7277";
const ALBUM = "ffa361ca-bb60-4949-af65-e2f0448dfa08";
const ORDER = "2216f157-a744-48d2-b617-853fdbd6afae";

test("development success URL uses the loopback dev server port", () => {
  const siteUrl = resolveCheckoutSiteUrl({
    envSiteUrl: "http://localhost:3000",
    nodeEnv: "development",
    requestHost: "localhost:3001",
    requestProto: "http",
  });
  const success = buildSuccessUrl(siteUrl, PET, ALBUM, ORDER);
  assert.equal(siteUrl, "http://localhost:3001");
  assert.ok(success.startsWith("http://localhost:3001/pets/"));
  assert.ok(success.includes(`order/${ORDER}?session_id={CHECKOUT_SESSION_ID}`));
});

test("production success URL stays on the canonical env origin", () => {
  const siteUrl = resolveCheckoutSiteUrl({
    envSiteUrl: "https://uchinoco.example/",
    nodeEnv: "production",
    requestHost: "evil.example",
    requestProto: "https",
  });
  const success = buildSuccessUrl(siteUrl, PET, ALBUM, ORDER);
  assert.equal(siteUrl, "https://uchinoco.example");
  assert.ok(success.startsWith("https://uchinoco.example/pets/"));
  assert.equal(success.includes("evil.example"), false);
});

test("production without a canonical URL fails closed", () => {
  assert.throws(
    () => resolveCheckoutSiteUrl({
      envSiteUrl: "",
      nodeEnv: "production",
      requestHost: "localhost:3001",
    }),
    /NEXT_PUBLIC_SITE_URL/,
  );
});

test("cancel URL uses the same dev origin and carries no address", () => {
  const siteUrl = resolveCheckoutSiteUrl({
    envSiteUrl: "http://localhost:3000",
    nodeEnv: "development",
    requestHost: "127.0.0.1:3001",
  });
  const cancel = buildCancelUrl(siteUrl, PET, ALBUM, "standard", 20);
  assert.equal(
    cancel,
    `http://127.0.0.1:3001/pets/${PET}/album/${ALBUM}/checkout?product=standard&pages=20&cancelled=1`,
  );
});

test("non-loopback hosts are ignored outside production", () => {
  const siteUrl = resolveCheckoutSiteUrl({
    envSiteUrl: "http://localhost:3000",
    nodeEnv: "development",
    requestHost: "preview.example",
  });
  assert.equal(siteUrl, "http://localhost:3000");
});

test("checkout action does not read the Host header in production", () => {
  const source = readFileSync(
    new URL("../app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /resolveCheckoutSiteUrl/);
  assert.equal(source.includes('?? "http://localhost:3000"'), false);
});
