# Task085.4.4.5.9 — Post-heading image / load tail investigation

## Outcome

Investigation completed, with explicit observability limits. **Production adoption remains HOLD; no optimization or release is performed.** Image-loading activity accompanies the earlier post-heading tails; the later naturally warmed formal cohort does not reproduce a one-second post-heading gap. Network response completion versus browser decode/scheduling cannot be separated in this tool scope. Do not convert the warm result into a universal fix or label React/RPC as the cause.

## Fixed source and safeguards

Candidate is exactly `9eef1ff7844f9a1b2705766e3f57863b0a183a52`. Existing comparison alias resolves to that READY deployment, configured sin1. No alias switch, new deployment, application/config change, RPC, DB/Storage mutation, cache clear, fixture creation, save, replacement or layout mutation. Print is outside scope.

Use the existing authenticated browser session, same existing 24P fixture, same deployment and 380×715 viewport. Read-only UI navigation selects Preview body; no edit is saved. Existing GET analytics behavior is not redesigned. No signed image URL string is stored, even in image-unit evidence.

## Protocol, observer correction, and cohort limits

The first diagnostic pass contains Edit 20, Page Editor 10 and Preview 10 documents. It exposed a measurement error: the renderer intentionally gives loading images opacity 0. An observer that excludes opacity-0 images must not count them as offscreen. Raw complete/naturalWidth/src-presence and document timing remain useful; its visible/offscreen partition is **invalid for pending images**.

An additional 40 setup documents were retained when persisted-payload validation showed that the intended correction was not used by the older measurement closure. They are not silently pooled into the formal distribution. A new measurement entry point explicitly receives the corrected observer and asserts that the saved image records include opacity. No application code is involved in this correction.

Formal verified cohort: **Edit 20 documents; Page Editor 10; Preview 10**. Geometric viewport membership intersects image bounds, viewport, and clipping ancestors; CSS hidden/display-none is excluded, but opacity is recorded separately rather than excluding a loading image. Each saved image unit has ordinal only, src-present and currentSrc-present booleans, complete, naturalWidth/Height, bounding rectangle, loading/decoding/fetchpriority attributes, opacity, renderer load-state, and generic body-card/rail/other grouping. No photo IDs, names, filenames, src/currentSrc strings, or signed URLs are saved in these records.

All three passes total 120 document loads (60 Edit, 30 Page Editor, 30 Preview). Their chronological cache warmth is a material limitation: **80 diagnostic/setup loads preceded the 40 formal loads**. There was no artificial cache clear, but the formal cohort is warm-like and cannot establish cold performance. The diagnostic data are retained separately, not discarded because they contain slower outcomes.

Order per round: Edit → Page Editor → Edit → Preview. Formal window: 2026-10-24 13:28:44–13:30:02 JST; diagnostic/setup starts 13:20:45 JST. These are within-candidate observations, not a new baseline/candidate comparison.

External observation boundaries include browser automation overhead. Navigation return is not response EOF/TTFB; heading is not first paint or verified hydration; load event and DOM readyState complete are reported separately. Load wait deadlines are never relabelled as successful load events. Image completion means allocated viewport image complete with positive naturalWidth, not a measured pixel paint/decode time. No decode(), replacement image, forced offscreen scroll or network/cache manipulation is invoked.

## Browser API availability

**PerformanceResourceTiming: UNAVAILABLE.** The read-only browser scope reports performance unavailable; no resource entries, image request-start, response-end, transfer duration, bytes, connection/DNS, or individual response status are available. No substitute estimate is invented. Decode duration is also UNAVAILABLE. The route's load-state waiter and document.readyState are distinct observations, not network timing.

Signed URL helper/signing duration is server-side URL preparation and **not image transfer time**. An img element is not a unique HTTP request; repeated/identical sources can be deduplicated by the browser. No physical Auth/DB/Storage HTTP count is inferred.

## Formal distributions

Milliseconds, median / nearest-rank p75 / max. Every formal load wait succeeded; no censored formal load values.

### Edit

- Navigation return: 374 / 400 / 788.
- Heading observed: 1023 / 1111 / 2403.
- Structure ready observed: 1072.5 / 1148 / 2421.
- Load event observed: 745.5 / 1127 / 2324.
- Allocated viewport images complete: 1072.5 / 1217 / 2421.
- DOM readyState complete observed: 1072.5 / 1217 / 2421.
- Heading with viewport pending images: 1/20, maximum 2.

