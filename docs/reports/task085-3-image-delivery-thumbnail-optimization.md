# Task085.3 — Image Delivery & Thumbnail Optimization

Status: PASS for image delivery / geometry / persisted-state acceptance on 2026-10-20 JST, with measurement limitations and No-Crop UNVERIFIED below. Task085.2 and Task085.2.1 are PASS per user decision; Task085.4 is not started.

## Existing derivatives and source contract

`lib/photo-image-delivery.ts` defines the existing settings: thumbnail 400 × 400, WebP quality 76; preview maximum dimension 1600, quality 82 (client conversion retries at 72 / 62 to stay within 1 MiB). Both use cacheControl 3600. `lib/photo-thumbnail.ts` creates thumbnails by center-cropping a square, but previews scale the complete image with its aspect ratio preserved, without enlargement.

Upload form creates both in the browser; photo Actions validate uploaded paths, size, MIME and ownership. Original is `photos.storage_path` in private `pet-photos`; `thumbnail_path` is persisted in photos; no `preview_path` or `original_path` database column exists in this contract. Preview path is deterministic (`photoPreviewPath`: original stem + `.preview.webp`) in `pet-photo-thumbnails`. Successful uploads/backfills remember preview presence in process-local, user-keyed caches. Analysis does not generate these derivatives. Existing explicit thumbnail-backfill Actions and the legacy backfill flow can create derivatives, but none was invoked here. The thumbnail migration adds the path/storage contract, not automatic historical object creation.

Normal GET main delivery chooses a cached/known preview, otherwise stored thumbnail, otherwise original. Unknown preview assets are deliberately not probed individually during normal GET. This means “thumbnail missing” and “preview presence not discovered by this server instance” are distinct. This task does not rewrite main delivery or upload settings.

## Per-use Before policy

- Preview main: active draft previewUrls; known preview → stored thumbnail → original. Cover uses the existing cover renderer and cover URL resolution.
- Preview body rail: same previewUrls as main, all 12 spread thumbnails mounted.
- /edit body list: same previewUrls and shared DraftSpreadThumbnail renderer.
- Page Editor main: same previewUrls and shared DraftSpreadView.
- Page Editor rail: same previewUrls, plus optimistic local spread state.
- Replacement picker: candidate.thumb from createListImageUrls when thumbnail_path exists; otherwise candidate.src. Main replacement selection uses candidate.src / known main URL.
- Cover Editor: existing main source / candidate thumbnail logic remains unchanged.
- Background and Elements: existing color/gradient, text, SVG and decoration layers; no photo-derivative substitution is applied to these layers.

Before FrameImage uses a plain img without loading/decoding hints. Main and thumbnails may share URLs, so many DOM image elements do not imply duplicate network transfer. Native lazy loading can load nearby offscreen content early; it is not virtualization.

## Minimal change

`readDraft` reuses its existing photo SELECT to produce an additional optional thumbnailUrls map. Main previewUrls stay unchanged. DraftSpreadView remains the single geometry/crop/contain renderer; only the URL passed to FrameImage is different in thumbnail mode. Crop math, object positioning, layout and digital geometry are unchanged.

For an existing derivative selected by main, thumbnail retains that exact source. This prevents replacing a full-frame preview with a square center-cropped thumbnail, which would alter crop/contain evidence. For an actual original fallback selected by main, thumbnail uses Supabase signed transformation delivery with existing 400 × 400 bounds, quality 76 and resize=contain. The returned image retains full source aspect ratio (measured 400 × 300 for landscape). This is a read-only delivery resize, not Storage/DB backfill. The Storage transform mode named contain does not change the album's imageFit: cover/contain still comes only from the existing renderer.

Transformation signing is bounded to four concurrent calls, cached by user + purpose + path with the existing 50-minute lifetime. A failed signing operation keeps the existing main URL. Browser transform failure also retries that same main URL. No authorization checks are removed; signed transformation URLs are issued by the existing authenticated Supabase client/RLS path. No public bucket, arbitrary URL proxy, service-role runtime, or new cache sharing across owners is introduced.

Thumbnail img alone receives loading=lazy and decoding=async. Main receives neither mechanical lazy loading nor a thumbnail URL. Save/revision/clientSeq/merge sequencing and mutations remain unchanged; the extra delivery map is disposable read data, not persisted state.

