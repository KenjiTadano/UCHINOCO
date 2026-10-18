# Task079.2 — Template Frame Metadata

## Result

Added a deterministic metadata projection over the existing template registries. No duplicate template registry was created, and Task079.3 matching logic was not introduced.

## Registry Coverage

The projection covers `ALBUM_LAYOUTS`, `DRAFT_HIERARCHY_LAYOUTS`, `EDITORIAL_TEMPLATES` (including existing safe fallbacks), and separately registered `NO_CROP_FINAL_TEMPLATES`. No-Crop remains outside normal selection/editor catalogs.

Frame geometry is mapped with the production `placeFrames()` routine and page safe-area geometry. Aspect ratio/orientation use the physically placed frame. Existing `slotRole` and importance derive hero/secondary/supporting role. `pageSide`, normalized left/center/right/full placement, gutter risk, full-bleed proximity, and `allowContain` are derived deterministically. Malformed/unplaceable frames return conservative unknown/high-risk metadata.

Registry ownership determines flags: safe fallbacks are `recoveryOnly` but retain current `userSelectable` behavior; No-Crop layouts are recovery-only and not user-selectable; normal and draft hierarchy layouts remain selectable. `allowContain` is false for circles, gutter-crossing frames, and high gutter risk.

## API

- `getTemplateFrameMetadata(layoutId)` returns all frame metadata for a registered layout, or `null` for an unknown ID.
- `deriveTemplateFrameMetadata(layout, frame, options)` exposes the same geometry projection for deterministic consumers/tests without registering another template.
- The API and `LayoutImageFit` type are exported from the Smart Layout public barrel.

## Verification

- `node --test tests/*.test.mjs` — 1064 passed, 0 failed
- `npx tsc --noEmit` — passed
- `npm run lint` — 0 errors, 12 existing warnings in unchanged files
- `npm run build` — passed
- `git diff --check` — passed
- Focused metadata registry suite — 3 passed

No ranking, frame assignment, Album generation, or existing template definition changed.
