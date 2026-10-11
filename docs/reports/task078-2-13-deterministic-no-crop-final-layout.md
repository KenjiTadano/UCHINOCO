# Task078.2.13 — Deterministic No-Crop Final Layout

## Root Cause

The previous recovery stages always used `object-fit: cover` Smart Crop assignments. When all crop-based templates and the bounded sparse fallback failed, the engine had no final way to show the full source image. Adding more cover templates or replacements could still fail the same crop-safety gate.

## Design and Apply Conditions

Added four separately registered final layouts: centered portrait and landscape frames on the left or right page. Each frame remains inside a 4% outer margin and away from the center gutter. The layout is excluded from normal editorial templates, candidate ranking, and user layout choices. A deterministic story-ID hash chooses the side; source orientation chooses portrait/landscape.

No-Crop runs only after the existing replacement, reflow, photo-drop, and safe-sparse stages fail for a single-photo spread. It tries the current photo first, then failed replacement variants in candidate order. It deduplicates photo IDs and rejects candidates assigned elsewhere, source-clipped sources, invalid dimensions/focal points, missing visible-pet geometry, or subject bounds outside the source. Multi-photo spreads are not eligible.

For a valid candidate, Smart Crop safety is measured over a full-source window whose aspect ratio matches the original image, using the identity transform `{ x: 0.5, y: 0.5, scale: 1 }`. The existing `scoreSmartCrop`, frame matcher, and normal assignment safety gate still run; frame, gutter, subject visibility, face/head/ear safety, and single-photo frame-size rules remain active. No thresholds were relaxed.

The No-Crop `imageFit: contain` value travels on the layout/assignment and is reconstructed from the persisted layout ID. The renderer centers the full source, disables crop transforms and corner masking, and shows neutral existing frame background in the unused area. Crop drag, zoom, fill, and reset controls are hidden for contain assignments. No database schema change was needed.

## Replacement and Diagnostics

A source-clipped current photo is rejected as a No-Crop candidate. Existing eligible replacement ranking remains active; each replacement then runs normal layouts, safe fallback, safe sparse, and finally No-Crop. Replacement story role and single-photo timeline/scene metadata are refreshed from the selected replacement so the whole-album chronology audit uses the actual image.

Aggregate counters: `noCropLayoutAttemptCount`, `noCropLayoutSuccessCount`, `noCropReplacementAttemptCount`, and `noCropReplacementSuccessCount`. Per-spread counters include candidate/evaluation/acceptance/rejection counts and identifier-free reasons: source clipping, invalid geometry, frame invalidity, gutter violation, subject visibility, and other. Retry merging preserves these fields. No photo or pet IDs are logged.

## Production-Equivalent Verification

The local deterministic 24P fixture reproduces unsafe single-photo spreads at indexes 3 and 6, supplies two distinct unused replacement photos, and forces crop-based layouts to fail for those targets. Both recover through No-Crop:

- `initialUnsafeSpreadCount = 2`
- `unrecoveredCount = 0`
- `noCropLayoutAttemptCount = 2`
- `noCropLayoutSuccessCount = 2`
- `noCropReplacementSuccessCount = 2`
- 12 spreads, 12 unique assigned photos, no blocking editorial audit issues

Additional regressions verify portrait and landscape containment with identity transforms; safe gutter placement; source-clipped rejection before layout evaluation; invalid geometry rejection; clipped original replaced by a valid contain candidate; persisted layout-ID reconstruction to `imageFit: contain`; no-crop crop controls disabled; and existing spread 4/5/11 safe-sparse recovery.

This is production-equivalent editor-generation coverage. It does not create an authenticated database album or render the production Preview route.

## Verification

- `node --test tests/*.test.mjs` — 1059 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 warnings in unchanged files (existing `<img>` usage and unused variables)
- `npm run build` — passed
- `git diff --check` — passed
- Focused editorial suite — 43 passed

## Production and Visual Acceptance

**Not verified in production.** Production deployment, push, and merge were not performed. The shared production page therefore runs older code; regenerating production photos there could not verify this change and was not attempted. No production `albumLayoutRecovery` event, persisted Album completion, browser Preview arrival, or 24P visual review is available.

After an authorized deployment, regenerate the same pet and photos at 24P. Verify `initialUnsafeSpreadCount > 0`, `unrecoveredCount = 0`, No-Crop attempt/success counters when needed, persisted Album completion, and Preview arrival. Visually confirm full-image visibility, undistorted aspect ratio, page/gutter bounds, neutral margins, no duplicates, and intact multi-pet/chronology balance.
