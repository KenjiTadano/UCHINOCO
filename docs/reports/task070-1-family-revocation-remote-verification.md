# Task070.1 — Family Revocation Boundary & Remote Verification

## Summary

Task070 family sharing was applied to the linked remote Supabase project and
verified with a rollback-only, four-identity database probe. A removed member
can no longer read the shared pet or photos, mutate their previously uploaded
photo or AI-analysis row, upload a new photo, or read/upload the pet's private
Storage objects. The photo and uploader attribution remain intact for the
owner.

## Revocation boundary

The effective `photos` policies require both conditions for a member mutation:

- `uploader_user_id = auth.uid()`
- `can_access_pet(pet_id)` at the time of the operation

`DELETE` additionally permits the pet owner. Removing the `MEMBER` row makes
`can_access_pet()` false immediately, so the former uploader's SELECT, UPDATE,
DELETE, and new INSERT paths all close without changing or deleting the photo.

The same current-access condition is applied to:

- `photo_ai_analyses` INSERT/UPDATE
- `save_photo_analysis_result()`
- `pet-photos` and `pet-photo-thumbnails` SELECT/INSERT/DELETE policies
- family-readable photo and album queries

`photo_pets` has no direct authenticated INSERT/UPDATE/DELETE grant. Its bounded
RPCs remain owner-scoped, and the primary relation trigger is not a client API.

## Remote migrations

Applied:

1. `20261007120000_family_sharing.sql`
2. `20261007130000_fix_family_invite_rpc.sql`

The initial real-database invite probe exposed an ambiguous PL/pgSQL reference
between the RPC output column `expires_at` and the table column with the same
name. Because the first migration had already been applied, it was not edited.
The second migration qualifies all invite table columns and replaces only
`create_pet_family_invite()`.

Final `migration list` shows matching local/remote versions. Final
`db push --dry-run` reports the remote database is up to date with zero pending
migrations.

The generated TypeScript database definition was refreshed from the linked
remote schema and contains the family tables and RPC signatures.

## Remote transaction probe

The probe used four existing Auth identities as OWNER, MEMBER, NON_MEMBER, and
REVOKED_MEMBER. All fixture rows were created inside one transaction and the
transaction was rolled back. No IDs, emails, invite token values, signed URLs,
or object paths were printed.

Verified results:

- OWNER can read the pet and a family-uploaded photo.
- MEMBER can accept a matching invite, read the pet/photos, upload, update and
  delete their own photo before revocation.
- NON_MEMBER cannot read the pet, photo, or private object row.
- REVOKED_MEMBER cannot read the pet/photo/private object, update or delete the
  old photo, update its AI analysis, or upload a new photo/object.
- OWNER retains the revoked member's old photo and can delete/manage it.
- Photo deletion cascades related photo data according to the existing schema;
  revocation itself does not delete the photo.
- Duplicate invitation, wrong-account acceptance, revoked-token reuse, and
  expired-token reuse are rejected.
- A member's own upload is not returned as FAMILY_NEW to that member.
- The member upload is returned as FAMILY_NEW to the owner.
- `mark_pet_family_activity_seen()` removes the already-seen activity from the
  next result.

Probe result: `PASS`.

## Storage verification

Remote bucket metadata confirms these buckets remain private:

- `pet-avatars`
- `pet-photos`
- `pet-photo-thumbnails`

The rollback probe verified accepted-member object INSERT/SELECT and revoked
member INSERT/SELECT denial. Remote `pg_policies` inspection confirmed photo
and thumbnail DELETE requires current `is_accessible_pet()` plus either the
authenticated uploader path prefix or `is_pet_owner()`.

Direct SQL deletion from `storage.objects` is intentionally rejected by
Supabase's `storage.protect_delete()` trigger, so DELETE was not executed as a
raw SQL probe. The policy condition was verified remotely; a final Storage API
E2E with real browser sessions remains appropriate after deployment.

## Regression verification

- Focused family/search tests: `20/20` passed.
- Full `tests/*.test.mjs` suite: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Scoped ESLint: passed with no warnings or errors.
- `git diff --check`: passed.
- Build retains the existing Rosetta 2 performance warning only.

Photo Intake, album candidate reads, search, UCHINOCO NOW family activity, and
accepted/ordered/finalized owner-only mutation boundaries remain unchanged.

## Remaining verification

- Run one browser-level two-account Storage E2E after the application code is
  deployed: member upload/read, owner read, revoke, then confirm old signed URL
  renewal and new upload/delete requests fail for the former member.
- Transactional delivery of family invitation emails remains outside Task070.1;
  the existing secure-link sharing flow is unchanged.

## Git

No commit or push was performed.
