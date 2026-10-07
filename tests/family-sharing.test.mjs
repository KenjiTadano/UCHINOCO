import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261007120000_family_sharing.sql", import.meta.url),
  "utf8",
);
const uploadActions = readFileSync(
  new URL("../app/(app)/pets/[petId]/photos/actions.ts", import.meta.url),
  "utf8",
);
const photoPage = readFileSync(
  new URL("../app/(app)/pets/[petId]/photos/[photoId]/page.tsx", import.meta.url),
  "utf8",
);
const familyActions = readFileSync(
  new URL("../app/(app)/pets/[petId]/family/actions.ts", import.meta.url),
  "utf8",
);
const homePage = readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8");

test("Task070: family membership is pet scoped with OWNER and MEMBER roles", () => {
  assert.match(migration, /create table public\.pet_family_members/);
  assert.match(migration, /role in \('OWNER', 'MEMBER'\)/);
  assert.match(migration, /primary key \(pet_id, user_id\)/);
  assert.match(migration, /create function public\.can_access_pet/);
});

test("Task070: invitation stores only a SHA-256 hash and enforces lifecycle", () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'/);
  assert.match(migration, /expires_at <= now\(\)/);
  assert.match(migration, /invitee_email <> v_email/);
  assert.doesNotMatch(migration, /token text not null/);
  assert.match(familyActions, /crypto\.subtle\.digest\("SHA-256"/);
});

test("Task070: duplicate, self, revoked, expired and wrong-account invites are rejected", () => {
  assert.match(migration, /v_email = v_self_email/);
  assert.match(migration, /pet_family_invites_pending_email_idx/);
  assert.match(migration, /v_invite\.status <> 'PENDING'/);
  assert.match(migration, /v_invite\.expires_at <= now\(\)/);
  assert.match(migration, /v_invite\.invitee_email <> v_email/);
});

test("Task070: RLS exposes shared reads but preserves owner and uploader mutation boundaries", () => {
  assert.match(migration, /pets: family member select/);
  assert.match(migration, /photos: family select/);
  assert.match(migration, /photos: family insert/);
  assert.match(migration, /photos: uploader update/);
  assert.match(migration, /photos: uploader or owner delete/);
  assert.match(migration, /albums: family select/);
  assert.match(migration, /album_photos: family select/);
});

test("Task070: member uploads retain authenticated uploader and use accessible pet guard", () => {
  assert.match(uploadActions, /async function accessiblePet/);
  assert.match(uploadActions, /uploader_user_id: user\.id/);
  assert.match(uploadActions, /path = `\$\{user\.id\}\/\$\{petId\}/);
  assert.doesNotMatch(uploadActions, /async function ownedPet/);
});

test("Task070: another member's photo is readable but edit controls are uploader-only", () => {
  assert.match(photoPage, /\.eq\("id", photoId\)\.eq\("pet_id", petId\)\.maybeSingle/);
  assert.match(photoPage, /const canEditPhoto = photo\.uploader_user_id === user\.id/);
  assert.match(photoPage, /canEditPhoto \? <PhotoEditControls/);
  assert.match(photoPage, /const canDeletePhoto = canEditPhoto \|\| pet\.owner_user_id === user\.id/);
  assert.match(photoPage, /canDeletePhoto \? <PhotoDeleteControl/);
});

test("Task070: private Storage reads are pet scoped and writes remain caller-prefixed", () => {
  for (const bucket of ["pet-avatars", "pet-photos", "pet-photo-thumbnails"]) {
    assert.match(migration, new RegExp(`bucket_id = '${bucket}'`));
  }
  assert.match(migration, /Users can view photos for accessible pets/);
  assert.match(migration, /Users can view thumbnails for accessible pets/);
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/);
});

test("Task070: family activity is real, unread, and connected to NOW", () => {
  assert.match(migration, /create table public\.pet_family_activity_reads/);
  assert.match(migration, /p\.uploader_user_id <> \(select auth\.uid\(\)\)/);
  assert.match(migration, /p\.created_at > coalesce\(r\.last_seen_at/);
  assert.match(homePage, /get_family_new_photo_activity/);
  assert.match(homePage, /familyActivity: familyActivityCount > 0/);
});

test("Task070: member removal revokes access without deleting photos", () => {
  const removeBody = migration.match(/create function public\.remove_pet_family_member[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(removeBody, /delete from public\.pet_family_members/);
  assert.doesNotMatch(removeBody, /delete from public\.photos/);
});

test("Task070.1: revoked uploaders lose every photo mutation boundary", () => {
  const updatePolicy =
    migration.match(/create policy "photos: uploader update"[\s\S]*?;/)?.[0] ?? "";
  const deletePolicy =
    migration.match(/create policy "photos: uploader or owner delete"[\s\S]*?;/)?.[0] ?? "";
  const analysisPolicies = migration.slice(
    migration.indexOf('create policy "photo analyses: family select"'),
    migration.indexOf("create or replace function public.save_photo_analysis_result"),
  );

  assert.match(updatePolicy, /uploader_user_id = \(select auth\.uid\(\)\)/);
  assert.match(updatePolicy, /public\.can_access_pet\(pet_id\)/);
  assert.match(deletePolicy, /public\.can_access_pet\(pet_id\)/);
  assert.match(deletePolicy, /uploader_user_id = \(select auth\.uid\(\)\)/);
  assert.match(deletePolicy, /public\.is_pet_owner\(pet_id\)/);
  assert.match(analysisPolicies, /p\.uploader_user_id = \(select auth\.uid\(\)\)/);
  assert.match(analysisPolicies, /public\.can_access_pet\(p\.pet_id\)/);
});

test("Task070.1: revoked members lose Storage read, upload, and delete access", () => {
  const storageSection = migration.slice(
    migration.indexOf("-- Private Storage"),
    migration.indexOf("-- Family-readable pagination/search"),
  );

  assert.match(storageSection, /Users can upload photos for accessible pets/);
  assert.match(storageSection, /Users can view photos for accessible pets/);
  assert.match(storageSection, /Users can delete photos for accessible pets/);
  assert.match(storageSection, /Users can upload thumbnails for accessible pets/);
  assert.match(storageSection, /Users can view thumbnails for accessible pets/);
  assert.match(storageSection, /Users can delete thumbnails for accessible pets/);
  assert.ok((storageSection.match(/public\.is_accessible_pet/g) ?? []).length >= 6);
});

test("Task070.1: photo relations have no direct client mutation grants", () => {
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]*public\.photo_pets to authenticated/i);
});

test("Task070: family photos participate in timeline, search, dashboard and album guards", () => {
  assert.match(migration, /create or replace function public\.get_pet_memories_page/);
  assert.match(migration, /create or replace function public\.search_photos_page/);
  assert.match(migration, /create or replace function public\.get_dashboard_photos/);
  assert.match(migration, /create or replace function public\.check_album_photo_pet_membership/);
  const familySection = migration.slice(migration.indexOf("create or replace function public.get_pet_memories_page"));
  assert.doesNotMatch(familySection, /p\.uploader_user_id = \(select auth\.uid\(\)\)/);
});
