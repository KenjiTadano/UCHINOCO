# Task078.2.12 — Replacement Safety Final Rescue

## Outcome

Implemented on `feature/task078-2-12-replacement-safety-final-rescue`, preserving the Task078.2.11 checkpoint handoff and Task078.2.10 eligibility funnel. Replacement candidates now continue through the bounded registered one-photo safe layouts omitted by the ordinary top-three safe-fallback cap. The same strict crop/layout evaluator is used at every stage.

## Root Cause and Evidence Limits

The historical Task078.2.11 production event establishes that spread 3/6 candidates were generated, handed off, received, and attempted, but no candidate-specific rejection counters were present. Therefore it cannot tell us whether those individual photos failed crop, frame, hierarchy, clipping, or another safety condition.

A code-path gap is confirmed: `recoverCandidates()` evaluated the bounded regular template slice and at most three ranked safe fallbacks. Replacement failure then proceeded to adjacent reflow/photo drop; it did not evaluate the remaining registered one-photo safe layouts. Photo-drop recovery separately reaches `safe_sparse_layout`. Thus a replacement photo could be layout-safe in a registered one-photo sparse template yet remain untried. This changed path is now connected without relaxing any gate.

Role and crop metadata were also traced: a replacement variant rewrites the old photo ID in `photoIds`, `primaryPhotoIds`, and `secondaryPhotoIds`; `photosForSpread()` derives role from those current arrays. Crop work is keyed by replacement photo ID plus resolved frame, and `computeSmartCrop()` receives that replacement's own analysis. No old-photo role/crop cache is reused. Source clipping is evaluated on the replacement candidate itself.

The reported aggregate crop/hierarchy/clipping totals are album-wide and cannot be assigned to spread 3/6 individually. New telemetry gives one primary rejection reason per evaluated replacement and separately counts pre-layout source-clipping rejects.

## Change

For each eligible replacement, the engine now records candidate evaluation and runs:

1. The bounded regular one-photo template candidates.
2. The existing top-three registered safe fallbacks.
3. The remaining registered one-photo safe layouts as a bounded final sparse stage.

Every stage uses `buildSpreadDraft` and the same safety gates. Only a passing draft is adopted. Unsafe candidates remain rejected; no crop, gutter, frame, visibility, or hero threshold changed. Original/replacement story role arrays and candidate-owned geometry are retained.

Per-spread and aggregate anonymous counters cover evaluated/accepted replacements; crop, gutter, frame, hero, source-clipping, subject-visibility, unavailable-template/fallback, and other primary rejection reasons; plus normal/safe/sparse candidate, evaluated-layout, and accepted-layout counts. Existing Task078.2.10/11 eligibility and handoff diagnostics remain intact and are merged across recovery passes.

## Local Production-Equivalent Verification

A deterministic 24P editorial fixture has 12 spreads, with unsafe single-photo spreads at indexes 3 and 6 and two unused safe global replacement candidates. Result:

- `initialUnsafeSpreadCount > 0`
- `unrecoveredCount = 0`
- 12 editorial spreads produced
- both target spreads use their safe replacement photos
- 2 replacement candidates evaluated and accepted
- all 12 assignments are unique
- no blocking rhythm/audit issues

A separate regression forces normal and capped safe-fallback layouts to fail; the omitted fourth registered one-photo layout then passes the real `buildSpreadDraft` safety gate and is adopted as `safe_sparse_layout`. Mixed same-pet/global candidates verify an unsafe first candidate is rejected and a later safe candidate is accepted. Spread 4/5/11 photo-drop sparse tests continue to pass.

This fixture exercises editor generation, not authenticated persistence, a production database transaction, or a rendered Preview page.

## Verification

Final required repository gates:

- `node --test tests/*.test.mjs` — 1052 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 warnings in unchanged files: `<img>` usage in dev/album pages and unused variables in album-order, smart-crop, and photo-grouping tests
- `npm run build` — passed
- `git diff --check` — passed
- Focused editorial recovery suite — 36 passed

## Production and Visual Acceptance

**Not verified in production.** The requested constraints prohibit Production deploy, push, and merge. Running the same production photos before deploying this branch would exercise the old code, not this fix. No authenticated production album creation was attempted.

Therefore actual `Album completed`, `Preview reached`, production `unrecoveredCount = 0`, production `albumLayoutRecovery` values, and visual acceptance are still pending authorized deployment. The local 24P fixture establishes the maximum safe equivalent available here; it does not claim the production Definition of Done. Once deployment is authorized, regenerate the same pet/photos at 24P, confirm album completion and Preview navigation, and inspect spread 3/6 rejection traces plus crops, duplicates, chronology, pet balance, and the complete 24P book.
