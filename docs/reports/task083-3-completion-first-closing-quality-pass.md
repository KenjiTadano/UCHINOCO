# Task083.3 — Completion-First Closing Quality Pass

Date: 2026-10-16 JST
Status: local verification PASS; Preview Acceptance not performed. No commit, push, merge or deployment.

## Regression root cause

Task083.1 excluded intermediate E_CLOSING from initial, Recovery, replacement and preserved-layout candidates before a safe baseline existed. Task083.2's read-only comparison demonstrated that the existing subset candidate then failed the final blocking audit with REPEATED_TEMPLATE at index 7. Restoring Closing availability restored 19-photo completion. Real captionAvailable alone did not reproduce the regression.

## Responsibility separation

Completion phase:
1. Initial planning, existing Task078 Recovery and unchanged Task081 subset search can use E_CLOSING at any story position, including preserved layouts.
2. The original Safety evaluator and whole-book blocking audit must pass.
3. Only after this safe baseline exists does the quality phase begin.

Quality phase:
1. Try bounded intermediate Closing cleanup.
2. Run the existing bounded density rebalance.
3. Validate the final photo-ID multiset and whole-book blocking audit.
4. Keep the baseline if quality cannot safely improve it; unexpected quality evaluation/audit errors roll back the entire quality phase.

Removed the position restriction from candidateLayoutStages and all Completion/Recovery callers. The preserved-layout path again evaluates an existing intermediate Closing through the original evaluator. lib/album-draft/selection.ts and Safety thresholds are unchanged. Real captionAvailable remains intact.

## Closing cleanup

Added completionFirstEditorialQuality in editorial-density.ts. Cleanup scans intermediate Closing spreads in deterministic order and makes at most eight cleanup attempts per album, each evaluating at most three ranked non-Closing layouts. This adds at most 24 layout evaluations, independent of the existing density bound (12 pair attempts, at most 72 layout evaluations).

Cleanup retains the story, assigned photo set, roles and chronology. Candidates pass the existing source clipping, crop, hero, gutter, frame and subject gates through evaluateSpreadLayoutCandidates/buildSpreadDraft. Each replacement must also pass the whole-book blocking audit. A rejected candidate leaves the current safe layout intact; inability to remove intermediate Closing is a quality issue, never Completion failure. Final-position Closing remains allowed. New density candidates avoid intermediate Closing, but the completed baseline may retain it when cleanup is unsafe or cannot satisfy the blocking audit.

The quality helper works on copies and does not mutate the baseline. A final photo-set or audit failure, or an evaluation exception, returns the original completed stories/spreads. Rollback is explicit in quality diagnostics (qualityPassRolledBack); it does not produce action_required. This counter is stored in closingCleanupFailureReasonCounts as a quality-phase umbrella rollback reason, including failures occurring during density evaluation.

## Diagnostics

editorialDensity now includes:
- initialClosingSparseSpreadCount
- finalClosingSparseSpreadCount
- closingCleanupAttemptCount
- closingCleanupSuccessCount
- closingCleanupFailureReasonCounts

Closing counts include ALL sparse E_CLOSING spreads, including intermediate ones. Task083.1's closingSparseSpreadCount counted only final-position Closing and therefore did not describe intermediate exceptions. It now reports the actual total after quality. A result above one is allowed when preserving Completion and accompanied by cleanup failure diagnostics.

Cleanup reasons include blockingAudit, noSafeAlternative, cropSafety, sourceClipping, templateIncompatibility, boundedSearchExhausted and qualityPassRolledBack as applicable. Existing density metrics and rebalance reasons remain separate. No photo IDs are added to diagnostics. Existing recovery logging/metadata carries these values; no new production log stream.

## Regression fixture and tests

Added tests/fixtures/task083-completion-regression.json and tests/task083-completion-first.test.mjs. The fixture derives numeric geometry and ranking scores from the actual Task083.2 regression inputs. Real photo/pet/group IDs were replaced, dates shifted, scene labels anonymized, and images, URLs, source captions and storage paths omitted. Stable ID ordering and the grouping/time relationships needed to reproduce planning were retained. Tests run offline through the real Safety evaluator and the unchanged subset search, without DB, Vision or image requests.

Coverage:
- A: the previously successful 24P condition completes again through subset search with 19 distinct photos and unrecoveredCount=0.
- B: a safe intermediate Closing replacement passing the full audit reduces Closing count.
- C: replacement causing REPEATED_TEMPLATE is rejected; the original Closing baseline remains completed.
- D: both legacy caption availability and real caption availability retain completion.
- E: density evaluation failure/exception cannot escape as action_required; the safe baseline and photo allocation remain intact.
- Existing deterministic, real crop/source clipping rejection, meaningful-caption preservation, bounded search, chronology/pet/scene, Task081 monotonic, Task078 Recovery/No-Crop, and 24/48/72P tests remain passing.

Updated Task083.1's hard intermediate Closing test to assert completion plus post-baseline cleanup diagnostics instead of forbidding safe baseline exceptions.

## Local real-regression-derived result

24 eligible photos / 24P:
- subsetAttemptCount=1, subsetSuccessCount=1
- selectedPhotoCount=19, unusedPhotoCount=5
- initialUnrecoveredCount=1, finalUnrecoveredCount=0
- completed spreads=12, unrecoveredCount=0, final blocking audit PASS
- initialClosingSparseSpreadCount=2, finalClosingSparseSpreadCount=1
- closingCleanupAttemptCount=1, closingCleanupSuccessCount=1, cleanup failure reasons empty
- initialDateOnlyPageCount=7, finalDateOnlyPageCount=7
- photoOccupiedPageCount=17, emptyPhotoPageCount=7
- rebalanceAttemptCount=12, rebalanceSuccessCount=0
- rebalanceFailureReasonCounts: chronologyConstraint=2, petBalanceConstraint=2, sceneConstraint=2, templateIncompatibility=6, boundedSearchExhausted=1; other reasons=0

This is the intended priority: Safety and Completion remain intact even though date-only density cannot improve under the bounded constraints. Closing cleanup is independently successful.

## Verification

Node v22.23.2:
- node --test tests/*.test.mjs: 1,144 PASS / 0 FAIL.
- npx tsc --noEmit: PASS.
- npm run lint: PASS, 0 errors / 12 existing warnings.
- npm run build: PASS.
- git diff --check: PASS.

The existing generation 80-second budget and checks are unchanged. Search remains deterministic and fixed-count bounded. No synchronous Vision, new Recovery mechanism, forced photo addition, or unsafe candidate adoption was introduced.

## Preview result / limitations

Preview Acceptance is pending. The deployed Task083.1 Preview is unchanged and its failure is not retroactively marked PASS. No new Album was generated or existing Album edited in this task.

The regression-derived fixture proves offline planner/subset completion, not authenticated UI completion, runtime outcome=ready, Preview reachability or production timing. Those must be confirmed on the next authorized Preview with the same real-photo conditions. Real density may remain seven; quality improvement is not a Completion acceptance gate.

Stop before Preview Acceptance as requested.
