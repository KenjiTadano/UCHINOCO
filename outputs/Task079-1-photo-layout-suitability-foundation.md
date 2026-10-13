# Task079.1 — Photo Layout Suitability Foundation

## Result

Added a deterministic, versioned `PhotoLayoutSuitability` foundation without changing Album matching behavior or adding a Vision call. It is embedded in the existing fingerprinted `subject_geometry` result, avoiding a duplicate analysis row, table, or migration.

## Model and Derivation

`lib/smart-layout/suitability.ts` exposes:

- source orientation and source aspect ratio, derived from dimensions rather than reused as layout suitability
- portrait, landscape, and square scores from the existing Smart Crop candidate/frame matching evaluators
- per-orientation crop-safety booleans using existing Album crop gates and source-clipping checks
- hero score from best frame compatibility and combined subject occupancy
- full-bleed score from frame compatibility and source-aspect fit
- source clipping, padded subject safe area, deterministic subject anchor, and analyzed timestamp

Scores and result parsing are bounded and version-checked. Geometry without a detectable in-bounds subject is not marked crop-safe. Existing source geometry remains the source of truth; suitability is derived metadata.

## Save and Read

Successful/fallback subject-geometry writes through `saveAnalysis` add the suitability object to the same JSON result. Existing fingerprint identity, result status, owner-scoped write RPC, and immutable-success policy are unchanged. The stored geometry parser accepts legacy results without this field; Album generation deterministically derives suitability from their current geometry in memory. Valid stored suitability takes precedence. No separate suitability cache row is added.

## Verification

- `node --test tests/*.test.mjs` — 1061 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors; 12 existing warnings in unchanged files
- `npm run build` — passed
- `git diff --check` — passed
- focused analysis-persistence and generation-performance tests — 23 passed

No Album selection or template-matching algorithm was changed in Task079.1. Production rollout/analytics were not part of this foundation task.