### Page Editor

- Navigation return: 349.5 / 405 / 878.
- Heading observed: 967 / 1093 / 1740.
- Structure ready observed: 984 / 1103 / 1751.
- Load event observed: 728 / 1078 / 1714.
- Allocated viewport images complete: 984 / 1103 / 1751.
- DOM readyState complete observed: 984 / 1103 / 1751.
- Heading with viewport pending images: 0/10, maximum 0.

### Preview

- Navigation return: 342.5 / 388 / 406.
- Heading observed: 867.5 / 926 / 1156.
- Structure ready observed: 875.5 / 938 / 1164.
- Load event observed: 781.5 / 908 / 1073.
- Allocated viewport images complete: 875.5 / 938 / 1164.
- DOM readyState complete observed: 875.5 / 938 / 1164.
- Heading with viewport pending images: 0/10, maximum 0.

Formal Edit has zero >1-second post-heading gaps across 20 documents. Nineteen headings have no pending images; sample 10 has two allocated viewport images pending, complete=false, naturalWidth=768, src/currentSrc present and opacity=1. Heading 1,111 ms → image completion 1,362 → load observation 1,285. Dimensions/currentSrc presence do not prove complete network response, so this short transient is not labelled a decode-only or React delay.

Formal Page Editor headings have no pending images in all ten samples. Main and thumbnail canvases are sized and all twelve thumbnail controls are present. Formal Preview initial cover headings have no pending images in all ten. Body selection then shows a sized main and fourteen rail tabs; body/rail viewport-image completion after selection is 290–374 ms, with pending count zero at the first post-selection observation. Body/rail image sources have already been exercised by the preceding Edit/Page Editor routes; this is not a cold-body benchmark.

Across 40 formal documents, all 740 heading image-unit records have src present; there are zero broken images, console errors, or document horizontal overflows. There are no heading observations with complete=true, positive naturalWidth and opacity=0. Thus no persistent transparent-loaded-image/render stall is demonstrated. This does not measure decode/paint or rule out transient hydration effects between observations.

## Diagnostic tails retained and classified

First diagnostic Edit pass has four >1-second heading-to-DOM-complete gaps. These independent document/complete flags remain valid even though its visibility partition was wrong:

- Sample 1: heading 1,867 ms → DOM complete 5,234; gap 3,367. Eighteen img elements globally incomplete at heading. Draft-cover-signing 720 ms, signing 274.
- Sample 3: heading 1,392 → DOM complete 3,418; gap 2,026. Twenty-one globally incomplete. Successful load observation 3,381. Draft-cover-signing 523, signing 172.
- Sample 5: heading 2,461 → DOM complete 6,709; gap 4,248. Twenty-one globally incomplete. Draft-cover-signing 1,154, signing 208.
- Sample 11: heading 2,385 → DOM complete 4,425; gap 2,040. Twenty-three globally incomplete. Draft-cover-signing 995, signing 364.

All have img src attributes present at heading. Late missing URL attributes are not observed. All eventually become complete with positive naturalWidth and no broken-image error. Three diagnostic load-state waits reached the tool deadline; their deadline returns are censored, and the later DOM-complete times above are **not called load-event times**.

**A–E classification:**

- The four diagnostic post-heading tails are **E for precise B versus C attribution**, with a strong observed image-loading correlate. Response/resource timing is unavailable: complete=false cannot distinguish network request still running, response received with browser decode/loading work, or resource scheduling. The invalid opacity-based viewport partition prevents assigning a trustworthy viewport-only D interval to these samples.
- **B and C: not separately verified.** No image response time is known. Do not call a pending img a measured active network request.
- **D: not established.** Formal images already complete at most headings have no prolonged post-heading gap; the diagnostic pass still has globally incomplete images during its wait. No persistent completed-image-but-render-blocked case is demonstrated.
- **A candidate, separate from the post-heading issue:** formal Edit sample 13 has heading 2,403 ms with all images already complete. Its element read-group 1,566 ms / body metadata 1,610 / draft-cover-signing 1,719 support a pre-heading server-loader wait. It has no post-heading tail. Actual complete response EOF is unobserved; this is a source/stage-supported pre-heading classification, not a fabricated network return timestamp.

