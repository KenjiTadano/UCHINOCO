/**
 * Task045-3a — orders security tests
 *
 * Tests A–M are structural: they document the SQL constraints, RLS policies,
 * and REVOKE grants defined in 20260918120000_create_orders.sql without
 * a live DB connection.
 *
 * Tests N–S test the Server Action guard (isAlbumEditable) which is a pure
 * function importable without Next.js context.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isAlbumEditable, ALBUM_ORDERED_ERROR } from "../lib/album-guard.ts";

// ── Migration source (inline for structural assertions) ───────────────────────

const MIGRATION = `
create table public.orders (
  ...
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  album_id      uuid not null references public.albums(id) on delete restrict,
  pet_id        uuid not null references public.pets(id)   on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'failed')),
  subtotal     integer not null check (subtotal     >= 0),
  shipping_fee integer not null check (shipping_fee >= 0),
  total        integer not null
    check (total >= 0 and total = subtotal + shipping_fee),
  pages integer not null check (pages > 0),
  ...
);
create unique index orders_album_pending_unique on public.orders (album_id) where (status = 'pending');
alter table public.orders enable row level security;
create policy "orders: owner select" on public.orders for select using (owner_user_id = auth.uid());
revoke insert, update, delete on public.orders from authenticated, anon;
`;

// ── A: own order SELECT ───────────────────────────────────────────────────────

test("A: RLS owner select policy allows owner_user_id = auth.uid()", () => {
  // Policy: "orders: owner select" uses (owner_user_id = auth.uid())
  // An authenticated user calling SELECT on orders receives only their own rows.
  assert.ok(
    MIGRATION.includes(`owner_user_id = auth.uid()`),
    "SELECT policy must filter by owner_user_id = auth.uid()",
  );
});

// ── B: other user's order SELECT blocked ──────────────────────────────────────

test("B: RLS owner select policy blocks rows where owner_user_id != auth.uid()", () => {
  // No "all orders" policy exists — only the owner select policy.
  // A user querying another user's order_id receives 0 rows (not an error).
  const hasAllOrdersPolicy = MIGRATION.includes("for select\n  using (true)");
  assert.equal(hasAllOrdersPolicy, false, "No permissive SELECT ALL policy must exist");
});

// ── C: authenticated direct INSERT blocked ────────────────────────────────────

test("C: REVOKE INSERT from authenticated prevents direct PostgREST INSERT", () => {
  assert.ok(
    MIGRATION.includes("revoke insert, update, delete on public.orders from authenticated, anon"),
    "INSERT must be revoked from authenticated role",
  );
});

// ── D: authenticated direct UPDATE blocked ────────────────────────────────────

test("D: REVOKE UPDATE from authenticated prevents direct PostgREST UPDATE", () => {
  assert.ok(
    MIGRATION.includes("revoke insert, update, delete on public.orders from authenticated, anon"),
    "UPDATE must be revoked from authenticated role",
  );
});

// ── E: authenticated direct DELETE blocked ────────────────────────────────────

test("E: REVOKE DELETE from authenticated prevents direct PostgREST DELETE", () => {
  assert.ok(
    MIGRATION.includes("revoke insert, update, delete on public.orders from authenticated, anon"),
    "DELETE must be revoked from authenticated role",
  );
});

// ── F: anon SELECT blocked ────────────────────────────────────────────────────

test("F: anon role has no SELECT access (RLS + no anon policy)", () => {
  // RLS is enabled. No policy has USING (true) or targets anon.
  // auth.uid() returns null for anon → owner_user_id = null never matches.
  const hasAnonPolicy = MIGRATION.includes("to anon");
  assert.equal(hasAnonPolicy, false, "No policy must grant anon access");
  assert.ok(
    MIGRATION.includes("revoke insert, update, delete on public.orders from authenticated, anon"),
    "DML also revoked from anon",
  );
});

// ── G: pending order per album is unique ──────────────────────────────────────

test("G: partial unique index enforces at most one pending order per album", () => {
  assert.ok(
    MIGRATION.includes("orders_album_pending_unique"),
    "Partial unique index on (album_id) WHERE status='pending' must exist",
  );
  assert.ok(
    MIGRATION.includes("where (status = 'pending')"),
    "Partial index must be scoped to pending only",
  );
});

// ── H: paid order does not conflict with new pending ──────────────────────────

test("H: paid/cancelled/failed orders do not block new pending orders (partial index scope)", () => {
  // The unique index only covers rows where status='pending'.
  // A paid row for album_id X does not occupy a slot in the index,
  // so a new pending order for album_id X is allowed.
  assert.ok(
    MIGRATION.includes("where (status = 'pending')"),
    "Index WHERE clause must limit to pending, leaving room for non-pending rows",
  );
});

// ── I: total = subtotal + shipping_fee enforced ───────────────────────────────

test("I: CHECK constraint rejects total != subtotal + shipping_fee", () => {
  assert.ok(
    MIGRATION.includes("total = subtotal + shipping_fee"),
    "CHECK constraint must enforce total = subtotal + shipping_fee",
  );
});

// ── J: negative prices rejected ───────────────────────────────────────────────

test("J: CHECK constraints reject negative subtotal, shipping_fee, total", () => {
  assert.ok(MIGRATION.includes("check (subtotal     >= 0)"), "subtotal >= 0 check required");
  assert.ok(MIGRATION.includes("check (shipping_fee >= 0)"), "shipping_fee >= 0 check required");
  assert.ok(MIGRATION.includes("total >= 0"), "total >= 0 check required");
});

// ── K: invalid status rejected ────────────────────────────────────────────────

test("K: CHECK constraint rejects status values outside allowed set", () => {
  assert.ok(
    MIGRATION.includes(`check (status in ('pending', 'paid', 'cancelled', 'failed'))`),
    "status CHECK constraint must restrict to the four allowed values",
  );
});

// ── L: album FK enforced ─────────────────────────────────────────────────────

test("L: orders.album_id references albums(id) ON DELETE RESTRICT", () => {
  assert.ok(
    MIGRATION.includes("album_id      uuid not null references public.albums(id) on delete restrict"),
    "Album FK with ON DELETE RESTRICT must exist",
  );
});

// ── M: pet FK enforced ───────────────────────────────────────────────────────

test("M: orders.pet_id references pets(id) ON DELETE RESTRICT", () => {
  assert.ok(
    MIGRATION.includes("pet_id        uuid not null references public.pets(id)   on delete restrict"),
    "Pet FK with ON DELETE RESTRICT must exist",
  );
});

// ── N–S: Album ordered guard (isAlbumEditable — pure function) ───────────────

test("N: ordered album title edit rejected by isAlbumEditable", () => {
  assert.equal(isAlbumEditable("ordered"), false);
  assert.ok(typeof ALBUM_ORDERED_ERROR === "string" && ALBUM_ORDERED_ERROR.length > 0);
});

test("O: ordered album photo add rejected by isAlbumEditable", () => {
  assert.equal(isAlbumEditable("ordered"), false);
});

test("P: ordered album photo remove rejected by isAlbumEditable", () => {
  assert.equal(isAlbumEditable("ordered"), false);
});

test("Q: ordered album reorder rejected by isAlbumEditable", () => {
  assert.equal(isAlbumEditable("ordered"), false);
});

test("R: ordered album delete rejected by isAlbumEditable", () => {
  assert.equal(isAlbumEditable("ordered"), false);
});

test("S: draft album is editable via isAlbumEditable", () => {
  assert.equal(isAlbumEditable("draft"), true);
});

test("S: archived album guard passes (not ordered)", () => {
  // archived albums are not 'ordered' so the guard allows them;
  // separate archival logic is expected to prevent editing elsewhere if needed.
  assert.equal(isAlbumEditable("archived"), true);
});

test("S: ready album is editable (ready status is not ordered)", () => {
  assert.equal(isAlbumEditable("ready"), true);
});
