# Task085.4.4.5.10 — Image Resource Timing & Loading Diagnostics

## Decision

Investigation complete. **Image fetch-completion tail reproduced; Production release remains HOLD.** This is primarily acceptance Case B (image delivery/fetch lifecycle), with offscreen preload overlap supporting a subsequent bounded loading/preload experiment. Competition is a hypothesis, not proven causation. No optimization, release, RPC, save, data mutation or client-render redesign was performed.

## Source and environment

- Fixed application candidate: `9eef1ff7844f9a1b2705766e3f57863b0a183a52`.
- Measured diagnostic-only commit: `a36c46c47542483c4bcff492b96138bbcf348f32`; Preview READY, configured `sin1`, no Service Role supplied.
- Changes are limited to instrumentation-client, diagnostic numeric serializer/observer, hydration-safe hidden output, Preview-only build flag/root mount, and tests. Loaders, image delivery/source/quality, preload/loading/priority, render geometry, authorization and persistence are unchanged.
- Same authenticated browser, comparison host, real 24P fixture and 380×715 viewport. Production tab/session and Production deployment were untouched.
- After measurement, the comparison alias was verified restored to the original fixed candidate. The diagnostic branch/deployments are isolated artifacts, not a Production release candidate.

## Protocol and validity

45 valid document loads: Edit 25 (20 required + 5 bounded follow-up), Page Editor 10, Preview 10. Routes were interspersed, then five additional Edit reloads. Formal window: 2026-10-24 16:06:57–16:19:53 JST, plus the last sample's bounded observation. Preview starts on cover; after document load the Body selector is clicked while observation remains active. Body selection is a read-only UI operation, and later body requests must not be interpreted as delayed initial scheduling.

A new diagnostic deployment provided a cold-like opportunity without purging caches. Existing session/browser/CDN warmth was retained: **guaranteed cold UNVERIFIED**. One pre-formal probe is excluded because an early diagnostic output caused a React hydration mismatch. The observer was corrected to publish only after the client outlet mounts; the replacement build was reverified before all formal measurements. A tool timeout interrupted one navigation after ten saved samples; that navigation is excluded and its index was rerun. No excluded or interrupted run is admitted to the 45-sample distribution.

All 45 valid samples: zero captured console errors, zero observed image errors/broken images, no observer failure/cap exhaustion. Maximum single observer scan 6.6ms (Edit), 3.7ms (Page Editor), 2.8ms (Preview). This bounds observed scan work, not every instrumentation overhead; diagnostic execution may still affect timing.

## Observer and privacy design

`instrumentation-client.ts` installs the observer before hydration. A buffered PerformanceObserver handles both `img` and `link` initiators (image preloads are important here). MutationObserver plus 250ms snapshots captures existing image elements and load/error events. Observation stops after document load +4s, relevant image completion and quiet interval, or a 30s ceiling. Limits: 160 images, 320 resource keys, bounded event history. Source attributes, image objects, loading/priority, navigation readiness and application state are not changed.

Output contains only generic route/group enums, DOM/resource ordinals, timing/numeric dimensions, viewport rectangles/intersection, opacity, attribute enums and existence booleans. Resource names are used only in a temporary in-memory URL-to-element map, never serialized/logged; maps and observers are cleared at stop. No pathname, filename, signed URL, query, credential or real entity ID is in diagnostic records. No telemetry endpoint or beacon is added. Browser output is recursively allowlisted before local persistence. Runtime logs are parsed in memory with the B1 safe parser; only numeric stage durations/timestamps, static stage names and numeric ephemeral group ordinals are retained. Raw responses/request paths are not saved.

Two independent Production exclusions exist: server mount checks Preview environment; client checks a Preview-only build flag. This code must stay on the diagnostic branch.

`img.decode()` is **UNVERIFIED_NOT_INVOKED**: calling it can initiate decoding and is not a passive duration measurement. No extra Image objects/reloads are created. Native responseEnd→load is evidence about the observed post-response interval, not an isolated decode measurement.

