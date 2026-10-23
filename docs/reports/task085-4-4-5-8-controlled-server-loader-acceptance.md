# Task085.4.4.5.8 — Controlled server loader acceptance

## Decision

**HOLD under the specified strict post-heading-gap gate.** The fixed candidate improves all four target heading medians and p75s; the Preview five-second tail does not increase; Home control does not show systematic deterioration. Nevertheless candidate Edit has one repeated post-heading image/load gap. No additional optimization is made and no Production release is proposed for execution.

Print follows the explicitly permitted unchanged-source/default-call-path review policy. **Browser Print UNVERIFIED**, not PASS. No Service Role access is added. This is a disclosed limitation rather than the unresolved requirement of a newly required credential-parity experiment.

## Immutable comparison and scope

- Baseline application: Production `2dc0b3e9c0fb48aa59b409bdcfffd0a59ef1ff87`.
- Baseline comparison deployment source: `54f2425cf0c2fe222eed359da215f03cb5ffd97b`; its only difference from Production is a report. Application/lockfile/config diff is empty.
- Candidate application: `9eef1ff7844f9a1b2705766e3f57863b0a183a52`. Prior report-only commit `fb607ef` adds the previous acceptance report; application/config/lockfile diff from candidate remains empty. This task adds only the present report, without pushing another deployment.
- Both existing deployments are READY, configured sin1, same project and comparison branch/environment scope. Existing app-owned environment key-name sets match; credential values were not retrieved or compared. Print service credential is absent in both.
- No application, diagnostic, cache, auth/RLS, image, loader, RPC, migration or Production configuration change. No new deployment. Only the dedicated comparison Preview alias is temporarily switched between the two fixed deployments, with deployment ID checked after every switch. The alias is restored to its original candidate destination afterwards. Ordinary Preview alias and Production domains are untouched.
- Runtime logs use nodejs24.x. Configured Function region is taken from deployment metadata; log ingress/edge region is not treated as Function region proof.

## Protocol

One browser, existing authenticated session, same fixed comparison host, same existing 24P fixture, viewport 380×715. No logout/login repetition and no artificial cache clearing. Route order within each block is Preview → Edit → Page Editor → Complete → Home.

Odd pair order B→C; even pair order C→B. Blocks are B1, C1/C2, B2/B3, C3/C4, B4/B5, C5/C6, B6/B7, C7/C8, B8/B9, C9/C10, B10. Thus five pairs per direction. Each pair compares the same route and fixture; routes are grouped within each deployment block, not simultaneous measurements.

Formal observation window: 2026-10-23 21:31:03–21:39:27 JST. Preview/Edit/Page Editor receive two extra balanced pairs: B11, C11/C12, B12. Final counts: Preview 12 pairs, Edit 12, Page Editor 12, Complete 10, Home 10; **112 formal document loads**. Five earlier calibration loads use a serial load/image observer and are excluded explicitly, retained as private calibration evidence.

Load observation starts independently immediately after navigation return; it is not delayed until image completion. Heading observation retries bounded selector waits up to the observation deadline. Image completion uses DOM image bounding rectangles intersecting the viewport, complete/naturalWidth status, and repeated read-only observation. It is a viewport-image proxy, not a paint/decode timer and does not prove exact ancestor-clipped pixel visibility. Offscreen lazy images are not forced to load. Canvas sizing and all-card/thumbnail structure are read independently after heading. Console errors are sampled by timestamp for each navigation.

All times below are external wall-clock **observed** times including automation overhead. Navigation return is not TTFB. Heading-ready is not a hydration/interaction guarantee. Load event is not fully-ready. Browser performance timing/physical network request accounting is unavailable in this tool scope. No SQL execution time is inferred.

## Route distributions

All numbers are milliseconds, format median / nearest-rank p75 / observed max. Arrows are baseline → candidate. p75 uses sorted value ceil(0.75n), not interpolation.

### Preview

- Navigation return: 407.5 / 548 / 2844 (n=12) → 549.5 / 711 / 2063 (n=12).
- Heading: 1628 / 2447 / 5830 (n=12) → 1185.5 / 1453 / 2799 (n=12).
- Structure: 1638 / 2455 / 5836 (n=12) → 1193.5 / 1460 / 2804 (n=12).
- Load, matched successful pairs only: 1514 / 2308 / 5775 (n=11) → 1166 / 1683 / 2794 (n=11).
- Viewport-image completion proxy: 1648 / 2455 / 5836 (n=12) → 1193.5 / 1460 / 2804 (n=12).
- Heading median improvement: 27.2%; candidate faster in 11/12 matched pairs.
- Heading >5,000 ms: 2 → 0.

### Edit

