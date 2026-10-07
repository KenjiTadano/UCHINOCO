# Task054 — PrintSpec Alignment & Layout Design Audit

## 1. Current PrintSpec Audit

Before Task054 the draft editor used page rectangles of `414 × 816` display units (ratio 0.507), while draft PDF geometry assumed a `180 mm` page width and derived height from the full `1076 × 1264` canvas. The cover used an unrelated `709 / 941` ratio. The paid-order pipeline also has a separate 210 mm square product definition. These values were not a single physical specification.

Magic numbers were present in `lib/album-draft/config.ts`, `lib/album-print/config.ts`, and the PDF spread renderer. Bleed, the editor's inner trim margin, and the spine inset were expressed as unrelated display pixels. PDF body content was emitted as one landscape spread page rather than provider-sized portrait pages.

## 2. Provider Specification

Current candidate: 製本直送.com, A5 portrait. Trim is 148 × 210 mm, bleed is 3 mm on every edge, PDF page is 154 × 216 mm, and the minimum safe inset is 3 mm inside trim. The provider target is CMYK and does not correct aspect ratio.

## 3. Single Source of Truth

`lib/album-print/print-spec.ts` is now the source for trim, bleed, safe inset, PDF size, trim ratio, provider, and target color space. Editor page geometry and draft PDF geometry derive from it. Binding-specific extra gutter remains `0`/unconfirmed rather than being guessed; the common 3 mm safe inset is still applied at the inner edge.

## 4. Editor / PDF Ratio

Editor left/right pages now derive their height from `148 / 210`. PDF output is split from the editor's two-page spread into individual 154 × 216 mm pages. Each page has a 3 mm trim offset and explicit TrimBox/BleedBox metadata. The cover uses the same 154 × 216 mm physical page size.

The PDF renderer still uses pdf-lib RGB drawing primitives. A true CMYK output profile/PDF-X conversion is not implemented and remains a production-prepress issue.

## 5. L01–L14 Audit

Coverage is the sum of normalized frame areas; overlaps are not present in the catalog.

| ID | Count | Family/purpose | Coverage | Orientation / crop | Print review |
| --- | ---: | --- | ---: | --- | --- |
| L01 | 1 | hero | 73.9% | landscape-friendly | KEEP; strong single hero |
| L01b | 1 | hero | 39.6% | portrait-friendly | TUNE later; intentionally quiet but near lower bound |
| L02 | 2 | sequence | 77.4% | portrait pair | KEEP |
| L03 | 2 | sequence | 79.2% | landscape pair | KEEP |
| L04 | 3 | story | 77.6% | landscape hero + square support | KEEP |
| L05 | 3 | collage/equal | 57.6% | square/equal | KEEP; editorial whitespace |
| L06 | 4 | story | 77.4% | landscape hero, mixed support | KEEP; circle slot may require crop fallback |
| L07 | 4 | grid/equal | 73.9% | square-heavy | KEEP |
| L08 | 3 | story | 75.4% | mixed | KEEP; circle detail is the crop-risk slot |
| L09 | 3 | detail | 65.3% | portrait pair + detail | KEEP; deliberate side breathing room |
| L10 | 2 | collage/equal | 66.9% | square pair | KEEP |
| L11 | 3 | story | 67.4% | portrait hero + support | KEEP |
| L13 | 5 | story | 73.9% | portrait hero + four support | KEEP after slot remap fix |
| L14 | 5 | collage/equal | 45.2% | mixed balanced grid | TUNE later; quiet but intentional, not removed for compatibility |

There is no L12 in the current catalog. It was not invented or renumbered because persisted layout IDs are compatibility-sensitive.

## 6. Dead White Space Analysis

L01/L02/L03/L04/L06/L07/L08/L13 have strong 70–80% coverage. L05/L09/L10/L11 use moderate whitespace with an identifiable composition. L01b and L14 are below or close to the quiet range; their whitespace remains intentional and compatibility-safe, but both are marked for later visual tuning. New five-photo layouts target roughly 59–76% coverage to avoid the weak lower-page white fields seen in sparse dense layouts.

## 7. L13 Root Cause

On manual layout changes, persisted frame rows retained the original AI layout's `frame_id`. `toPreviewSpread()` changed geometry by array index but returned the stale persisted slot ID. Rendering and editing code therefore mixed the selected layout's placement with old slot identity, which could make L13 selection/crop lookup appear missing or map to the wrong slot. Preview assignments now use the selected layout's slot ID while retaining the same ordered photo rows and user photo/crop overrides.

