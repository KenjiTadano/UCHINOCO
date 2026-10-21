# Task085.4.3.1 — Remaining server bottlenecks

Status: local verification PASS; Preview comparison pending. No Task085.4.4 or main/Production work.

## Baseline and investigation

Task085.4.3 controlled same-browser, same-session, 380×715, same real 24P fixture medians: Preview 5,738ms, Edit 4,093ms, Print 6,385ms, Complete 4,185ms, Home 2,524ms. Baseline commit b6404ef6f745b24f0f30817ceb7578f88572b3c1. These are previous recorded cohorts, not fresh Task085.4.3.1 Before measurements.

Preview draft.preview-urls was 2,812 / 3,447 / 839ms with Storage HTTP 10 / 10 / 0. readDraft collects all distinct AI and user frame-photo identities across the book and resolves both main and thumbnail maps before returning. Effective visible main needs the current spread/cover; rail needs all spread thumbnails; original AI identities may also support editing/reset. The server does not know the initial client spread and returns a complete persisted view. No URLs were omitted or main/reset behavior changed. Splitting rail/below-fold delivery requires a new loading contract and belongs to Task085.4.4, not this change.

Main source policy remains unchanged. Thumbnail derivative dimensions, quality, aspect preservation and source fallback remain unchanged. Supabase SDK batch signing does not support transform options; manually constructing transform URLs/tokens would bypass the existing contract and was not used.

The bounded thumbnail signer previously awaited groups of four, including the slowest member, before starting the next group. Availability-only diagnostic signing also blocked all transform signing despite being independent. These are clear server dependency barriers.

Print fonts are build-shipped local TTFs in assets/print-fonts, read with node:fs. They are not external/Storage/DB assets. Three text styles share one file; another style uses a second file. Each style/request previously reopened the file. Image facts already deduplicate effective photo IDs. Previous snapshot, image facts and fonts already run concurrently. Original downloads/probes and blocking print checks remain intact; no new image cache or reduced probe count was introduced.

Edit had 11 physical SELECT attempts and no Storage HTTP in all recorded samples. Server median 2,906ms while DOM marker median 4,093ms; the two differences are not proof of hydration cost. DOM-ready includes transport/automation/navigation and does not measure image decode or first paint. Active-version/elements latency varies; no duplicated SELECT, fallback signing or response-preparation bottleneck was demonstrated. No speculative Edit change is made. RSC payload/hydration/transition causality remains unproven and deferred to explicit future investigation.

## Minimal changes

- Four continuous thumbnail-signing workers replace batch barriers, retaining maximum four active transform requests. Per-invocation same-path promises coalesce duplicate paths. Diagnostics availability runs concurrently, but is still awaited before returning its counts. Same signed URL TTL/cache keys, private buckets, authenticated client and RLS remain.
- Only immutable build font bytes are shared by file within the module instance. Concurrent styles share the file-read promise; callers receive copies to prevent mutation of retained bytes. Missing/rejected reads return null, retaining blocking font-quality behavior, and are evicted so a later request can retry. No user, auth, album, pet, photo, signed URL or mutable request data is added to this cache.
- No changes to mutation/save/revision/clientSeq, source-image identity, snapshot or quality logic, layout geometry, contain, Safety, subset or Recovery. Home and Complete loaders unchanged. Existing signed-URL cache lifetime/security scope not expanded.

## Verification

- node --test tests/*.test.mjs: 1208 / 1208 PASS.
- TypeScript: PASS.
- lint: 0 errors / 12 existing warnings.
- build: PASS.
- git diff --check: PASS.

New tests cover nonblocking slow-peer scheduling, four-request bound, unique-path coalescing, concurrent font-file reuse, byte-isolation, missing-file retry and shipped font/fallback identity. Existing transform values, authorized fallback, owner isolation, crop/contain and print-quality regression tests pass.

## Browser acceptance

Pending new Git Integration Preview and measured comparison. No new improvement percentage, target achievement or PASS is inferred from local tests. Login work should be minimized; retain existing signed-in sessions, never copy credentials/cookies or weaken host authorization. No orders/PDF/checkout or artificial database fixtures will be created.

Genuine No-Crop browser verification remains UNVERIFIED due to fixture absence. This task does not alter its semantics.
