# Task078.2.9 — Single-photo rescue and accounting repair

## Summary
This fix addresses the remaining recovery bug where a single unsafe spread could not recover even when an unused eligible photo existed, and where replacement accounting could drift from actual final photo usage.

### Root cause
- The fallback replacement pool was gated by a score field that is not part of the shared `LayoutPhotoInput` contract (`technical`).
- The replacement path could skip genuinely usable fallback candidates when a spread had no prebuilt replacement map.
- The recovery counters treated some fallback activity as a global replacement even when the recovery path was same-scene or explicitly scoped.

### Fix
- The fallback replacement pool now evaluates eligible unused photos using the shared candidate score contract (`overall` + `sceneRepresentativeness`) and keeps the quality floor.
- Single-photo unsafe spreads now recover through the unused eligible replacement path without requiring a prebuilt replacement map.
- The same-scene replacement scenario remains explicit and correctly counted via the provided `replacementMethodByPhotoId` map.
- Recovery statistics continue to distinguish same-scene, global replacement, and fallback usage without inflating the global count for the same-scene path.

## Verification
Executed on the branch `feature/task078-2-9-single-photo-rescue-accounting-fix`:

- `node --test tests/*.test.mjs` → pass, 1038/1038 tests passing
- `npx tsc --noEmit` → pass
- `npm run lint` → pass with warnings only, 0 errors
- `npm run build` → pass
- `git diff --check` → pass

## Production acceptance notes
The app is in a verified state for the editorial recovery path, with the requested acceptance conditions preserved:

- initialUnsafeSpreadCount > 0 is allowed for recovery scenarios
- unrecoveredCount = 0 for the repaired recovery path
- album completion is preserved for the task regression path
- preview generation remains reachable without the rescue path collapsing

This is a code-path fix only; no deployment or live production promotion was performed during this session.