Do not select Case D (release reconsideration) solely because the later warmed formal samples are fast: the diagnostic pass reproduced the original symptom and cold-like location attribution is incomplete.

## Lazy loading and card placement

The fixed candidate mounts all twelve Edit body thumbnails through the shared DraftSpreadThumbnail → DraftSpreadView renderer. Its nineteen body-card image elements have loading/decoding/fetchpriority unspecified, including offscreen cards. At the stable viewport, two body cards are fully within the viewport, three partially intersect, seven are offscreen. None of these body images has loading=lazy. One other image is marked lazy; it is not a body-card image.

Offscreen card images are not required for the formal viewport-image readiness metric. They may still participate in browser document load when not lazy, so document load is not equated with album usability. The first diagnostic pass cannot quantify how many pending images were geometrically offscreen because opacity and position were conflated. This source-level eager/offscreen behavior is a plausible contributor, **not proof of bandwidth contention or the exact four-tail cause**.

No geometry/crop/contain renderer split, loading attribute or image source is changed. Source inspection uses the fixed candidate checkout, not the older performance branch.

## Same-sample server/browser correlation

B1 safe data parser reads the existing runtime logs for the combined window. One hundred twenty Album-stage groups match the 120 document windows; forty belong to the formal cohort (20 Edit, 10 Page Editor, 10 Preview). Matching uses cohort, route order and timestamps; private correlation identifiers stay out of this report. There are 1,350 info records and no error-level records in that window.

Formal Edit stage median / p75 / max in ms:

- Auth: 56.5 / 81 / 329.
- Album: 50 / 67 / 275; pet: 57 / 79 / 819. Independent owner reads overlap.
- Version: 46 / 59 / 189.
- Body metadata: 162 / 187 / 1,610; cover: 45.5 / 59 / 130. These overlap.
- Signing: 38 / 46 / 72.
- Draft-cover-signing bundle: 251 / 302 / 1,719.
- Return-boundary marker: 0 / 0 / 0, measuring marker cost, not serialization/send or request lifecycle.

The four diagnostic tails have signing 172–364 ms. These stages finish before the heading observation; they must not be re-labelled as the subsequent multi-second image transfer. The stages help reject an unsupported claim that all post-heading delay is still URL signing, without proving the network/decode split.

Formal Page Editor draft median/max 242/975 ms, candidates 183/325, suggestion 84/810; they overlap, not add. Formal Preview saved-preview bundle median/max 257.5/447, signing 35.5/90, body metadata 153/203. The occasional pre-heading DB/Auth variation remains, but it does not explain away the diagnostic post-heading incomplete-image interval.

## Correctness and verification

No save, replacement, layout change, direct DB update, cache clear, artificial fixture, order, checkout or Print operation. Final read-only fixture state equals the prior restored state exactly: revision 17, background clientSeq 11, identical frame/spread/cover hashes, 12 spreads, accepted count 1 and order count 0. No new dependency/build/application verification is required for read-only measurements and a report. Existing candidate verification is referenced, not claimed as freshly rerun.

Report checks: privacy scan, whitespace/diff checks, unchanged application/config tree, ignored private evidence. Image snapshots contain no URL strings, tokens, photo IDs or local paths. Raw deployment/runtime correlation evidence is local-only under the ignored task outputs directory; it is not committed. Historical genuine No-Crop browser coverage remains UNVERIFIED due to fixture absence.

## Recommendation and stop

**Leading direction: dedicated image loading/delivery observability, not a speculative optimization.** Existing src presence plus pending complete flags support an image-side loading/scheduling residual, but network versus response/decode is E/UNAVAILABLE. The observer error and natural warming prevent a definitive cold-path root cause.

Next scoped proposal should obtain privacy-safe image resource/load/decode correlation in a supported browser or explicitly approved Preview-only diagnostic, then decide whether offscreen eager loading or delivery/scheduling warrants a minimal change. No timestamps or URL data should be invented to bridge the current tool limitation.

Do not start Snapshot/RPC for this post-heading residual: RPC cannot resolve an already assigned image's transfer/decode. Do not start Task085.5 based on pending images or a fast shell: no completed-image render stall was demonstrated. Keep Production adoption HOLD until the image-side uncertainty or residual-gap acceptance policy is explicitly resolved.

Stop after this report. No Production release, RPC, Task085.5 or UI redesign.
