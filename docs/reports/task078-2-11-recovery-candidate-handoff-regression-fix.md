# Task078.2.11 — Recovery Candidate Handoff Regression Fix

## Result

Implemented on `feature/task078-2-11-recovery-candidate-handoff-regression-fix`. Task078.2.10 eligibility and funnel diagnostics remain in place. The retry now uses the exact recovery checkpoint that produced the released-photo pool, and both passes' recovery telemetry is retained.

## Regression Root Cause

The first `buildEditorialDraft` pass performs the existing bounded recovery sequence before throwing for remaining unrecovered spreads. Its `workingStories` can therefore contain photo drops and sparse recoveries. Task078.2.10 used `error.currentPhotoIds` from that mutated state to classify released photos, but then rebuilt candidates against and retried the original `plan.spreads`.

That split state re-assigned released photos to their old spreads. The editorial retry then saw those handed-off IDs as occupied and rejected them in the duplicate guard before incrementing replacement attempt counters. The retry also replaced the first pass's stats with the second pass's fresh stats, hiding earlier photo-drop and safe-sparse attempts/successes.

## Handoff Contract

- `EditorialGenerationError` now carries a defensive copy of the current working stories as well as their currently assigned photo IDs.
- Candidate generation reads the checkpoint stories; the editorial retry receives those same stories and matching story IDs. Released IDs stay released; still-assigned IDs stay duplicate-protected.
- A missing map entry and an explicit empty array both permit the bounded fallback builder. A partial handoff is deduplicated and filled from the fallback pool up to the existing per-spread cap. Handoff IDs are excluded from fill-in candidates and the caller's method map is not mutated.
- Diagnostics distinguish handoff count, IDs actually present in editorial inputs, explicit-list presence, fallback-builder use, and list source (`handoff`, `merged`, `fallback_empty`, or `fallback_missing`). `finalReplacementCandidateCount` remains separate from actual `replacementCandidateCount`; attempts increment only after eligibility guards and immediately before normal safety evaluation.
- First-pass and retry attempt/success stats are merged. Initial unsafe/original counts come from the first pass; final photo usage and unrecovered counts come from the resumed pass. Per-spread stages retain the established recovery order.

## Recovery and Safety

The eligibility funnel still treats scene, pet continuity, chronology, and Best Shot score as ranking preferences; hard eligibility and pet-preservation guards remain enforced. All replacements still go through the regular template/safe-fallback, crop, frame, gutter, hero hierarchy, and subject-visibility pipeline. No safety threshold changed.

Existing recovery order remains intact: initial layouts, template fallback, safe fallback, role reassignment, replacement, density fallback, adjacent reflow, photo drop, then safe sparse layout. Recovery checkpoint stories ensure a previous drop is not undone on retry. Attempt counts represent evaluated candidates/operations, not generated candidates.

Replacement candidate caps remain bounded by the existing configuration. No full unused-photo × spread × template scan or synchronous Vision work was added. Preview-First persistence is unchanged.

## Regression Coverage

- Three handed-off candidates reach the editorial engine; one additional source-clipped unused photo is rejected; replacement/global attempts and a safe recovery occur.
- Released-photo checkpoint retry accepts an actually released photo, rejects an ID still assigned elsewhere, and keeps recovery photo counts unique.
- Empty explicit candidate maps still activate fallback; low Best Shot overall scores remain rank-only.
- Spread indexes 4, 5, and 11 use realistic 24P planner stories and verify candidate counts, photo drop, safe sparse recovery, and success counters.
- Existing crop-safety, source-clipping, duplicate, pet-preservation, candidate-bound, accounting, and 24/48/72P tests remain covered.

## Verification

- `node --test tests/*.test.mjs` — 1049 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 warnings. They are in unchanged files: existing `<img>` usage in dev/album pages and unused variables in album-order, smart-crop, and photo-grouping tests.
- `npm run build` — passed (Next.js noted this Apple Silicon environment is running under Rosetta; build completed successfully)
- `git diff --check` — passed
- Focused editorial recovery suite — 33 passed, including candidate handoff, released-photo retry, empty-list fallback, source/crop safety, and spread 4/5/11 sparse recovery

## Production Acceptance

**Not verified.** No production deploy, push, merge, or authenticated album generation was performed. No Task078.2.11 production `albumLayoutRecovery` event or Preview result is available. Consequently `initialUnsafeSpreadCount > 0`, restored production replacement/drop/sparse counts, `unrecoveredCount = 0`, Album completion, Preview arrival, and visual acceptance for the same pet/photos at 24P remain unconfirmed.

After an authorized deploy, regenerate the same pet's 24P album and confirm generated candidates are received and attempted, the Task078.2.9 replacement/drop/sparse paths execute when required, `unrecoveredCount = 0`, Album completes, and Preview passes the visual safety checks.