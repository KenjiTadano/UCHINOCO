# Task078.2.1 Album Generation Timeout / Performance Fix

## Status

- Branch: `feature/task078-2-1-album-generation-performance`
- Base: `0f2bb0b9ad61e8ea0dbffc4ae3838d3a69ba2d6a`
- Date: 2026-10-09
- Local automated checks: PASS.
- Real-photo Production acceptance: **PENDING, not claimed PASS**.
- No Production deployment, database write, photo upload, Print order, or Vision request was performed during this task.
- Commit/push is authorized for the dedicated branch. Concurrent out-of-scope changes to Pricing/Legal/Billing/public tests are excluded from the commit and left untouched. Main remains at the base SHA. Production acceptance remains pending after branch push.

## Observed Failure And Cause Boundary

User-provided Production evidence: Task078.2 deployment `0f2bb0b`, Album POST returned 504 after 120 seconds with `FUNCTION_INVOCATION_TIMEOUT`, analysis-save logs continued until timeout, and no new album row was present. These facts locate the failure before persistence, but do not provide durations for individual phases.

Code inspection confirmed the pre-persistence path called `selectPetBestShots` without `storedOnly`. Grouping prepared each photo serially. Cache misses could invoke Photo Intelligence and geometry Vision calls (60-second provider timeouts), download originals for technical scores/descriptors, and issue per-photo authentication/metadata/URL operations. Even a persisted semantic result still downloaded the original to recompute technical quality. Selected-photo Crop used additional batches of four analysis actions. The optional title request also preceded album insertion. This is a confirmed synchronous fan-out path capable of exhausting the request budget; the exact dominant phase of the reported Production invocation is not yet proven by timing evidence.

## Changes

1. Album generation now reads current semantic/geometry rows in 200-photo batches and evaluates Grouping and Best Shot from those request-scoped inputs. Photo IDs, ownership, requested pets, dates, and original pagination remain server validated.
2. Generation does not call per-photo analysis Actions, OpenAI, descriptor creation, or original download. Selected preview URLs use the existing batch delivery helper. Existing descriptors are reused if cached; unavailable descriptors use the existing no-descriptor degradation rather than fetching images.
3. Missing current analyses return a safe “写真の整理がまだ完了していません” state before album insertion. Existing bounded intake runner supplies missing analyses outside the Album POST. Intake metadata discovery now scans 200-row pages instead of silently excluding photos older than the latest 30; geometry-only work is handled as a separate bounded item. The existing four-item / five-minute runner limit remains.
4. New Photo Intelligence results include validated technical-quality snapshots (also on terminal fallback). Cold generation can reuse them without image I/O. Current memory Intelligence is reused when available. Old immutable success rows without technical snapshots use conservative technical placeholders and emit `legacyTechnicalFallbackCount`; they are not force-reanalyzed. This is a visible evaluation caveat, not a claim of identical cold/warm technical ranking for legacy data.
5. Crop/frame-match evaluations are memoized for the same photo and complete frame specification, including aspect ratio, only within one editorial generation. No user/global cross-request crop cache is introduced.
6. Rhythm retains its precomputed safe layout candidates, performs at most two repair passes, and revisits affected spreads/neighbors (or the book for global diversity issues). It never regenerates geometry or explores combinations across all spreads.
7. The title uses the existing deterministic fallback rather than an external title request before persistence. Body page count, multi-pet metadata, cover/body/back-cover separation, and Preview First are unchanged.
8. A generation-specific error boundary avoids claiming a communication failure and offers a home/retry path. Before beginning persistence, elapsed time is checked against an 80-second budget; the 120-second route limit is unchanged. This cooperative margin check does not cancel an already hung DB operation or prove every request completes within 80 seconds.

## Instrumentation

`Album generation performance` records carry a request run ID. Every started/completed/aborted phase contains `startedAt`, `durationMs`, and `itemCount`. No caption, name, image content, signed/image URL, secret, or raw SDK error is passed to the logger.

