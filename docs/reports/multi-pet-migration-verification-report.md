# Multi-Pet Migration Production Verification

## Result

**Migration applied and core production verification passed.** The migration was applied to the linked, active `uchinoco` Supabase project in `ap-southeast-1`. No existing album rows were deleted or rewritten except for the required `album_pets` backfill and trigger/function installation. No commit or push was performed.

## Migration Review

Target: `supabase/migrations/20260930100000_multi_pet_albums.sql`

- Adds `public.album_pets` with a composite primary key `(album_id, pet_id)`, non-null UUID foreign keys to `albums` and `pets`, `ON DELETE CASCADE`, and a `created_at timestamptz NOT NULL DEFAULT now()` column.
- Adds an index on `(pet_id, album_id)`.
- Enables RLS, revokes general table privileges, and grants authenticated users `SELECT` and `INSERT` only. Policies require both the album owner and pet owner to equal `auth.uid()`.
- Backfills every existing album from its existing `albums.pet_id`. The migration aborts before changes if an album anchor pet is missing or has a different owner.
- Leaves `albums.pet_id` unchanged and NOT NULL, preserving existing routes, orders, and single-pet behavior. A trigger automatically records the anchor pet for newly inserted albums.
- Adds guards for album photos, covers, draft frames, and draft covers. They require the photo to belong to an album-selected pet and to have been uploaded by the album owner.
- Uses a transaction. No `DROP`, `TRUNCATE`, or row-deleting statement is present.

Before apply, the production database had 9 albums and 68 album photo rows, zero anchor-owner mismatches, and `albums.pet_id` was `NOT NULL`. The only pending migration was this file, confirmed with `supabase db push --linked --dry-run`.

## Apply And RLS

`supabase db push --linked --yes` succeeded. `supabase migration list --linked` then showed `20260930100000` applied remotely. The backfill produced 9 `album_pets` rows for the 9 existing albums, with zero missing anchor memberships or owner mismatches.

Post-apply inspection confirmed RLS enabled on `album_pets`, `albums`, `album_photos`, `album_draft_frames`, and `album_draft_covers`, along with the expected owner policies and membership triggers.

An RLS negative check ran in a rollback-only transaction using a different JWT subject: selecting the verification album's `album_pets` returned 0 rows, and inserting a membership was rejected by RLS. The transaction was rolled back. No RLS/database error occurred during the browser create, save, reload, or edit flow.

## Browser Verification

Using the authenticated local browser against the production-connected app:

- Created a single-pet album for わか. It persisted with one pet membership and 3 photos, all from わか.
- Created an album using 「すべて」. The form showed 48 candidate photos across わか and ヒメ; the completion screen showed both pets and 18 photos.
- Opened the multi-pet album after reload; both pet names and its persisted photo list were present. Opened the edit view and saved a temporary title, verified it after reload, then restored and saved the original generated title.
- Final database verification showed two selected pet memberships and 17 persisted album photos: わか 11, ヒメ 6, and zero photos whose pet was outside the album membership.

**Count discrepancy:** the multi-pet completion screen and first database check showed 18 photos (わか 12, ヒメ 6). A later database check and page reload showed 17 (わか 11, ヒメ 6). The title-update action only updates `albums.title`, so the cause of the one-photo difference was not established. The final database and reloaded page agree at 17; both pets remain represented and no unselected-pet photo is present. This should be investigated separately before treating the displayed generation count as fully reliable.

The two albums created for this production verification remain in the account as test records. The multi-pet title was restored to its generated value. Existing albums were otherwise retained.

## Automated Verification

- Related tests: **270 passed, 0 failed** (`node --test tests/album*.test.mjs tests/best-shot.test.mjs tests/editor-history.test.mjs tests/page-editor.test.mjs tests/smart-layout.test.mjs`)
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- Changed-scope ESLint: passed
- `git diff --check`: passed before this report was added; rerun after report creation is recorded in the task session.

## Remaining Issues

- Investigate the observed 18-to-17 photo count discrepancy; the final 17-row state is consistent between the database and reloaded page.
- The two verification albums remain in production account data and may be removed manually if desired.
- Migration application and browser validation do not constitute a broader multi-user production rollout assessment.

## Git

- Commit: not performed
- Push: not performed
- Pre-existing worktree changes were preserved.
