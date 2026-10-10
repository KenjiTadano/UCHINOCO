# Task078.2.7 — Layout Recovery Diagnostics & Fallback Execution Fix

- Date: 2026-10-10
- Branch: `feature/task078-2-7-layout-recovery-diagnostics`
- Base: `bb0db42` (Task078.2.6 on `main`)
- Status: **Diagnostics implemented and locally verified; Production root cause/fix acceptance pending**

## Production Evidence And Root Cause Status

Production evidence supplied for this task reports 12 spreads, 5 initially unsafe, and zeros for template fallback, photo reassignment, Best Shot replacement, density fallback, adjacent reflow, safe fallback, and 5 unrecovered spreads.

That event only exposed successful recovery counts. It did not include attempt counts, per-spread candidate counts, rejection reasons, fallback registry lookup status, or stage reached. Therefore zero success counters cannot establish that a stage was skipped; nor can the event distinguish missing candidates from candidates rejected by the crop/layout gate. **The root cause of those five spreads remains unverified.** No speculative change to crop thresholds, photo quality, or eligibility was made.

## Diagnostics Added

Each unsafe spread now contributes an ID-free `spreadDiagnostics` record containing:

- `spreadIndex`, `photoCount`, and ordered `recoveryStagesReached` plus the last `recoveryReached` stage and `outcome`.
- `initialCandidateCount`, evaluated strict/fallback candidate counts, and `safeFallbackCandidateCount`.
- `reassignmentCandidateCount`, `replacementCandidateCount`, `reflowCandidateCount`, and whether any eligible replacement candidate was available.
- Failure-reason counts for `cropUnsafe`, `gutterViolation`, `frameInvalid`, `heroHierarchyViolation`, `sourceSubjectAlreadyClipped`, `noMatchingTemplate`, `noSafeFallback`, `noReplacementCandidate`, `reflowUnavailable`, and `other`.

The `albumLayoutRecovery` event now carries global attempt and success counters separately: `templateFallbackAttemptCount` / `templateFallbackCount`, `safeFallbackAttemptCount` / `safeFallbackUsedCount`, `photoReassignmentAttemptCount` / `photoReassignmentCount`, `bestShotReplacementAttemptCount` / `bestShotReplacementCount`, `densityFallbackAttemptCount` / `densityFallbackCount`, and `adjacentReflowAttemptCount` / `adjacentReflowCount`, alongside initial unsafe/unrecovered totals, global reason counts, and all per-spread records.

No photo, user, album, or pet IDs are included. A `noMatchingTemplate` count is based on total registry availability, not merely an exhausted later-stage slice. A `noSafeFallback` count is reserved for an unavailable fallback lookup; fallback candidates that exist but fail safety are instead represented by their rejection reasons.

## Execution Changes

No safety threshold was relaxed and no unsafe spread is promoted to pass. The existing Task078.2.6 recovery attempts are now observable at each stage. The only code correction in this task prevents nonexistent adjacent indices (for example `-1` or `spreadCount`) from being counted as reflow attempts; only existing in-range neighbors are tested. This makes the attempt metrics correspond to real candidates.

## Verification

- `node --test tests/*.test.mjs`: 1,033 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 12 warnings in existing unrelated files.
- `npm run build`: passed with Next.js 16.4.0.
- `git diff --check`: passed for tracked changes; this report is checked after creation.
- Focused tests cover an exhausted single-photo spread's candidate attempts/reasons, fallback lookup present versus absent, 12-spread aggregate attempt/success reconciliation, no-ID diagnostics, exact 24/48/72P spreads, crop safety, Best Shot replacement, adjacent reflow, Rhythm Audit, and Task078.2.1 performance/no-synchronous-Vision.

## Production Acceptance And Next Step

This branch was not deployed and no Production Album was regenerated. The exact reason for the supplied five unsafe spreads therefore cannot yet be named, and this report does not claim that Production completion is fixed. Deploy the diagnostics to an authorized Production-equivalent environment, regenerate the same 24P photo set, and inspect the new per-spread records. Then make only the smallest change supported by those rejection counts. Acceptance remains: `initialUnsafeSpreadCount > 0`, `unrecoveredCount = 0`, Album completion, then Preview.

## Git

No commit, push, deployment, or merge was performed. Work remains on `feature/task078-2-7-layout-recovery-diagnostics`.
