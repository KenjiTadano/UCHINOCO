# Task079.3 — Photo × Frame Matching Engine

## Result

Implemented a bounded suitability-aware ranking layer in the existing Smart Layout assignment engine. Photo selection, template candidate generation, crop safety thresholds, assignment tiers, and Task078 recovery were not replaced or removed.

## Compatibility Score

`scorePhotoFrameCompatibility()` produces a normalized 0–1 ranking preference using:

- orientation suitability for the derived template-frame orientation
- logarithmic source/frame aspect-ratio compatibility
- hero score for hero frames, otherwise the best supported orientation score
- full-bleed score when the frame is full bleed
- subject anchor vs. frame placement
- orientation-specific crop-safe preference, with a weaker contain-compatible preference
- gutter-risk penalty

A source-clipped photo is strongly down-ranked but is not accepted/rejected by this score; existing source clipping and layout safety gates remain authoritative.

The score is computed once per photo/frame pair per layout and fed into the already-existing bounded spread permutation ranker. The maximum additional contribution to a layout assignment score is four points. Photos without `layoutSuitability` receive no bonus (`suitabilityFit = 0`) and retain prior ranking behavior. Per-layout diagnostics expose compared/matched pair counts, suitability-photo count, average pair score, and the assignment's `suitabilityFit` subscore.

## Safety and Fallback

The compatibility score only orders assignments. Strict/fallback/unusable tiers still come from the existing crop/frame evaluator; gutter, visibility, hero hierarchy, integrity, and source checks remain unchanged. If metadata is absent, no compatibility pairs are scored. No-Crop final recovery and all Task078.2 Recovery stages remain intact.

## Regression Coverage

- Compatibility score is normalized and explainable across orientation/aspect, role, full-bleed, anchor, crop-safety preference, and gutter penalty.
- A two-photo hero/support assignment changes toward the hero-suitable image when metadata is present.
- The same photos without suitability retain the original assignment order and zero suitability contribution.
- Crop-safety tier is unchanged for unsafe source/photo inputs; suitability cannot turn an unusable tier into a passing tier.
- Existing 24/48/72P, multi-pet, diversity, rhythm, crop safety, replacement, and recovery tests remain covered.

## Verification

- `node --test tests/*.test.mjs` — 1066 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 existing warnings in unchanged files
- `npm run build` — passed
- `git diff --check` — passed
- Focused Task079.3 compatibility tests — 2 passed

No production album generation or visual acceptance was requested or performed as part of this matching foundation task. It adds ranking behavior only when validated Task079.1 suitability is available; subsequent production impact should be measured through existing recovery/safety diagnostics before increasing the ranking weight.