- Navigation return: 379.5 / 399 / 560 (n=12) → 368 / 398 / 543 (n=12).
- Heading: 1067.5 / 1156 / 1524 (n=12) → 973.5 / 1017 / 1287 (n=12).
- Structure: 1074 / 1161 / 1529 (n=12) → 982.5 / 1023 / 1292 (n=12).
- Load, matched successful pairs only: 1076.5 / 1262 / 3220 (n=12) → 814 / 952 / 2662 (n=12).
- Viewport-image completion proxy: 1125 / 1273 / 2990 (n=12) → 995.5 / 1046 / 2608 (n=12).
- Heading median improvement: 8.8%; candidate faster in 10/12 matched pairs.
- Heading >5,000 ms: 0 → 0.

### Page Editor

- Navigation return: 393.5 / 448 / 765 (n=12) → 345.5 / 387 / 554 (n=12).
- Heading: 1516.5 / 1693 / 3226 (n=12) → 987.5 / 1038 / 1180 (n=12).
- Structure: 1523.5 / 1702 / 3232 (n=12) → 994.5 / 1055 / 1187 (n=12).
- Load, matched successful pairs only: 1435 / 1669 / 3222 (n=11) → 879 / 1084 / 3321 (n=11).
- Viewport-image completion proxy: 1523.5 / 1702 / 4465 (n=12) → 994.5 / 1055 / 3043 (n=12).
- Heading median improvement: 34.9%; candidate faster in 12/12 matched pairs.
- Heading >5,000 ms: 0 → 0.

### Complete

- Navigation return: 355 / 408 / 461 (n=10) → 333 / 427 / 724 (n=10).
- Heading: 1152.5 / 1326 / 1677 (n=10) → 966.5 / 1057 / 1575 (n=10).
- Structure: 1158.5 / 1333 / 1688 (n=10) → 975 / 1067 / 1580 (n=10).
- Load, matched successful pairs only: 1094.5 / 1323 / 1688 (n=10) → 842 / 889 / 1499 (n=10).
- Viewport-image completion proxy: 1158.5 / 1347 / 1714 (n=10) → 975 / 1086 / 1580 (n=10).
- Heading median improvement: 16.1%; candidate faster in 8/10 matched pairs.
- Heading >5,000 ms: 0 → 0.

### Home

- Navigation return: 397.5 / 422 / 435 (n=10) → 364.5 / 436 / 512 (n=10).
- Heading: 1224.5 / 1405 / 2328 (n=10) → 1185 / 1284 / 1654 (n=10).
- Structure: 1234.5 / 1414 / 2335 (n=10) → 1191 / 1290 / 1659 (n=10).
- Load, matched successful pairs only: 1210.5 / 1397 / 2182 (n=10) → 1143.5 / 1215 / 1645 (n=10).
- Viewport-image completion proxy: 1560.5 / 1913 / 2842 (n=10) → 1632 / 1814 / 2293 (n=10).
- Heading median improvement: 3.2%; candidate faster in 6/10 matched pairs.
- Heading >5,000 ms: 0 → 0.

## Tail, load gaps, and censoring

Preview: baseline heading samples 6 and 11 are 5,276 and 5,830 ms; candidate max is 2,799 ms, with zero >5 s samples. Sample 6 required two heading-selector retries; its 5,276 ms is an observation boundary, not proof of an equally long server response. Sample 11 has a successful load observation at 5,775 ms. No candidate five-second-tail increase is observed in this sample.

Two baseline load waits hit the browser automation deadline despite requesting a longer timeout: Preview pair 6 and Page Editor pair 4. Their returned 3,592 and 3,537 ms are **censored deadline observations**, excluded from load distribution statistics together with their matched candidate partner, retained in raw evidence and other metrics. Subsequent DOM/image observations succeeded. Extra pairs leave at least 11 valid matched load pairs per target route; no timeout is misreported as a successful load event. Matched-successful load maxima do not bound censored event times. Heading and image statistics retain every formal pair; load comparison uses the same successful-pair subset on both sides.

Edit: all 12 body cards and sized canvases are present at heading in every sample. Gap >1,000 ms from heading to successful load occurs baseline 2/12 versus candidate 1/12. Candidate pair 1: heading 987 ms, viewport-image proxy complete 2,608 ms, load 2,662 ms; at heading, 7 of 14 viewport-intersecting image boxes are pending. This is a genuine observed residual image/load wait, not a missing-card or zero-size canvas failure. Its rate, median, p75 and maximum improve, but the user's explicit “Edit load gap再発 → HOLD” rule is not silently relaxed.