## Distributions

All milliseconds from native navigation time origin. Median is nearest-rank p50; p75 likewise. Heading is DOM observation, not a paint measurement. Native load can precede a late observer heading timestamp, so small negative heading→load gaps are valid and are not clamped into artificial delays.

- **Edit, n=25:** heading median 1129.5 / p75 1513.9 / max 3021.1; document load median 1059.9 / p75 1705.6 / max 12284.7. Heading→load >1s: **4/25**.
- **Page Editor, n=10:** heading median 1070.2 / p75 1297.5 / max 2440.4; document load median 1103.5 / p75 1321.5 / max 4435.8. Heading→load >1s: **1/10**.
- **Preview, n=10:** heading median 1141.4 / p75 1553.4 / max 1626.1; document load median 1166.3 / p75 1593.4 / max 1644.8. Heading→load >1s: **0/10**. These load values describe initial cover document load, not the later intentional Body selection.

Document load is not the all-offscreen-images readiness criterion. Viewport image events are analyzed separately below; offscreen resources are recorded only to understand overlap and native load behavior.

## Tail samples and correlation

Edit sample 1:
- document responseEnd 2993.9; heading 3021.1; document load 4993.9.
- slow visible partial body image: fetch startTime 2997.8, responseEnd 4987.2, load 4990.4; fetch duration 1989.4; responseEnd→load **3.2ms**.
- final offscreen body image: startTime 2998.5, responseEnd 4990.6, load 4993.7; post-response **3.1ms**.
- server signing 488ms; draft-cover-signing 876ms; return-boundary log observed at navigation +2977.9ms.

Edit sample 6:
- heading 2590.1; document load 9836.7; gap **7246.6ms**.
- visible partial fetch 2574.5→9382.9; load 9388.0 (**5.1ms** after responseEnd).
- final offscreen fetch 2575.3→9831.8; load 9836.5 (**4.7ms**).
- signing 475ms; body metadata 266ms; draft-cover-signing 857ms; return-boundary observed +2581.1ms.

Edit sample 7:
- heading 1513.9; document load 6696.9; gap **5183.0ms**.
- visible partial fetch 1505.7→6526.8; load 6534.1 (**7.3ms**).
- final offscreen fetch 1506.1→6693.4; load 6696.7 (**3.3ms**).
- signing 456ms; draft-cover-signing 738ms; return-boundary observed +1512.7ms.

Edit sample 9:
- document response/return occurs around 2.05s; heading observed 2302.6; document load 12284.7; heading→load **9982.1ms**.
- visible partial fetch 2043.7→11937.6; load 11944.8 (**7.2ms**).
- final offscreen fetch 2044.0→12281.2; load 12284.5 (**3.3ms**).
- signing 300ms; body metadata 1029ms; draft-cover-signing 1417ms; return-boundary observed +2054.3ms.

Page Editor sample 1:
- heading 2440.4; document load 4435.8; gap **1995.4ms**.
- final offscreen rail image fetch 2430.3→4431.3; load 4435.7 (**4.4ms**).
- latest visible image event was approximately 1422.5ms after heading; offscreen completion extends native load and is not included as a required visible-ready condition.

All five post-heading tails are **classification B: resource fetch not completed**. Fetch startTime precedes observed heading in these examples. No evidence for classification A (heading-after scheduling start) as the explanation for these tails; no dominant post-response C interval or completed-image D interval was found in them. Scheduling/connection/CDN/transfer decomposition remains E within the broader fetch lifecycle.

Server logs: 368 allowlisted stage records across 46 request groups, including the interrupted navigation. Formal samples are correlated by time window; stage timestamps are log timestamps, not synchronized tracing spans. Auth/album/pet/body metadata/cover/signing/return stages are available, but separate version and bundle phases and actual Auth/DB/Storage HTTP counts are not exposed by this fixed source. They are **UNAVAILABLE**, not inferred from logical stages. Parallel and enclosing stage durations must not be added together.

