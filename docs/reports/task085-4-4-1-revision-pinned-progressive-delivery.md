# Task085.4.4.1 — Revision-Pinned Progressive Delivery

## Status

Local verification PASS; Preview acceptance pending. No main merge or Production deployment. Task085.5 is out of scope.

## Design

After existing authentication, RLS and album/route-pet authorization, pin the active version/revision and cover revision/client sequence in request-local immutable data. No public token or shared user cache is introduced. Draft metadata is read once and all body/reset photo path promises are populated in one request-context batch.

Initial body URLs are signed first and checked against a fresh joined cover/active-version SELECT. Nearby and remaining groups then sign concurrently with a bound of two groups, followed by one shared fresh joined consistency check. Both tail deltas are released only when that final check passes. Existing version increments in mutation RPCs remain authoritative. Checks use AbortSignal to bypass Next request fetch deduplication. A changed active version, revision, cover sequence, missing row, failed query or required URL fails closed.

Metadata is sent once for Preview and reused from initial props for edit list. Later messages contain only URL/thumbnail additions plus the existing revision pin. The client merges out-of-order deltas with a phase bitmask, uses the existing effective-state projection and common renderer, and marks fully-ready only after all three phases. Failure clears the visible stale snapshot and shows a reload error; it never enables order controls.

Complete starts independent full reads before waiting on labels/version for the hero. Existing full/legacy reads are retained. Page Editor candidate/suggestion delivery and its save queue are unchanged. Print inspection is unchanged.

A Preview-only `deliveryMode=baseline|candidate` comparison selects the previous server delivery algorithm or the candidate. Production ignores this override. It does not bypass authorization, alter image selection or change URL expiry. No global user cache is used.

## Instrumentation

Transport classification distinguishes document, RSC and prefetch from request headers/query evidence. A Preview-only effect observes same-origin router fetch kinds and per-click ResourceTiming deltas. Resource URLs/IDs remain only in the browser closure and are not logged. Progressive phase, metadata and consistency-check counts are privacy-safe aggregates. No Link prefetch policy is changed.

## Verification

- 1224 / 1224 tests PASS.
- TypeScript PASS.
- Lint: 0 errors / 12 existing warnings.
- Build PASS.
- Diff check PASS.

Tests include bounded parallel tail groups, single metadata preload, two fresh joined checks, revision/cover/clientSeq/active-row failures, missing private image failure, out-of-order merge, duplicate deliveries, failure stickiness/visible state removal, transport classification, and Production ignoring comparison mode.

## Acceptance pending

Same authenticated fixed Preview host, 380×715, existing real fixture. Plan: at least three interleaved fresh-document pairs per route, plus Link/prefetch/Back smoke and one real editor mutation/save/back/Preview/reload acceptance. Report early shell, primary and fully-ready separately. No image decode claim from data-ready markers.

Genuine No-Crop browser acceptance remains UNVERIFIED due to fixture absence. Artificial DB/layout fixtures will not be created. Private evidence stays local-only in ignored outputs.