Page Editor: all main/thumbnail structures are sized, and 12 rail thumbnails are present at heading. Heading max improves 3,226 → 1,180 ms; no four-second heading sample occurs in either cohort. Viewport-image proxy >=4 s is baseline 1/12 versus candidate 0/12. Candidate pairs 1/2 still have post-heading image/load waits: 1,180/3,099 and 1,105/3,321 ms heading/load, with 9/9 and 5/9 viewport-image boxes pending at heading. Candidate load maximum therefore is not claimed to improve. These samples are retained.

Home: heading median 1,224.5 → 1,185 ms, p75 1,405 → 1,284, max 2,328 → 1,654, candidate wins 6/10. Viewport-image median is slightly higher (1,560.5 → 1,632) while p75/max decrease. This is mixed image variance, not a consistently slower candidate period. The prior one-directional Home deterioration is not reproduced. With n=10 this is limited evidence, not proof that all environmental variance is removed.

## Same-window runtime evidence

Read-only runtime windows are restricted to the formal measurement window and fixed deployment IDs. Each contains 46 Album-stage request groups: 12 Preview, 12 Edit, 12 Page Editor, 10 Complete. Groups join to browser route/pair by same cohort and request timestamps; one group per observed non-Home document. Home has no matching Album-stage diagnostic and no Home server lifecycle is fabricated. Actual group counts and candidate-only stage signatures corroborate alias source attribution. Baseline 206 and candidate 448 info-level records; zero error-level records in the captured windows.

B1's safe string/JSON log parser is used. No executable log evaluation. No runtime request IDs, fixture IDs, private URLs or credentials are copied into this canonical report.

Candidate stage median / p75 / max, milliseconds:

### Preview stages

- pre-draft-auth: 76.5 / 200 / 430 (n=12).
- draft.version: 49 / 55 / 98 (n=12).
- body-metadata: 215.5 / 238 / 383 (n=12).
- cover: 57 / 65 / 104 (n=12).
- signing: 44 / 48 / 363 (n=12).
- saved-preview: 314 / 337 / 734 (n=12).
- return-boundary: 0 / 0 / 0 (n=12).

### Edit stages

- pre-draft-auth: 56.5 / 64 / 89 (n=12).
- album: 54 / 78 / 186 (n=12).
- pet: 57.5 / 70 / 187 (n=12).
- draft.version: 48 / 56 / 212 (n=12).
- body-metadata: 202 / 230 / 284 (n=12).
- cover: 59 / 62 / 68 (n=12).
- signing: 44 / 49 / 100 (n=12).
- draft-cover-signing: 299 / 332 / 418 (n=12).
- return-boundary: 0 / 0 / 0 (n=12).

### Page Editor stages

- pre-draft-auth: 50.5 / 75 / 170 (n=12).
- album: 70.5 / 79 / 195 (n=12).
- pet: 64 / 76 / 104 (n=12).
- draft.version: 55.5 / 72 / 111 (n=12).
- draft: 299 / 321 / 386 (n=12).
- candidate-context: 107 / 111 / 167 (n=12).
- candidate-photos: 95.5 / 107 / 201 (n=12).
- candidates: 280.5 / 373 / 506 (n=12).
- suggestion: 81 / 100 / 257 (n=12).
- analytics-scheduling: 0 / 0 / 0 (n=12).
- return-boundary: 0 / 0 / 0 (n=12).

### Complete stages

- pre-draft-auth: 39 / 55 / 439 (n=10).
- draft.version: 47.5 / 56 / 61 (n=10).
- return-boundary: 0 / 0 / 0 (n=10).

Read groups overlap: do not sum draft/candidates/suggestion or body/cover durations as a critical path. The zero-ms return boundary is a marker cost, not RSC serialization/send or total lifecycle.

For directly comparable existing stages, Preview element-group median/p75/max is baseline 151.5/183/1,513 versus candidate 146.5/167/217 ms. Version 49.5/57/100 versus 49/55/98. Page Editor element-group 145/189/570 versus 128/133/190; Edit 144/210/357 versus 128.5/163/204. Not every DB stage speeds up: this task evaluates removed work and overlapping boundaries, not a universal DB speed claim.

Baseline Complete has draft.spreads, draft.elements and draft.preview-urls in all 10 requests. Candidate Complete has **zero** such stages across all 10, with version metadata still present. Baseline Preview has detail.list-image-urls in all 12; candidate Preview has none. Thus metadata-only Complete and saved-draft Preview early return are confirmed at runtime.

Baseline pre-draft auth, album/pet, cover and whole-bundle timings were not instrumented. Candidate-only stages are reported as such, not invented before/after deltas. Physical Auth/DB/Storage HTTP and cache hit/miss counts are unavailable. Logical read reduction is not physical HTTP reduction; zero signing duration would not prove a cache hit. No exact server lifecycle, RSC bytes or SQL duration is inferred.

