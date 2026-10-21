# Task085.4.3.2 — Server I/O variance and Storage delivery

Status: local verification completed; same-host Preview acceptance pending. No main/Production operation or Task085.4.4 work.

## Instrumentation and privacy

Existing request correlation is reused. One Server I/O metrics aggregate contains fixed metric names, counts, duration sums/maxima and maximum counts. No path, signed URL, user/pet/album/photo ID, credential, font filename or instance identifier is recorded. Observation is associated with the request's Supabase client using a WeakMap; no cross-request data reuse is introduced. Instrumentation remains Preview/explicit diagnostic opt-in. Existing Production auth and delivery semantics are unchanged.

Cache counts: image URL hit/miss, derived-preview presence hit/miss, thumbnail-transform hit/miss and same-request path reuse, availability hit/miss, static font hit/miss/file read/error, request-local metadata hit/miss. Pending file-read promises count as hits; a hit does not necessarily mean zero wait. Misses alone do not prove instance cold start: expiry, refresh, missing assets or another instance may also explain them. Existing 50-minute signed-URL cache and 10-minute presence cache are owner scoped and process local. No shared/persistent cache, longer expiry or public URLs are introduced.

DB metrics whitelist table names. Undici counts actual HTTP creation independently of logical fetch adapter invocations. Request-create → response-headers duration is network + remote-server wait, not isolated Supabase SQL execution time. Adapter duration also includes SDK/fetch overhead and can include dedup wait. Errors are counted without logging error payload. Query parameters/paths are discarded. Logical attempts versus physical attempts can indicate repeated transport work; no database-internal retry/EXPLAIN evidence is claimed.

readDraft keeps version/spreads/elements stage measurements; adds photo-metadata duration, assembly duration, effective identities, reset-only identities and first-body/other-body counts. Cover readers count cover identities and additional missing URLs. First body is a structural proxy, not a claim about the current visible client spread. The default Preview starts at Cover. Initial rail visibility/offscreen classification requires DOM evidence; the server does not know browser scroll/selection. No response contract, URL set or renderer is changed.

## Safe changes and comparison

- Independent known-original and stored-thumbnail main URL signing can overlap. Thumbnail failure still falls back to its original, no extra retry is introduced. Private buckets, SDK signing, owner-scoped URL cache, existing main source priority/quality, transform options and four-transform-request limit remain.
- Print starts immutable build-font reads after authenticated album ownership succeeds, while pinned-version draft/pet/cover reads proceed. Actual style readiness is still checked by inspection; missing fonts remain blockers. Only static font bytes are module cached, as before.
- Same original path downloads coalesce only inside one image-facts call. Each effective identity still receives orientation/raster facts. No original download/probe requirement is removed, no cross-request original cache exists. Active-download peak, duration and probe count are observed; existing independent probes remain parallel.
- No speculative Edit/Home optimization. Auth/RLS/Multi-Pet/revision/clientSeq, generation, Safety/Recovery/subset, contain, snapshot and print blocking checks remain.

Preview-only ioMode=baseline/candidate switches scheduling in the same deployment/host/session. Proxy overwrites the diagnostic header; Production ignores the baseline override. It is not an auth assertion and does not select different data. Both modes use the same instrumentation and existing cache scope. Baseline retains sequential main URL buckets and later font loading; candidate overlaps those independent operations. Original path dedup and diagnostics are common; this fixture is checked for duplicate paths before claiming an isolated result. Cache hits can carry across alternating modes, so compare cache classification as well as end-to-end time. No cache-bypass/token generation/manual alias operation is used.

## Local verification

Full tests, TypeScript, lint (0 errors / 12 existing warnings), build and diff-check completed; **1213/1213 tests PASS**, TypeScript PASS, build PASS and diff-check PASS. New tests cover observer isolation/whitelisting, error timing without data logging, baseline/candidate source equivalence and ordering, owner separation, static font telemetry and missing/error behavior, metadata request boundaries, actual DB HTTP timing/count and Production variant rejection.

## Browser acceptance

Pending three interleaved pairs for Preview, Edit, Print and Home at 380×715, same real fixture, same browser session and fixed branch host. No new login requested. Raw evidence stays ignored/local-only under outputs. No orders, checkout, PDF, generation, DB/Storage writes or artificial fixtures will be created. No-Crop remains UNVERIFIED due to fixture absence.
