# Task070 — Family Sharing & Family Activity

## Family model

- `pet_family_members` is the pet-scoped access list. `OWNER` is synchronized from `pets.owner_user_id`; accepted invitees are `MEMBER`.
- Sharing never transfers ownership. Pet editing, family management, album acceptance/generation, print, and orders remain owner-only.
- A member can read the shared pet, shared photos and albums, upload photos, and manage only photos they uploaded.

## Invite flow

- The owner enters an email on `/pets/[petId]/family`.
- The server generates a high-entropy token, stores only its SHA-256 hash, and returns a seven-day invite link.
- Acceptance at `/family/invite/[token]` compares the authenticated account email with the normalized invite email inside an atomic database function.
- Pending duplicate invites, self-invites, expired/revoked/already-used tokens, wrong-account acceptance, and non-owner invitation/revocation are rejected. Invalid and inaccessible tokens share the same user-facing error.
- The initial release exposes a secure share link. Transactional email delivery is not added by this task.

## RLS and Storage

- `can_access_pet()` is the common database boundary for owner or accepted member reads.
- Pets, photos, photo relations, AI-analysis reads, albums, album photos, and persisted album-draft display rows have family read policies.
- Photo insert requires `uploader_user_id = auth.uid()`. Photo update is uploader-only. Delete permits the uploader or pet owner.
- `pet-avatars`, `pet-photos`, and `pet-photo-thumbnails` remain private. Reads require pet access. Photo and thumbnail uploads must use the authenticated uploader as path segment 1 and an accessible pet as segment 2. Avatar writes remain owner-only.
- Removing a member deletes only the membership/read-state rows. Existing photos remain owned by their uploader and visible to the owner.

## Photo and album integration

- The existing browser-to-Storage upload, thumbnail/preview, photo row, AI queue, and intake flow is reused; no family-specific AI pipeline was added.
- The primary `photo_pets` trigger guard now permits a member uploader who has accepted access to that pet.
- Timeline, dashboard, facets, keyword search, and pagination functions include all accessible photos instead of filtering to the current uploader.
- Album composition guards accept photos uploaded by a family member when the photo belongs to an album pet. Members receive read-only album access; creation, editing, acceptance, print, and orders remain owner-only.

## FAMILY_NEW

- `pet_family_activity_reads.last_seen_at` stores per-user, per-pet read state.
- `get_family_new_photo_activity()` counts only photos uploaded by another user after that timestamp.
- UCHINOCO NOW receives real activity data at the existing `FAMILY_NEW` priority. The CTA opens the family page, where the user can inspect thumbnails and explicitly mark activity as seen.
- No member name, email, photo path, or token is written to analytics.

## Migration

- Added `20261007120000_family_sharing.sql`.
- It is local only. Remote migration was not applied.
- `npx supabase db push --dry-run` succeeded and identified this migration as the only new migration to apply.

## Verification

- Full test suite: passed (`937` tests).
- Task070 family-sharing tests and memory-discovery regression tests: passed (`17/17`).
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- Scoped ESLint: passed with no errors. Two pre-existing `<img>` performance warnings remain in the album list page.
- Whitespace validation: `git diff --check` passed.
- No remote database mutation, commit, or push was performed.

## Remaining considerations

- Production email delivery for invite links remains a separate integration; the current secure link can be shared manually.
- The migration should be applied in a staging project and verified with two real Auth accounts before production.
- Because the migration was intentionally not applied remotely, the final two-account Auth/RLS/Storage E2E remains pending; the automated suite validates the policy/RPC and application boundaries structurally.
- Multi-pet album writes remain owner-only. Family visibility follows access to at least one linked album pet, while unrelated pet rows remain hidden by pet RLS.
- Existing completed/ordered/finalized album and order mutation paths were not broadened.

## Commit / push

Not performed.
