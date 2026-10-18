# Task079.4 — Production Impact Validation & Matching Tuning

## Production Baseline Availability

No Task079.3 production album-generation run or `albumLayoutRecovery` matching record exists in the repository. The Task079.3 implementation report explicitly records that production generation was not performed. Therefore a same-pet/same-real-photo-set historical production comparison could not be reconstructed, and this report does not claim one.

## Same-24P A/B Measurement

Added a deterministic 24P A/B fixture using the exact same selected photos, spread plan, geometry, layout candidates, and safety evaluator. The baseline removes only `layoutSuitability`, which reproduces the pre-Task079.3 score path; the matching run uses the same photos with Task079.1 suitability attached.

Both runs were already safe:

- Baseline: 12 spreads, `initialUnsafeSpreadCount = 0`, `unrecoveredCount = 0`, no replacement or photo-drop attempts
- Matching: 12 spreads, `initialUnsafeSpreadCount = 0`, `unrecoveredCount = 0`, no replacement or photo-drop attempts
- Changed spread assignments: 0

The matched run reported 168 frame evaluations, 532 photo/frame pairs, 1242 assignment candidates, 67 optimized layout assignments, 52 portrait / 70 landscape / 46 square matches, 168 crop-safe preferences, 63 hero preferences, 0 full-bleed preferences, and average pair score 0.8073. The baseline reported 67 legacy fallback layout evaluations; matching mode reported 0. The same-run shadow baseline and matched initial unsafe counts were both zero.

This fixture validates diagnostics and confirms no regression, but it does not show a safety/recovery reduction because the fixture had no initial unsafe spreads. The focused two-photo hero/support test confirms the score can change the assignment when Suitability preferences conflict. No weight change was justified by this evidence; the existing maximum four-point contribution remains unchanged.

## Instrumentation

`albumLayoutRecovery` now carries a `photoFrameMatching` aggregate with spread/frame evaluation counts, pair and assignment counts, optimized/legacy counts, orientation/crop-safe/hero/full-bleed preference counts, average compatibility score, and initial unsafe before/after matching. It contains counts only, no photo IDs. Recovery retries merge these metrics while retaining the first-pass initial unsafe comparison.

## Verification

- `node --test tests/*.test.mjs` — 1067 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 existing warnings in unchanged files
- `npm run build` — passed
- `git diff --check` — passed
- Focused Task079.3 matching suite — 3 passed

## Production Follow-up

Production impact is **not verified**. The same real pet/photo set is not available as a saved local baseline, and no Task079.3 production telemetry was collected. No deployment or production album generation was performed in this task. Before tuning the 0.04 weight, capture a before/after run using the identical selected pet, photos, album settings, and 24P in a Production-equivalent environment; compare unsafe spreads, safety reason counts, recovery attempts, completion, and Preview reachability.