## 8. Layout Fix

Manual layout changes keep the same ordered photos, rebuild placement from the selected layout, and expose selected-layout slot IDs. Five-photo dense spreads no longer fail the equal-primary hard gate merely because a deliberate hierarchy exists; crop, ownership, uniqueness, gutter, and unusable-frame gates remain.

## 9. New 5-photo Layouts

Five-photo choices increased from 2 to 8:

- L13 portrait hero + four support
- L14 balanced grid
- L15 landscape hero + four bottom support
- L16 four support + right portrait hero
- L17 two leads + three support
- L18 editorial asymmetric steps
- L19 center portrait hero + four corners
- L20 balanced two + three grid

All contain exactly five uniquely named frames and are evaluated by the existing deterministic assignment/crop scoring.

## 10. Layout Families

Existing `hero`, `story`, `sequence`, `collage`, and `detail` purposes remain unchanged. In rhythm reporting these continue to map to the established hero/story/equal/grid/quiet concepts. No persisted IDs were removed.

## 11. Orientation Affinity

L15 supplies a wide-hero candidate, L16/L19 supply portrait-hero candidates, L17 supports paired portrait leads, and L20 gives near-equal mixed/square input a non-hero grid. Existing orientation scoring remains the selector; no hard orientation filter was added.

## 12. Crop Safety

New layouts use only existing landscape, portrait, and square Smart Crop frames. No new crop algorithm or unsafe mask was introduced. Circle-heavy additions were avoided. Strict/fallback/unusable ranking and face/head/ear/scale gates remain active.

## 13. Layout Picker UX

The picker now draws every candidate from its real normalized frame rectangles instead of cycling four generic thumbnail schemas. For five photos it exposes all eight layouts; the currently selected/recommended layout remains selected and first-class. Manual switches retain all five photos.

## 14. Browser Verification

The local app started on port 3001 and redirected an unauthenticated browser to `/login`, confirming the protected editor boundary. A real persisted 1/2/3/4/5-photo album could not be opened without using the user's credentials. Therefore authenticated visual switching is marked for human review; automated editor/render tests cover geometry and assignment integrity.

## 15. PDF Physical Size Verification

The PDF regression test loads generated bytes with pdf-lib and checks every page against 154 × 216 mm converted to points (tolerance 0.02 pt). One spread now produces two body pages plus the cover. TrimBox is 148 × 210 mm inset by 3 mm; BleedBox is the full page.

## 16. Human Review

- 1 photo: L01 KEEP; L01b TUNE for excessive quietness on some landscape sources.
- 3 photos: L04/L08 KEEP for narrative hierarchy; L05 KEEP for equal-quality sets; L09/L11 KEEP with orientation-aware selection.
- 5 photos: L13/L15/L16/L17/L18/L19/L20 KEEP; L14 TUNE later but retain for compatibility and quiet equal-quality use.
- Required authenticated human check: confirm all eight five-photo picker thumbnails, six or more switches, crop appearance, and print-preview comparison with representative portrait/landscape photos.

## 17. Regression

Smart Layout tier ordering, orientation affinity, hero scoring, crop fallback, rhythm, editor persistence, snapshot determinism, and PDF rendering are covered by the existing suite plus Task054 assertions.

## 18. Tests

`node --experimental-strip-types --test tests/*.test.mjs`: PASS — 743 tests, 0 failures. Node emitted the pre-existing module-type performance warning.

## 19. TypeScript

`npx tsc --noEmit`: PASS.

## 20. Build

`npm run build`: PASS with Next.js 16.3.5 webpack. The environment emitted the existing Apple Silicon/Rosetta 2 warning.

## 21. Lint

Task054 scoped ESLint: PASS.

## 22. git diff --check

PASS after final verification.

## 23. Known Issues

- pdf-lib output is RGB; provider-target CMYK/PDF-X conversion and ICC profile remain unresolved.
- Binding method and any additional inner gutter allowance require provider/product confirmation. It is deliberately not conflated with the 3 mm safe inset.
- The paid-order 210 mm square product pipeline is separate from this draft A5 candidate. It must not be silently switched until the commercial SKU/provider contract is confirmed.
- Authenticated browser visual review remains required.

## 24. commit / push

Not performed. Existing uncommitted work was preserved.
