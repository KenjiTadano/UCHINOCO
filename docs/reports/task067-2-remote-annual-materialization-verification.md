# Task067.2 — Remote Annual Materialization Verification

## Result

- Remote migration applied: `20261005120000_atomic_passive_annual_materialization.sql` was the only pending migration at pre-check. Post-apply `npx supabase migration list` showed it applied and `npx supabase db push --dry-run` reported the remote database up to date with zero pending migrations.
- Generated types refreshed from the linked remote with `npx supabase gen types typescript --linked --schema public`. `lib/supabase/database.types.ts` now includes `materialize_passive_annual_candidate`; no generated type was hand-written.
- No commit or push was performed.

## RPC And Idempotency

Executed the RPC as `authenticated` using rollback-only fixtures under an existing pet. The fixture supplied 48 source photos for each of two otherwise unused years; the complete test transaction was rolled back.

- Owner create succeeded; a second call returned `reused`.
- Wrong owner, wrong pet, wrong year, and wrong period were rejected.
- A changed fingerprint for an already-materialized pet/year was rejected by annual protection.
- A stale source-photo set on a first materialization, selected photos outside the source set, and payload/photo mismatch were rejected.
- The resulting annual album, active Draft, selected-photo rows, cover, and `album_generated` analytics event each had exactly one row. Selected photo count equaled its distinct-photo count.
- RPC verification: PASS.

## Atomicity And Monthly Protection

- A rollback-only failure injection supplied a non-numeric spread importance. It failed during Draft persistence after the album/photo inserts and Draft-version insertion had begun. No album, album photos, Draft, cover, or analytics row remained for that failed call.
- This verified rollback through a Draft-save failure. There is no built-in stage failure injection, so after-cover failure was not separately forced and no injection mechanism was added.
- Monthly-state counts matched before and after the annual RPC: 10 albums, 2 Drafts, 1 cover, 5 spreads, and 3 print snapshots. Monthly protection: PASS.
- The whole fixture transaction rolled back. Follow-up queries found zero `task0672-rollback` photos, zero fixture annual albums, and the original total of 57 photos.

## Graceful Degradation

- The Task067.1 candidate tests passed within the full suite: an eligible year with partial analysis remains eligible, while insufficient analysis ratio/month coverage is rejected before materialization.
- The server recomputes the candidate and checks the submitted expected fingerprint before calling the RPC. Existing materialized annual Drafts are protected from later candidate fingerprints; the remote changed-fingerprint probe was rejected.
- Remote data has 57 photos total, with at most 28 photos in any calendar year, so there was no naturally eligible remote candidate for an end-to-end analysis-to-materialization check.

## Concurrency And Browser

- Two-session concurrent open was not run. The remote has no eligible existing candidate, and rollback-only fixtures are not visible to another session; committing shared test data merely to race it was not considered safe. The transaction advisory lock and duplicate-open behavior were verified structurally and sequentially, but concurrent reuse/deadlock remains a Release Gate.
- Browser flow was not run: no authenticated browser page was shared, and remote data had no eligible annual candidate. Candidate → 「1年を振り返る」 → Viewer → reload/double-open remains a Release Gate.

## Tests

- Full suite: `node --test tests/*.test.mjs` — 913 passed, 0 failed.
- Focused Annual/migration suite: 21 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; only the existing Apple Silicon/Rosetta performance warning appeared.
- Scoped ESLint for Annual actions, candidate generation, and generated Supabase types — passed.
- `git diff --check` — passed.

## Remaining Release Gates

- Run two-session concurrency verification with an eligible test candidate in a safe shared fixture environment.
- Run the authenticated browser flow against an eligible annual candidate.
- The after-cover rollback stage was not independently failure-injected.

Commit/push: not performed.