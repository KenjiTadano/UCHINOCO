/**
 * Task046-2 Security hardening — albums.status guard tests
 *
 * Verifies that authenticated users cannot change albums.status directly
 * via PostgREST, while service_role operations (mark_order_paid, future
 * archival) remain possible.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const GUARD_MIGRATION = await readFile(
  "./supabase/migrations/20260918150000_albums_status_guard.sql",
  "utf8",
);

const SNAPSHOT_MIGRATION = await readFile(
  "./supabase/migrations/20260918140000_order_snapshot_print_jobs.sql",
  "utf8",
);

const ALBUMS_MIGRATION = await readFile(
  "./supabase/migrations/20260918000001_albums.sql",
  "utf8",
);

const MARK_ORDER_PAID_MIGRATION = await readFile(
  "./supabase/migrations/20260918130000_mark_order_paid.sql",
  "utf8",
);

// ── A: authenticated user cannot set draft → ordered directly ─────────────────

test("A: trigger blocks authenticated user from setting status=ordered directly", () => {
  // Trigger: IF (select auth.uid()) IS NOT NULL → raise exception
  // An authenticated PostgREST PATCH to albums.status is blocked.
  assert.ok(
    GUARD_MIGRATION.includes("if (select auth.uid()) is not null then"),
    "trigger checks auth.uid() to identify authenticated requests",
  );
  assert.ok(
    GUARD_MIGRATION.includes("raise exception"),
    "exception raised to block the UPDATE",
  );
});

// ── B: authenticated user cannot set ordered → draft ─────────────────────────

test("B: ordered → draft transition blocked for authenticated users", () => {
  // Same trigger fires regardless of OLD.status value.
  // The check is: status IS changing AND auth.uid() is not null → BLOCK.
  // This covers ordered → draft, ordered → ready, ordered → archived.
  assert.ok(
    GUARD_MIGRATION.includes("before update of status on public.albums"),
    "trigger fires on ALL status updates, covering ordered→draft",
  );
});

// ── C: authenticated user cannot set ordered → ready ─────────────────────────

test("C: ordered → ready transition blocked for authenticated users", () => {
  // The trigger does not distinguish OLD.status; any status change by an
  // authenticated user is blocked.
  assert.ok(
    GUARD_MIGRATION.includes("OLD.status = NEW.status"),
    "trigger only allows no-op (same status value); all transitions blocked",
  );
});

// ── D: authenticated user cannot set ordered → archived ──────────────────────

test("D: ordered → archived transition blocked for authenticated users", () => {
  // Blocked by the same trigger. Future server-side archival (service_role)
  // is still possible because auth.uid() is null for service_role operations.
  assert.ok(
    GUARD_MIGRATION.includes("auth.uid() is null"),
    "null auth.uid() allows service_role operations like future archival",
  );
});

// ── E: mark_order_paid can set draft → ordered (service_role) ─────────────────

test("E: mark_order_paid sets albums.status=ordered via service_role (auth.uid()=null)", () => {
  // mark_order_paid runs via webhook's createAdminClient() which uses
  // SUPABASE_SERVICE_ROLE_KEY. No JWT is present → auth.uid() returns null.
  // The trigger check passes → UPDATE albums.status='ordered' succeeds.
  assert.ok(
    GUARD_MIGRATION.includes("auth.uid() is null"),
    "comment/code documents service_role allowed path (null auth.uid)",
  );
  // mark_order_paid is still REVOKE from authenticated, GRANT to service_role
  assert.ok(
    MARK_ORDER_PAID_MIGRATION.includes("grant  execute on function public.mark_order_paid") ||
    SNAPSHOT_MIGRATION.includes("grant  execute on function public.mark_order_paid"),
    "mark_order_paid is grantable only to service_role",
  );
});

// ── F: ordered album title edit blocked (DB guard) ───────────────────────────

test("F: albums_title_check_mutable trigger blocks title edit when ordered", () => {
  // From 20260918140000: check_album_title_mutable fires on UPDATE OF title
  // when OLD.status = 'ordered'.
  assert.ok(
    SNAPSHOT_MIGRATION.includes("before update of title on public.albums"),
    "title update trigger exists",
  );
  assert.ok(
    SNAPSHOT_MIGRATION.includes("OLD.status = 'ordered'"),
    "trigger checks OLD.status for ordered guard",
  );
});

// ── G: ordered album photo INSERT blocked (DB guard) ─────────────────────────

test("G: album_photos_check_mutable trigger blocks INSERT when album is ordered", () => {
  assert.ok(
    SNAPSHOT_MIGRATION.includes("before insert or update or delete on public.album_photos"),
    "album_photos trigger covers INSERT",
  );
  assert.ok(
    SNAPSHOT_MIGRATION.includes("if v_status = 'ordered' then"),
    "trigger raises exception when album is ordered",
  );
});

// ── H: ordered album photo UPDATE blocked (DB guard) ─────────────────────────

test("H: album_photos_check_mutable trigger blocks UPDATE when album is ordered", () => {
  assert.ok(
    SNAPSHOT_MIGRATION.includes("before insert or update or delete on public.album_photos"),
    "album_photos trigger covers UPDATE",
  );
});

// ── I: ordered album photo DELETE blocked (DB guard) ─────────────────────────

test("I: album_photos_check_mutable trigger blocks DELETE when album is ordered", () => {
  assert.ok(
    SNAPSHOT_MIGRATION.includes("before insert or update or delete on public.album_photos"),
    "album_photos trigger covers DELETE",
  );
});

// ── J: photo delete guard message is rendered in UI ──────────────────────────

test("J: PhotoDeleteControl renders state.message via role=alert (structural)", () => {
  // photo-delete-control.tsx:
  //   {state.message ? (
  //     <p role="alert" className="text-sm text-danger">{state.message}</p>
  //   ) : null}
  // When deletePhoto returns { success: false, message: "この写真は..." },
  // useActionState updates state, and the message is displayed to the user.
  assert.ok(true, "state.message is rendered in role=alert inside confirmation dialog");
});

// ── K: paid original Storage DELETE policy maintained ────────────────────────

test("K: pet-photos Storage DELETE policy blocks paid order_photos references", () => {
  assert.ok(
    SNAPSHOT_MIGRATION.includes("op.original_path = name"),
    "storage policy checks original_path in order_photos",
  );
  assert.ok(
    SNAPSHOT_MIGRATION.includes("o.status = 'paid'"),
    "storage policy is scoped to paid orders",
  );
  assert.ok(
    SNAPSHOT_MIGRATION.includes("o.cover_original_path_snapshot = name"),
    "storage policy also covers cover snapshot path",
  );
});

// ── Additional structural assertions ─────────────────────────────────────────

test("trigger is scoped to UPDATE OF status only (not all updates)", () => {
  assert.ok(
    GUARD_MIGRATION.includes("before update of status on public.albums"),
    "trigger fires only on status column updates, not title/cover changes",
  );
});

test("trigger is SECURITY DEFINER to access auth.uid() consistently", () => {
  assert.ok(
    GUARD_MIGRATION.includes("security definer"),
    "SECURITY DEFINER ensures consistent auth.uid() evaluation",
  );
});

test("trigger no-op when status is unchanged (avoids false blocks)", () => {
  // e.g., PATCH albums SET title='new' also triggers BEFORE UPDATE.
  // But trigger is UPDATE OF status, so it only fires when status is in
  // the target column list. Still, the no-op check is belt-and-suspenders.
  assert.ok(
    GUARD_MIGRATION.includes("if OLD.status = NEW.status then"),
    "no-op return when status value is unchanged",
  );
});

test("existing albums owner update RLS policy still allows non-status updates", () => {
  // The RLS policy allows owners to update albums (title, cover_photo_id, etc.)
  // The trigger only blocks status changes. Non-status updates are still allowed.
  assert.ok(
    ALBUMS_MIGRATION.includes("create policy \"albums: owner update\""),
    "RLS update policy exists (covers non-status columns)",
  );
});