Gap-specific evidence: candidate Edit pair 1 draft-cover-signing is 302 ms (body 212, signing 46), album/pet 41/59 and auth 50 ms. Page Editor pairs 1/2 draft are 334/386 and candidates 416/426 ms, overlapping. Those bounded server stages cannot by themselves account for the post-heading 1.7–2.2 s wait. Pending image boxes directly support an image-delivery/load residual; Storage transfer versus decode/hydration is still unseparated.

## Correctness, security, and save

Current read-only observations: 112/112 headings and route structures eventually ready, zero console errors, zero complete-but-broken images, zero document horizontal overflow. Page Editor has a sized main and 12 sized thumbnails; Edit has 12 body cards. Both versions show 76 replacement candidates, including the same known secondary-pet candidate. Opening/closing the picker does not save a replacement. No empty-state/loading-picker redesign is introduced.

The fixed candidate's Task085.4.4.5.7 save acceptance remains applicable: background change → saved → Back → Edit → Preview → reload → restore, revision 15→16→17 and clientSeq 9→10→11, unchanged photo/crop/layout/spread/cover hashes. This task does not introduce another mutation merely for measurement. A final read-only DB state equals the prior restored state exactly: revision 17, background restored, frame/spread/cover hashes unchanged, 12 spreads, accepted event count 1, order count 0.

Owner navigation and Multi-Pet candidates are reconfirmed. Prior candidate wrong canonical route-pet 404 and automated owner/membership/uploader/shared-reader/reset/24–48–72-page coverage are reused because application SHA is identical. No claim of a fresh second-account browser family/wrong-owner acceptance is made; those remain browser UNVERIFIED. No unauthenticated flash or auth loop was observed within the authenticated comparison, which does not substitute for a fresh anonymous test.

No auth/RLS/ownership validation, revision/clientSeq, signed-URL isolation, mutation or safety contract is changed. Source and existing automated coverage are not replaced by timing results.

## Print policy and diff review

Chosen policy: no new Secret. **Browser Print UNVERIFIED due to missing Preview environment parity**; no runtime failure is deliberately retriggered as a substitute for acceptance.

Print page/actions, private original image-facts/inspection, raster/orientation, quality blockers, snapshot/revision validation and admin client source are unchanged between fixed baseline and candidate. Shared `read-draft.ts` does change, so “all transitive Print source unchanged” would be inaccurate. Review confirms Print calls readDraft without the optional render context and signedPreviewUrls without a context; these use the original active-version SELECT, URL-resolution-enabled default and original path/signing/auth behavior. Added context path is opt-in. The list-image helper's verified-user override is likewise optional; default behavior remains. Type-only context import does not supply an authorization token to Print.

This limits regression risk through code review and existing tests; it does **not** prove live Print warnings, originals or quality results. No Service Role value is fetched, added, published or logged; no owner check or original inspection is bypassed. No checkout/order/PDF operation is attempted. Any future mandatory browser parity gate requires separate explicit branch-scoped credential approval.

Genuine No-Crop/imageFit=contain browser acceptance remains **UNVERIFIED due to fixture absence**. No artificial fixture is created and no PASS is invented.

## Verification and privacy

No application/config/diagnostic source change in this task. Reuse the fixed candidate's 1179/1179 tests, TypeScript PASS, lint zero errors/12 existing warnings, and successful ordinary build retry from Task085.4.4.5.7. These were not rerun for this report-only task. The previously recorded Next security advisory remains unresolved; successful retry was not a dependency fix.

Current checks: report whitespace/diff check, application-tree invariance, canonical-report privacy scan, and ignored private-evidence check. Evidence under the task outputs directory is local-only and includes raw browser samples, alias mapping proofs, runtime windows and parsed stage groups/statistics, picker counts and read-only state. No source secret, real fixture identifier, host, absolute local path or signed URL belongs in the report.

Production post-check: READY at original Production SHA, unchanged. No deployment, main push/merge, region/env change or ordinary Preview alias change. The dedicated comparison alias is restored to candidate.

## Recommendation and stop

Main distribution gates are favorable, with no Home control invalidation and no increased Preview five-second tail. Nevertheless the strict Edit gap gate remains **HOLD**. Keep this implementation fixed; do not add another speculative loader optimization.

Next proposal: a dedicated post-heading image/load tail investigation, correlating browser image-request completion and decode/visibility evidence with existing server stages. Request new diagnostics only if necessary and separately scoped. Current candidate metadata stages and absent Preview five-second tail do not establish metadata remote wait as the dominant remaining cause; **Snapshot/RPC is not justified by this run alone**. Pending-image evidence is also insufficient to authorize a general React/bundle rewrite or Task085.5.

Candidate may be reconsidered as a Production release candidate only after the explicit residual-gap policy is resolved; no auto deploy or policy relaxation. Stop here. No RPC, Task085.5 or UI redesign starts.
