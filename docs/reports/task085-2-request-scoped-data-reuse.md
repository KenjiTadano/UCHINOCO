# Task085.2 — Request-Scoped Data Reuse & Critical Path Reduction

Date: 2026-10-19 JST

## Scope and implementation

Base release: `6a8170312dc544392d84d2d7a7be356fc785b471`. Work is isolated on `codex/task085-2-request-data-reuse`; main/Production are unchanged.

- Added a server-only request context. Album, active version, membership, owned pet checks and eligibility promises are stored only in the local context instance. Concurrent readers share promises. Nothing is stored in a cross-request/global user cache.
- loadEditorCandidates remains an authenticated Server Action with the same public arguments. Its internal loader now builds eligibility once, uses already fetched photo records for preview/list URLs, and preserves the recent-80 plus explicitly added Album photo contract. Secondary pet / generation-unused eligibility is unchanged.
- Page Editor uses one authenticated Supabase client and context for concurrent draft/candidate/suggestion reads. New-photo suggestion reuses album, active version/generation metadata, membership and owned-pet results.
- Draft Preview branches before legacy photos/list URLs/orders/entitlements/suggestion work. Missing-draft Preview still uses the existing legacy builder. Complete still reads its existing completion model. These branches are executed in regression tests, not only checked by text matching.
- /edit and Preview reuse draft image URLs for cover photos already present in this request. Missing cover URLs retain the existing signing fallback.
- Cover candidate recent-80 selection is unchanged. Album membership filtering happens before URL generation, avoiding signing discarded owned candidates. Cover read and candidate read run concurrently. The original fallback remains.
- Internal URL helpers accept the server-verified user ID, avoiding repeated helper authentication. AppLayout/PetAuthorizationLayout checks remain; this task does not broadly memoize authentication across layouts.

## Security / persistence boundaries

Context is created only after auth.getUser in server code. It is not a Server Action parameter or client prop. Owner, route pet, full Album pet ownership and canUsePhotoInAlbum checks remain. Missing membership/ownership fails closed. Public Action entry points authenticate independently; frame and cover mutations create a fresh context for authoritative eligibility and keep their original RPC validation.

No save response redesign. finishWrite, full post-save readDraft, revision/clientSeq, stale merge, pending/in-flight tracking, retry, navigation wait and route revalidation contracts remain. Image source selection, fallback policy, quality, crop, contain, renderer, thumbnail size, React memo/windowing and bundle splitting are unchanged. No DB migration or generation/Safety/Task081/Recovery change.

## Before / after DB call counts

Counts exclude Auth and Storage HTTP calls and shared layout/proxy work. They describe the normal successful real-Album branch, no new-photo delta, no candidate added-photo miss, cover photo already present in draft URLs. Conditional fallback branches may add queries. Before counts are Task085.1 source-path counts, not a Production SQL trace.

- Page Editor: 29 DB calls (28 SELECT + analytics insert) → 18 (17 SELECT + same insert), reduction 37.9%.
- Draft Preview: 26 (25 SELECT + analytics insert) → 12 (11 SELECT + same insert), reduction 53.8%.
- /edit: 12 SELECT → 11 SELECT, reduction 8.3%.
- Typical Cover Editor: 10 SELECT → 9 SELECT, plus fewer candidate paths to sign. Exact fallback behavior depends on the Album.

The actual readDraft/candidate/suggestion modules are executed against a counting Supabase double. With the same request context the Editor path performs 17 SELECT, including album and route-pet reads. Album, active version and album_pets each execute once. The unchanged analytics insert brings this to 18 DB calls. Separate context instances execute their own reads, including when another user is supplied.

Removed duplicates include one repeated three-query eligibility pass, redundant Album/route-pet validation reads in trusted server callers, the candidate photo-path SELECT, suggestion album/version/membership/owned-pet SELECTs, and cover path SELECT when the draft already provides the URL. Draft Preview additionally omits data that its UI never consumed.

## Verification

- node --test tests/*.test.mjs: 1169 / 1169 PASS.
- npx tsc --noEmit: PASS.
- npm run lint: 0 errors / 12 existing warnings.
- npm run build: PASS (Next.js 16.4, webpack).
- git diff --check: PASS.

New tests exercise candidate result parity, secondary/unused preservation, wrong owner/outside pet rejection, request isolation/concurrent coalescing, membership failures, existing-record URL reuse, cover filtering before signing, actual draft Preview early return, missing-draft legacy fallback, Complete behavior, and the 17-SELECT Editor budget. Existing Task082/084 tests retain their behavioral assertions; source-location checks were updated to follow the extracted server-only loader, and fixtures now include the owner field returned by the real query.

## Production-like Preview timing

Task085.1 baseline (ms, observed UI-ready marker; tool overhead and existing cache/prefetch apply):

- Page Editor: 9117–10299.
- Preview: 6449–10692.
- /edit: 3633–5968.

After measurements: PENDING authenticated Git Integration Preview. No improvement percentage or UI-ready non-regression is claimed before these measurements. The full Task085.2 success condition is not yet PASS. Match Preview deployment SHA to the implementation commit, then use the same real 24P Album and timing marker/method. Collect readDraft stage logs read-only with the B1 parser. Runtime stage duration and query counter evidence must remain distinct.

## Regression / remaining work

Local regression suite passes. Browser persistence/synchronization checks and before/after UI-ready comparison remain pending Preview authentication/measurement. Genuine No-Crop remains UNVERIFIED due to fixture absence; no artificial fixture was created.

Task085.3 should follow only after this request-reuse Preview acceptance. The previously measured original-image fallback remains intentionally unresolved; it can still dominate image load/decode even if server preparation improves. Do not infer image improvement from this task.

Raw logs, real identifiers/URLs, signed image URLs, screenshots and timing evidence stay local-only in ignored outputs. Previously uncommitted Production acceptance and Task085.1 reports are retained separately and are not included in this implementation commit.
