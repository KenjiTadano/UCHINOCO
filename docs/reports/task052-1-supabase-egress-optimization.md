# Task052.1 — Supabase Image Delivery / Egress Optimization

## Summary

通常画面のStorage画像を用途別に分離した。新規アップロードではoriginalを維持しつつ400px thumbnailと最大1600px PREVIEWを作成し、一覧はthumbnail、Album Draft / Digital EditorはPREVIEWを優先する。既存PREVIEWがない場合はthumbnail、最後にoriginalへfallbackする。AI解析と印刷は引き続きoriginalを使う。

この作業でDB migration、commit、pushは行っていない。既存の未commit差分は保持している。

## Audit

| Surface                                                                               | Browser image source                                       | Server / storage behavior                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pet photo timeline / favorites / search                                               | `createListImageUrls`; thumbnail first                     | PREVIEW fallback, then original for legacy objects                                    |
| Photo detail                                                                          | PREVIEW first; thumbnail fallback                          | Original is not the normal display source                                             |
| Album creation / add-photo / album history                                            | `createListImageUrls`; thumbnail first                     | Album selection and history grids share the list helper                               |
| Album preview / cover / checkout / order detail                                       | Thumbnail for grids and selectors; PREVIEW for order cover | Signed URLs are reused by path                                                        |
| Album Draft / Digital Album Editor                                                    | Deterministic full-frame PREVIEW URL                       | Active draft load does not invoke Vision or regenerate the album                      |
| `/dev/smart-layout`, `/dev/album-draft`, `/dev/smart-crop`, `/dev/photo-intelligence` | Thumbnail for candidate lists; PREVIEW for image previews  | Smart Crop and Photo Intelligence retain original input for analysis                  |
| `/dev/photo-grouping`                                                                 | Thumbnail / PREVIEW for displayed photos                   | Grouping's server-side analysis still downloads original                              |
| Best Shot                                                                             | Thumbnail for visible photo selection                      | Existing analysis behavior remains unchanged                                          |
| Print preview / PDF                                                                   | Preview-size image for the UI                              | PDF preparation downloads original from `pet-photos`; print-file delivery is separate |

The main browser-side risk was using large original objects in repeated grids and image previews. It is reduced for new uploads and for legacy photos with a stored thumbnail or generated PREVIEW. Existing photos with neither asset still fall back to original until backfill succeeds.

## Image Classes and Cache

- `THUMBNAIL`: 400x400, WebP quality 76, maximum 1 MiB; used for lists, selectors, and history grids.
- `PREVIEW`: longest side at most 1600px, WebP quality 82 with lower-quality retries, maximum 1 MiB; used for Album Draft, Digital Editor, and full-photo UI views.
- `ORIGINAL`: unchanged; used for print rendering and required AI/analysis inputs, plus a final compatibility fallback.
- Thumbnail and PREVIEW uploads set `cacheControl: 3600`. Original uploads also retain a one-hour cache setting.
- Signed image URLs are cached per process and user/bucket/path for up to 50 minutes (below their one-hour expiry); PREVIEW presence checks are cached for 10 minutes. This prevents repeated signing within the same server process. The cache is instance-local and is not a cross-instance cache.
- URL stability is preserved by caching signed URLs by object path. Browser cache reuse is therefore possible while the signed URL remains valid; a refreshed token can still cause a distinct browser cache key.
- Next/Image is used by several app views, but signed Storage URLs are marked `unoptimized` where appropriate, so image resizing is provided by the stored assets rather than Next's image proxy.

## Egress Estimate

The following is a comparison model, **not a measured Network-panel result**. It assumes an average original of 4.0 MB, thumbnail of 0.1 MB, and PREVIEW of 0.5 MB. Actual values vary by photo; thumbnail/PREVIEW have a 1 MiB maximum. Estimates count image bytes delivered to the browser only, not HTML, metadata, repeated visits, or server-side AI/print downloads.

| Case                              | Before |  After | Assumption                                                                             |
| --------------------------------- | -----: | -----: | -------------------------------------------------------------------------------------- |
| A. 36-photo grid                  | 144 MB | 3.6 MB | 36 originals replaced by thumbnails                                                    |
| B. 10-photo album/history grid    |  40 MB | 1.0 MB | 10 originals replaced by thumbnails                                                    |
| C. 10-photo Digital Editor        |  40 MB | 5.0 MB | 10 originals replaced by PREVIEW                                                       |
| D. 10-photo Album Draft result UI |  40 MB | 5.0 MB | 10 originals replaced by PREVIEW; AI-side original reads remain excluded and unchanged |

Under these assumptions, the browser image transfer is reduced by about 97.5% for grids and 87.5% for full-frame preview surfaces. These are scenario estimates only. A representative real before/after sample still needs browser Network measurements and object-size metadata.

## Changes

- Added shared delivery classes, deterministic PREVIEW paths, signed-URL caching, and PREVIEW-first fallback in `lib/photo-image-delivery.ts` and `lib/photo-list-images.ts`.
- New photo uploads create and validate thumbnail/PREVIEW assets while preserving original upload and database fields.
- The existing thumbnail backfill flow can also create PREVIEW assets and validates type and size before finalization. It was not run as a bulk operation during this task.
- Photo lists, album surfaces, dev selectors, order detail, and draft/editor loading use the appropriate list or preview helper.
- AI and print paths continue to consume original data. No print image source or PDF quality policy was changed.
- Updated the Editor structural regression test to assert PREVIEW helper usage instead of its obsolete expectation that Editor loading directly uses `pet-photos`.

## Verification

- `node --experimental-strip-types --test tests/photo-image-delivery.test.mjs tests/photo-list-images.test.mjs`: 6 passed.
- `node --experimental-strip-types --test tests/page-editor.test.mjs`: 23 passed.
- `node --experimental-strip-types --test tests/*.test.mjs`: 741 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Next.js 16.3.5.
- Scoped ESLint for the image-delivery implementation and affected routes/tests: passed.
- `git diff --check`: passed.

## Outstanding

- Real browser Network verification could not be performed in this continuation because no browser page was shared. In particular, grid requests should be checked for absence of original objects, Editor requests should resolve to PREVIEW objects, and print generation should be confirmed to retain original inputs.
- The 14-photo sample previously identified in the browser timeline has not had object-size metadata collected in this continuation. Replace the scenario model above with measured values after the page is shared.
- Legacy-photo backfill is not run. Until it completes, photos missing both thumbnail and PREVIEW can still deliver originals to normal UI surfaces.
- Storage egress from AI and print server-side original downloads is intentionally not reduced by this browser-delivery change and should be measured separately if it is a significant share of total egress.
- No commit or push was made.