The reproduction conditions record validated selected pet IDs, pet count, allowlisted period preset, UTC range, and requested body pages. Count records contain source/selected photo count, ready/missing Intelligence, missing geometry, planned spreads, metadata batch count, legacy technical fallback and failed-analysis counts. Work records contain source/analysis query counts, crop calculated/reused counts, safe layout candidate count, and zero generation Vision/original-download counts.

Phases: 01 request validation; 02 ownership/setup validation; 03 source photo queries; 04 batched Intelligence metadata read and reconstruction; 05 deterministic Grouping; 06 Best Shot; 07 readiness/missing-analysis decision; 08 ranking/page-budget selection; 09 URL preparation/layout planning; 10 measured deterministic crop/frame-match CPU; 11 whole-book Rhythm Audit/repair; 12 album insertion; 13 page/spread/photo persistence including the draft's generation metadata; 14 cover persistence; 15 active-version/analytics metadata; 16 redirect preparation.

Phase 10 and 11 are nested inside phase 09. Do not sum those three durations as independent wall-clock phases. Crop `startedAt` is the candidate-generation start and its duration is accumulated CPU time across uncached cells. A failure emits an aborted record for outstanding phases; phases not reached are not reported as successful zero-time work. Vercel's hard process termination may prevent the final aborted/summary record; phase-start records remain available.

## Measurements Before And After

Before, Production: total wall time 120 seconds, failed before first album insert (provided evidence). Source query, analysis, Best Shot, layout, Rhythm, persistence, query count and Vision count are **not measured** for that invocation. No invented phase split is supplied.

After, isolated local synthetic fixture: 36 saved-analysis photos, two pets, 48 body pages / 24 spreads. One focused run measured approximately 196ms total CPU processing: stored reconstruction 0.70ms, Grouping 65.41ms, Best Shot 1.54ms, layout including ranking/Rhythm 126.87ms, Rhythm 8.87ms, accumulated Crop CPU 74.08ms. It calculated 156 crop cells and reused 292; 172 safe layout candidates remained. Full-suite concurrent load raised the fixture runtime to approximately 361ms. These values exclude network I/O, source queries, URL issuance, persistence, redirect rendering, and real-photo analysis/quality; they are not directly comparable to the 120-second Production wall time.

Metadata loader test: 451 source photos required exactly three mocked queries, batches 200/200/51, with no Storage/API dependency. For 30-40 photos, analysis metadata requires one query; source query count is one per selected pet with additional pages only beyond 200. Actual Production SQL/Storage/signing/HTTP totals still require the next instrumented run. Persistence latency is **not measured** locally against a real database.

## Regression And Verification

- `node --test tests/*.test.mjs`: 1010 passed, 0 failed.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: 0 errors, 12 pre-existing unrelated warnings.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Task078.2 all-pet default, subset/custom range, 24/48/72 body pages, 40-design library, diversity, Rhythm, crop aspect/geometry, Preview First, saved metadata, no blank pages and Best Shot all-member behavior continue to pass.
- Dedicated tests validate versions/fingerprints, terminal fallback, malformed technical data, 200-photo batches, DB-read failure safety, sixteen-phase timing, cooperative budget margin, 36-photo/48P planning, and absence of synchronous analysis/Vision from the creation Action.

## Production Acceptance Still Required

Deploy this branch through the approved process, then use the same dedicated real-photo Dataset A (30-40 photos), all-pet selection, and 48P. First confirm the bounded runner has current semantic/geometry coverage; do not increase Vision throughput to hide pending analysis. Record conditions/counts and phase logs for readiness failure and for successful creation separately. Confirm phase 12 begins with sufficient margin, persistence finishes, exactly 48 body pages are stored, and Viewer loads through Preview First without 504. Capture total/source/analysis/Best Shot/layout/Rhythm/persistence durations; assess legacy technical/descriptor degradation and duplicate selection visually. Do not declare Production PASS based on synthetic CPU timing or a fast analysis-pending response. Print purchase remains disabled.