## Observability

Album image delivery logs contain aggregate counts only: totalPhotoCount, thumbnailPathAvailable, previewAvailableCount, previewUnknownCount, previewResolvedCount, mainDerivativeAvailable, transformedThumbnailCount, originalFallbackCount. One batch signing request checks deterministic preview paths; availability is cached per user for ten minutes separately from main's presence cache, so it cannot alter main source selection. Failure is counted as unknown rather than absence. Thumbnail path availability is a DB-path count, not proof of a successful browser decode. Original fallback count describes server URL issuance; a later browser transform failure can fall back and must be checked in browser acceptance.

No photo/pet/album/user IDs, signed URLs, tokens or paths are logged. Raw private evidence is local-only in ignored outputs/task085-3.

## Real fixture discovery and payload comparison

Same existing 24P album: 20 unique AI/user frame photo records; 19 effective visible frame photos. Read-only DB and Storage inventory found 13 thumbnail objects, 4 preview objects (all also have thumbnails), and 7 with neither derivative. Existing preview objects total 852,246 bytes; stored thumbnails total 332,900 bytes. No Production objects or rows were changed.

The seven original fallback JPEGs were fetched read-only and compared with their transformed delivery payloads (WebP negotiated):

- Before: 25,263,973 bytes; 109,904,256 native pixels.
- After transformed delivery: 138,472 bytes; 840,000 native pixels; maximum side 400.
- Payload reduction: 99.45%; native pixel reduction: 99.24%.

These are actual response-body bytes for the same seven sources, not measured total browser transferred bytes. They exclude headers, browser/CDN caching, unchanged derivatives, and main original images. Actual browser wire request count/transferSize and decode CPU remain unmeasured with the available interface; native pixels are a decode workload proxy only.

## Browser Before (380 × 715)

- /edit: 25 img elements, 21 unique img URLs, 7 original img elements.
- Preview body: 20 img elements, 19 unique URLs, 8 original img elements (includes main / duplicate photo use).
- Page Editor: 21 img elements, 19 unique URLs, 9 original img elements (includes selected-main controls).

Three document reload UI-ready samples each: /edit 4964 / 4583 / 4268 ms; Preview 4185 / 6179 / 5322 ms; Page Editor 6576 / 5417 / 4928 ms. Heading/saved-marker readiness includes automation overhead and excludes full image decode. Preview reload starts in cover mode; body image inventory is a separately selected state. These are not randomized controlled latency comparisons.

## Verification and remaining acceptance

1176/1176 tests PASS; TypeScript PASS; lint 0 errors / 12 existing warnings; build PASS; git diff --check PASS. After browser measurement is pending. Required After checks include same main URL class/dimensions, crop/layout/contain geometry parity, secondary-pet identity, saved/reload consistency, and fallback handling. Genuine persisted No-Crop fixture remains UNVERIFIED due to fixture absence; do not label it PASS. Unit/regression evidence is separate.

No broad React memo/windowing, bundle split, migration, generation, Recovery, subset, Safety, imageFit or save contract changes are included. Backfill is a separate optional future task: explicitly authorized bounded derivative creation using existing ownership checks and verified full-frame previews; no such mutation was performed here.

Reference: Supabase's official image transformation documentation supports signed, aspect-preserving read-only delivery and notes plan/usage requirements: https://supabase.com/docs/guides/storage/serving/image-transformations. The existing project returned HTTP 200 in the read-only capability probe. No project settings or plan were changed. Additional transformation usage remains subject to the existing provider quota.

## Read-only real helper check

The actual helper was executed with existing real photo records using a local read-only administrative discovery client (not a browser/RLS acceptance substitute). Counts: totalPhotoCount 20; thumbnailPathAvailable 13; previewAvailableCount 4; previewUnknownCount 0; previewResolvedCount 0 on cold main cache; mainDerivativeAvailable 13; transformedThumbnailCount 7; originalFallbackCount 0. This verifies the app fallback logic against existing objects, but does not establish authenticated Preview/browser success or actual initial browser transfer bytes.

## Preview handoff