## Viewport, eager images and preloads

Edit consistently has 25 img elements (cover representations plus 19 body-photo occurrences and other renderer content); the final DOM had 21 image preload links. Body img loading is unspecified, effectively eager/default; one unrelated image is lazy. Across Edit samples: 600 unspecified img observations and 25 lazy observations. Page Editor: 200 unspecified and 10 lazy. Preview: 200 unspecified. These are element observations, not unique network requests.

Visible partial body images and offscreen body images begin fetch within roughly 1ms of each other in the Edit tails, with `initiatorType=link`. Thus parser/framework image preloads are active, and adding `loading=lazy` alone may not stop early requests. A next experiment must inspect both img loading and generated preload behavior. Overlapping intervals demonstrate concurrency, **not that offscreen requests caused the visible delays**. No intervention was performed in this task.

## Resource Timing limitations

Across per-document deduplicated, DOM-associated entries: Edit 525 entries, 475 opaque; Page Editor 190/190 opaque; Preview 190/190 opaque. Counts deduplicate resource ordinals within each document; they are not physical HTTP request counts. Some Edit entries expose detail fields, but the slow tail entries do not.

Opaque tail entries have usable startTime/responseEnd/duration while requestStart/responseStart and byte sizes are zero. Zero bytes do not prove a cache hit or zero transfer. Resource startTime denotes fetch initiation, not necessarily wire request dispatch; its duration includes phases that cannot be separated here. `decodedBodySize` means HTTP content decoding size, not pixel decode duration. DNS/connection/request TTFB/actual transfer split and reliable byte totals for these tails remain **UNAVAILABLE** under timing visibility restrictions. See [W3C Resource Timing](https://www.w3.org/TR/resource-timing/). Decode invocation was avoided in accordance with the [HTML image decode algorithm](https://html.spec.whatwg.org/multipage/embedded-content.html#dom-img-decode).

The new deployment is cold-like only. Prior excluded diagnostic probing and existing caches prevent asserting pristine browser/CDN cold conditions. Later fast samples cannot be labeled cache hits from opaque zero sizes.

## Verification and correctness

- `node --test tests/*.test.mjs`: **1192/1192 PASS**.
- TypeScript PASS; lint 0 errors / 12 existing warnings; build PASS on ordinary retry; diff check PASS.
- Initial local build attempts emitted the installed Next security advisory/fatal build exit; unchanged ordinary retry completed. No dependency upgrade or advisory suppression was made; this remains a tooling/security follow-up, separate from diagnostic observations.
- Tests cover privacy allowlists, unsafe strings/nonfinite values, bounded observers, no source/decode/network mutation, hydration-safe publication and Production exclusion.
- Local client scan found no Service Role name; diagnostic is Preview-only. This is not a claim of remote protected JS exhaustive credential-value scanning.
- No save/replacement/layout/DB/Storage/cache clear, order, checkout or PDF operation. Authorization, revision, crop/contain, Multi-Pet, image policy and print quality code unchanged. No fresh save acceptance is claimed.
- Genuine No-Crop browser fixture remains **UNVERIFIED due to fixture absence**.

## Recommendation and stop

Do not proceed to RPC or React optimization based on these tails. The evidence supports a dedicated, minimal **offscreen image loading plus generated image-preload investigation/experiment** next, with visible image fetch completion as its primary metric. Keep main image quality/geometry/source unchanged and verify whether preload suppression is actually needed before choosing an implementation. If that fails to reduce the visible resource tail, investigate image delivery/CDN response timing with appropriate cross-origin observability in a separate approved task.

Severe image tails reproduced, so do not move directly to Production release. This task stops at diagnosis. Production/main unchanged; fixed comparison alias restored; no next task started.
