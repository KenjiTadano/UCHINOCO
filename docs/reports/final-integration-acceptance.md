# Final Integration Acceptance

Updated: 2026-10-18 JST. Application Preview commit: dd5e5141b5e356602489e34a0c93b87b8b54fffc.

## Status definitions

- PASS: verified with an existing real fixture.
- UNVERIFIED: required fixture does not exist (or browser steps remain incomplete); not classified as a code defect.
- FAIL: fixture exists and actual behavior contradicts expected behavior.

No all-items PASS declaration, main merge or Production deployment is authorized by this report.

## Previously accepted

Task083.3 generation regression PASS (user accepted): 24P, Preview reached, generationCompleted=true, outcome=ready, unrecoveredCount=0, duration 15.1s; Task081 selected19/unused5 retained, Task078 Recovery maintained.

Task084 original regression PASS (user accepted): secondary-pet replacement persists; Body Editor/main/thumbnail/list/Preview/reload agree. Cover identity and background sync PASS. See task084-replacement-picker-persistence-eligibility.md for details and limitations.

## Real fixture discovery

Owner resolved from the existing acceptance Album, never from client input. Read-only SELECTs covered all 20 owned Albums, 12 active draft versions and 109 spreads. No query error was ignored. No direct DB writes or layout changes were made for fixture discovery.

Effective layout uses user_layout_id ?? ai_layout_id. All 109 effective layout IDs resolve in the existing registry (unknown count 0). Contain detection uses the renderer's layout.imageFit and effective FINAL_NO_CROP identity; no FINAL_NO_CROP/effective contain spread exists. Current-owner No-Crop browser acceptance is therefore UNVERIFIED due to fixture absence, not FAIL. Fit/zoom controls were not counted as contain evidence.

Elements discovery uses the actual polishForLayout, visibleTextLayers, visibleDecorationLayers, row mappers, digitalNormalizedRect/toSpreadNorm and intersects functions. Existing page elements also occupy space. The same minimum-size/overlap checks as addElement were applied. Found 13 spreads with at least one supported free caption or decoration slot.

Chosen existing real fixture:

- Album: https://preview.example.test/pets/pet-fixture-01/album/album-fixture-01
- Editor: same URL plus /pages/edit?spread=0
- Active draft, draft status, spread index 0 (zero-based), layout L01, 8-page legacy real Album.
- Before edit: free caption bottom-center; free decoration deco-top-right, deco-bottom-left, deco-bottom-right.
- Full discovery inventory: outputs/task084-acceptance/fixture-discovery.json. Post-UI membership/layout check: fixture-discovery-after-ui.json. These are local artifacts.

## Elements browser acceptance — PASS

Verified with the discovered real fixture. Only normal user-authorized UI editing of the discovered real fixture is used; no fabricated DB fixture or artificial layout override.

Added text 思い出のひとこま in the existing free caption slot and tape decoration in a free decoration slot. Existing two page elements were preserved; element count became four. Editor main and thumbnail agree in IDs/types/text/SVG/position/size/rotation/color/font/alignment. The main's selected-element z-index highlight is a transient interaction state and was excluded from persisted-appearance comparison.

保存中 progressed to 保存済み without error. 完了 reached /edit; the four elements matched before and after list reload. Preview main and thumbnail matched the same four elements. After Preview reload finished rendering, all four elements still matched. A sample taken during the loading screen was excluded and its screenshot replaced by the fully rendered result.

Evidence:
- outputs/task084-acceptance/elements-editor-saved.png
- outputs/task084-acceptance/elements-preview-after-reload.png

The selected existing L01 caption box is shallow: the test phrase wraps at the current viewport. This run verifies synchronized content/geometry and persistence, not a general typography/overflow quality approval. No layout or style code was adjusted.

## Final status

- PASS: previously accepted generation/Recovery/subset, Task084 replacement persistence, body/list/Preview/reload, cover identity and background sync.
- PASS: Elements synchronization/persistence on an existing active real L01 fixture (text plus tape decoration).
- UNVERIFIED: genuine No-Crop/imageFit=contain browser acceptance. Current owner has zero matching active-draft fixtures; browser test cannot be performed against current real data. This is fixture absence, not a code FAIL. No artificial DB/layout modification was made.
- FAIL: no new synchronization/persistence mismatch observed in the completed fixture tests. All-items PASS is not claimed because contain remains UNVERIFIED.

No main merge or Production deployment. Reports and evidence are local/uncommitted.

## Change boundary

No application code, Safety thresholds, Task081 subset or Task078 Recovery change; no manual DB fixture writes, commit/push, merge or deployment during this discovery/acceptance task. Normal UI element saves are the only remote mutations.


Privacy note (2026-10-19): all fixture identifiers/URLs in this report are synthetic
examples. PNGs, discovery JSON and original report copies under outputs/ are
local-only, ignored by Git, and are not distributed with this canonical report.
