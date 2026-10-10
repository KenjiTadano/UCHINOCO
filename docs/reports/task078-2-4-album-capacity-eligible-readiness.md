# Task078.2.4 — Album Capacity UX & Eligible Readiness

- Date: 2026-10-10
- Branch: `feature/task078-2-4-album-capacity-eligible-readiness`
- Base: `e94eef9` (Task078.2.3 on `main`)
- Status: **Implemented and locally verified; Production deployment/Preview acceptance pending**

## Root Cause

Production evidence supplied for this task reports `totalSource=28`, `ready=24`, `pending=0`, `failed=4`, `eligibleReady=24`, and `requiredEligible=24` for 48P. The old preflight only calculated eligible count when every source was ready; otherwise it returned an undefined eligible count. Its state precedence also treated any failed source as an action-required condition before checking whether the album had enough usable photos. The generation action separately stopped whenever any source photo lacked current semantic or geometry analysis. Setup showed a page-count radio without server-authoritative availability or shortage information.

## Readiness Contract And Capacity Model

`lib/album-capacity.ts` is now the single source for supported body page counts and minimum eligible photos:

| Body pages | Required eligible photos | Description |
| --- | ---: | --- |
| 24P | 12 | Compact |
| 48P | 24 | Standard |
| 72P | 36 | Extended |

Both readiness and generation use the shared state decision: sufficient eligible photos means `ready`, otherwise retryable/pending work means `preparing`, and no pending work means `shortage`. Capacity recommendation is the largest supported page count that the current eligible pool can satisfy. User selection is not overwritten after a manual change.

The authenticated readiness action ranks available stored analysis using the same Best Shot, alternate, and technical-quality rules as generation. A sufficient pool proceeds even when other source photos failed or remain pending. Terminal queue states use the shared retry policy; queue lookup failure is conservative and remains pending rather than incorrectly claiming a shortage.

Generation revalidates the eligible count server-side after Best Shot ranking. It uses only analyzed photos in the existing ranking/plan path; `planEditorialAlbum` still excludes alternates and technical scores below 25. Existing duplicate control, crop safety, layout, Rhythm Audit, Preview First, and page-count spread validation remain in place. Generation still performs no synchronous Vision work. Queue reads are bounded to 200-photo batches.

`Album generation performance` records `eligibleReady`, `requiredEligible`, `excludedFailedCount`, `proceededWithFailedExcluded`, queue query count, and queue-state availability without photo IDs or PII. Existing `generation_photo_ids` remains the full source-period baseline used by new-photo suggestion detection; the actual Album photo rows continue to use only the plan's selected eligible photos.

## Setup UX

Album Setup now renders accessible 24/48/72P radio cards from server-returned capacity data. Each card includes page count, intended volume, recommendation, availability, or exact additional-photo count. The interface shows “アルバムに使える写真” and does not expose internal analysis/queue/fingerprint terminology. A shortage retains the existing primary Photo Add action and the best available smaller-page fallback; upload `returnTo` and the saved setup intent remain unchanged.

Page switching clears stale availability while the selected capacity is rechecked. Initial recommendation is applied once when a viable recommendation exists; explicit manual selection is preserved. No analytics events or schema changes were added because the requested event names are not confirmed by the current schema allowlist.

## Acceptance Scenarios

1. `28 source / 24 eligible / 4 failed / 24 required for 48P`: readiness is `ready`; failed photos are excluded, generation proceeds using the eligible pool, and the log marks failed exclusion. Covered by readiness and generation-log tests; not executed against Production.
2. `20 eligible / 4 pending / 24 required`: readiness is `preparing`; the existing intent polling resumes when capacity becomes ready. Covered by state and auto-resume tests.
3. `20 eligible / 0 pending / 24 required`: shortage is 4; 24P is offered when its 12-photo threshold is met, with the existing Photo Add action. Covered by capacity and fallback tests.
4. `40 eligible`: all page options are available and 72P is recommended. Covered by capacity tests.

The existing editorial regression verifies that insufficient, duplicate, alternate, and low-quality photos cannot pad a book.

## Verification

- `node --test tests/*.test.mjs`: 1,024 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 12 warnings in existing unrelated files.
- `npm run build`: passed with Next.js 16.4.0.
- `git diff --check`: passed for tracked changes; this report is checked after creation.
- Focused capacity/readiness, queue terminal-state, generation performance, and Task078.2.1/2.2 regression tests passed.

## Production Verification

The 28/24/4/24 counts above are user-provided Production evidence. This feature branch has not been deployed, so the Production UI, generated Album, and Preview have not been re-verified. Production acceptance remains pending deployment and confirmation that the 48P request reaches Preview without waiting for the four failed photos.

## Git

No commit, push, deployment, or merge was performed. Changes remain on `feature/task078-2-4-album-capacity-eligible-readiness`.