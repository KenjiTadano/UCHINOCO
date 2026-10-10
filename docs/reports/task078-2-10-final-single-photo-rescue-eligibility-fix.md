# Task078.2.10 — Final Single-Photo Rescue Eligibility Fix

## Result

Implemented on `feature/task078-2-10-final-single-photo-rescue-eligibility-fix`. The unused-photo eligibility path now considers photos released during recovery, and an empty prebuilt replacement list no longer disables the bounded single-photo fallback. Replacement photos still pass the normal layout and crop-safety pipeline before adoption.

## Root Cause

The Task078.2.9 `unusedPhotoCount` was an album accounting value (`availablePhotoCount - usedPhotoIds`), not the set of replacement IDs actually supplied to a spread. It can include the photo still assigned to an unrecovered spread, so it was not interchangeable with `globalUnusedCandidateCount`.

There were three concrete code-path defects behind the misleading zero:

1. `globalUnusedCandidateCount` was initialized to zero but never assigned from an eligibility pool. Its production value therefore did not prove that no unused candidates existed.
2. The Server Action built candidates by excluding every ID in the original `plan.selected`. Photos dropped during the first recovery pass remained in that set and could not re-enter the replacement pool even though they were no longer assigned.
3. The Server Action supplied an empty per-spread map when its filters found no candidates. The editorial engine used nullish coalescing, so that empty array suppressed its fallback candidate builder.

The historical telemetry had no per-filter funnel. Without retaining photo identifiers (which remain prohibited in telemetry), the old event cannot establish which individual photo among the five was rejected by which filter. The code-level causes above are confirmed; the new funnel records future counts without IDs.

## Eligibility Rules

Hard rejection: duplicate/currently assigned photo; photo outside the selected pet scope; existing technical eligibility floor below 25; unavailable geometry or preview asset; source subject clipping; replacement that would remove a pet's last used photo when another eligible same-pet photo exists; and any failure of the existing frame, gutter, crop, hero hierarchy, or subject visibility safety checks.

Soft ranking only: same scene, same pet when pet preservation does not require it, compatible pet grouping, chronology (within 30 days receives a preference), Best Shot overall score, and scene representativeness. No scene or chronology mismatch rejects a candidate. Best Shot overall score is not a hard threshold.

Every selected replacement is re-evaluated with the ordinary template/safe-fallback and crop/layout safety pipeline. No thresholds were relaxed and no safety gate was bypassed.

## Diagnostics

Per-spread anonymous diagnostics now include `unusedPoolCount`, `duplicateRejectedCount`, `petCompatibilityRejectedCount`, `sceneRejectedCount`, `chronologicalRejectedCount`, `qualityRejectedCount`, `sourceClippingRejectedCount`, `cropSafetyRejectedCount`, `candidateBudgetRejectedCount`, `otherEligibilityRejectedCount`, and `finalReplacementCandidateCount`. Aggregate `unusedReplacementEligibleCount` and `unusedReplacementRejectedCount` are also recorded.

The action assigns one primary rejection reason by stopping at the first hard rejection. Scene and chronology rejection counts remain zero because those are ranking preferences. Counters crossing the Server Action/editorial boundary are merged without adding the same observed candidate twice. Diagnostics contain no photo, pet, album, or user IDs.

## Recovery, Accounting, and Performance

- Existing recovery stages and photo accounting remain intact. The regression asserts `finalPhotoCount = originalPhotoCount - movedOutPhotoCount + movedInPhotoCount - replacedOutPhotoCount + replacedInPhotoCount`; successful replacement retains one photo with one replaced-out and one replaced-in.
- Replacement candidates remain bounded by the existing eight-candidate limits and recovery-strategy cap; no unused-photo-by-template Cartesian scan was added.
- The existing 80-second generation budget, no-synchronous-Vision behavior, and Preview-First persistence flow were not changed. The 80-second limit was not measured against production in this task.

## Verification

- `node --test tests/*.test.mjs` — 1044 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 warnings (same unrelated `<img>` and unused-variable warnings; no warning in changed files)
- `npm run build` — passed
- `git diff --check` — passed
- Focused editorial recovery suite — 28 passed, including empty-map rescue, low Best Shot score soft ranking, clipping rejection, crop-gate rejection, duplicate prevention, pet preservation, candidate bounds, 24/48/72P, and replacement accounting

## Production Acceptance

**Not verified.** No deploy, push, merge, or production album generation was performed. The Task078.2.9 aggregate is historical and no Task078.2.10 production `albumLayoutRecovery` event was collected. Album completion, `unrecoveredCount = 0`, Preview arrival, and visual acceptance for the same pet/photos at 24P therefore remain unconfirmed. The change must be deployed through an authorized process before those checks can validate this implementation.

## Remaining Acceptance Work

After authorized deployment, regenerate the same pet's album from the same production photos at 24P. Confirm `initialUnsafeSpreadCount > 0`, `unrecoveredCount = 0`, completion and Preview arrival; inspect the spread-3-equivalent funnel and recovery method; then visually check crop safety, clipping, duplicates, chronology, multi-pet balance, and the complete 24P preview.