Git Integration Preview is READY for exact commit e5feffac461c79ae51958b468fe02ae96b1a6616. Opening the real album edit route on this new deployment redirects to `/login`; authenticated After browser measurement is blocked pending user login on the new host. The prior host's login does not authorize this host automatically. No app change or extra deploy was made after this observation.

Task085.3 is not yet PASS: After browser UI-ready samples, actual DOM source counts, main/thumbnail geometry and identity comparison, reload checks, and client transform fallback evidence remain pending. The measured 99.45% payload reduction is specifically the seven read-only transformed responses, not claimed browser-wide transfer reduction. Raw evidence remains ignored and local-only. Prior uncommitted reports are preserved separately from this implementation commit. Final report-only diff/privacy checks pass.

## Combined acceptance / CTA follow-up request

On 2026-10-20 JST the user requested Browser After Acceptance before Task085.3.1 implementation. Browser inventory still shows the acceptance deployment at `/login`; a login handoff was requested. No application code was changed during this follow-up. CTA and print/order source investigation was performed independently and recorded in the Task085.3.1 report, but its implementation remains gated on Part A completion. Task085.4 is not started.


## Browser After Acceptance (2026-10-20 JST)

Authenticated acceptance used the same real 24P album and verified actual 380 × 715 DOM viewport on the exact implementation Preview commit.

- /edit: img count 25 → 25; unique img URLs 21 → 21; original img elements 7 → 0; transformed thumbnail elements 0 → 7.
- Preview body: img count 20 → 20; unique URLs 19 → 20; original img elements 8 → 1; transformed thumbnail elements 0 → 7.
- Page Editor: img count 21 → 21; unique URLs 19 → 20; original img elements 9 → 2; transformed thumbnail elements 0 → 7. The two remaining original elements are main/editor controls, not rail thumbnails.

Separate URLs can increase unique-source count by one because main retains the original while its thumbnail is transformed. These DOM counts are not browser wire request counts. All seven transformed rail sources loaded at 400 × 300 or 300 × 400, lazy + async. The main original retained natural 4032 × 3024 and normal loading attributes. Original/derivative choice for main was not downgraded.

All 19 frame IDs across each route had exactly matching normalized source-object identity, crop triples, digital frame geometry, and imageFit when compared with the stored Before evidence. The selected layout remained unchanged. The existing secondary-pet photo was selected again through the real picker, saved successfully, followed by completion navigation, list reload, and Preview re-entry; identity/crop and saved content remained consistent. No artificial DB/layout fixture or derivative backfill was made.

Actual FrameImage callback code was additionally executed from trusted repository source in an isolated component-handler check: transform error → authorized main fallback; fallback load → loaded state; repeated failure → error callback; cover crop unchanged; contain objectFit / transform=none unchanged; main loading attributes unchanged. This is execution of the real handler, not an injected browser network failure. No browser network fault or persisted contain fixture was fabricated.

UI-ready After samples (three document reloads each): /edit 6689 / 3438 / 3357 ms (mean 4494.7; Before 4605.0); Preview 4752 / 8052 / 4725 ms (mean 5843.0; Before 5228.7); Page Editor 4749 / 4458 / 4668 ms (mean 4625.0; Before 5640.3). Small, non-interleaved samples and varying cold/cache conditions do not establish a latency regression or sufficient overall speed. In particular Preview still waits 4–8 seconds: this is not described as fast or resolved. Task085.4 remains required after CTA review, not implemented here.

Observed browser console errors: 0. Read-only runtime acceptance window: error-level records 0, region hnd1. Actual authenticated aggregate: total 20, thumbnail path available 13, preview available 4, preview unknown 0, transformed 7, original fallback 0. Real response payload comparison remains the seven-source 99.45% reduction, not a claim of measured browser-wide transferred bytes. Native pixel workload proxy decreased 99.24% for those seven sources.

PASS applies to the image delivery/quality/geometry/secondary-pet/saved-state goals and existing local verification. Genuine persisted No-Crop remains **UNVERIFIED due to fixture absence**. Wire transfer counts/total bytes and decode CPU are unavailable; browser network-failure injection was not performed (handler execution and signing-failure tests cover the branch). No application code was changed during this acceptance. Task085.3.1 may now proceed; Task085.4 must wait.
