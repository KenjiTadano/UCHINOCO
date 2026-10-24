# Task085.4.4.5.12 — Image Delivery / CDN Timing Investigation

## Decision

Investigation completed. **Case A is the leading observational hypothesis: cross-navigation signed-source stability merits a design review. Causal attribution and performance adoption remain HOLD.** Source changes are frequent and all three non-first visible fetch tails coincide with changed sources and advanced expiry claims. Many source changes are fast, so a changed URL alone does not establish a CDN miss or cause the tail.

- Edit **30**, Page Editor **10**, Preview **10** document loads.
- Visible fetch >1s: **3/30**, **1/10**, **0/10** respectively; >3s and >5s: zero in this cohort.
- Exact-source reuse cohorts: **0/19 documents** have a visible fetch >1s. Changed-source cohorts: **3/30 documents**; the first observed document is a separate **1/1** tail.
- Actual CDN/browser cache status, response headers and per-object signing regeneration are not directly observable. They remain **UNAVAILABLE/UNVERIFIED** as specified below.
- No application/source/loader/policy/cache/CDN/Storage changes, no new deployment, no Production/main changes. Comparison alias verified restored. Stop after this report.

## Fixed source and environment

Baseline application: `9eef1ff7844f9a1b2705766e3f57863b0a183a52`.
Measured existing Preview diagnostic source: `a36c46c47542483c4bcff492b96138bbcf348f32`.

This source adds only the existing Task085.4.4.5.10 timing observer/outlet/build guard and tests to the baseline application. It contains **none of Task085.4.4.5.11 A/B lazy/low-priority code**. The dedicated report branch starts from that diagnostic source, rather than adopting the A/B branch. Deployment metadata: READY, configured `sin1`, Service Role absent. Configured region is not inferred from ingress/edge metadata.

The prior authenticated comparison host/session was reused at 380×715. Its tab had been closed, so one comparison tab was reopened; authentication persisted. Production tab/session remained untouched. Existing Preview was temporarily assigned to the comparison alias and restored after measurement; no new build/deploy or environment change was required.

Formal navigation-start window: **2026-10-25 08:24:22–08:35:59 JST**; last bounded collection completed **08:36:05 JST**. The initial opened Edit document is admitted as sample #1 using preserved native observer timing. Its automation navigation-return duration is UNAVAILABLE; subsequent samples record it. No artificial cache purge, source swapping, extra Image objects, forced image reloads, save or fixture mutation.

## Source path review

The reviewed files are the measured source's `lib/photo-image-delivery.ts`, `lib/album-persistence/read-draft.ts`, `load-route-draft.ts`, `route-read-context.ts` and route pages. A newer unrelated checkout's delivery helper was not used to infer this candidate's behavior.

- Signed URL lifetime configured in source: **3600 seconds**.
- Existing signed URL reuse limit: **50 minutes**, process-local, namespaced by verified owner + bucket + object path, with a 30-second freshness margin. It is not a shared persistent cache or an authenticated-user cache.
- A request-local context deduplicates photo identities/metadata; `signedPreviewUrls` deduplicates photo IDs before resolving sources.
- Edit and Preview use the effective/reset/cover union through the existing draft loader. Its `signing` wrapper includes photo metadata/context resolution and URL lookup/signing; it is **not pure Storage HTTP time**.
- Page Editor's existing trace exposes the enclosing draft stage, not a separate signing wrapper. Network-only signing time and per-object SDK call attribution are UNAVAILABLE.
- Derivative/original fallback policy, owner validation, TTL and quality/dimensions were not changed. The source's upload `cacheControl` constant is not proof of the current response's `cache-control` header.

Process-local caches can differ across runtime instances. That is a plausible explanation for alternating still-valid signed sources, **not measured instance identity proof**. No runtime-instance identifier or new cache was added.

## Privacy-safe observer and classification

The deployed numeric Resource Timing observer is unchanged. A local-only source classifier reads current DOM image sources into temporary memory, compares them, and persists only generic enums, counts, booleans and session ordinals. No URL/name/path/filename/query/token/credential or real entity ID is saved in measurement records. No hashes are saved.

The classifier distinguishes:

- underlying Storage object identity, normalized across signed-object versus signed-render endpoint shape;
- delivery variant, retaining noncredential transform/query distinctions only in memory, so a legitimate different variant is not mislabeled re-signing;
- exact signed source reuse versus a changed source for the same object/variant;
- previous-document object/variant/source equality;
- JWT expiry **claim category only**, decoded locally without validating or logging its payload: EXPIRED, <5m, 5–30m, 30–60m, >60m, UNAVAILABLE.

Exact token claims and identity strings never leave temporary memory. Claim categories are diagnostic observations, **not authorization checks or proof of effective CDN expiration**. Per-object regeneration is classified as source reused / source changed with expiry advanced / source changed without expiry advancement. This is evidence of different credentials, not proof that a new SDK signing call occurred during that request: another existing valid URL can return from another instance. Exact re-generation remains UNVERIFIED without per-object server attribution.

Anonymous image ordinals are joined to timing DTOs using numeric current rectangles/natural dimensions. All 50 samples have **zero ambiguous joins**. Synthetic local checks cover exact reuse, changed expiry, delivery variant separation, duplicate reuse and absence of synthetic URL/token strings in serialized output. Temporary maps are cleared at completion.

## Sampling and definitions

Ten interspersed rounds: three Edit loads plus one Page Editor and one Preview per round. This produces 30/10/10 loads, including direct consecutive Edit reloads and Edit→Page Editor→Edit→Preview→Edit transitions. There is no separate warm-up navigation cohort. Persistent browser/CDN state and the older deployment are retained; **fresh-instance/cold-cache status is not asserted**.

Within-document reuse is measured on the final concurrent DOM. Preview initially loads cover and then selects the first body spread read-only; its source/reuse inventory describes the body/main/rail DOM. Cover native document timing is retained separately. Intentional time before selecting Body is excluded from body readiness.

Heading is a DOM-observed timestamp, not a paint measurement. Visible images include opacity-zero allocated images and viewport clipping. Fetch duration is native Resource Timing duration; it includes phases that cannot be separated here. Heading/body→responseEnd and →load delays are nonnegative readiness gaps. Native document load can precede heading observation. No `img.decode()` is invoked.

## Object identity and reuse results

The same **19 anonymous underlying object identities** occur in every document. No delivery variant change was observed for those objects. Concurrent image references:

- Edit: **21 signed img references / 19 objects**; one object is reused in three img elements; **2 duplicate references** reuse the exact same signed source.
- Page Editor: **21 / 19**; one object reused in three elements; **2 duplicate references**, same signed source.
- Preview body: **20 / 19**; one duplicate main/rail reference reuses the same signed source.
- Same object + same variant + multiple different signed sources **within a document: 0/50**.
- Total img source observations: **1040**. These are not HTTP requests. They include **660 stored derivative references**, **380 original references**, **0 transformed-render endpoint references**. Storage endpoint classification does not prove CDN transformation or cache status.

Cross-navigation classifications, after the first document:

- Exact signed source reused for the document's objects: **19/49 documents (38.8%)**.
- Same objects/variants but changed signed sources: **30/49 (61.2%)**.
- First observed: one document, excluded from cross-navigation reuse percentages.
- By route: Edit first=1, reused=14, changed=15; Page Editor reused=2, changed=8; Preview reused=3, changed=7.

All **1040 observed expiry claims** fall in **30–60 minutes remaining at collection**. Changes therefore occur while sources are still comfortably within the observed claim window. Of the source-reference observations, 396 reuse an exact source, 623 change source, 21 are first observations. Among the changed references, **355 show an advanced expiry claim**, **268 do not**. These are reference counts including intentional duplicate elements, not unique signing calls. Lack of advancement can represent equal or older expiry; the classifier does not claim a fresh sign in those cases.

## Resource timing distributions

Milliseconds, nearest-rank median / p75 / max. Native 0-duration entries are retained as observed rounded timing, **not classified as cache hits or zero network transfer**.

- **Edit n=30:** heading **963.0 / 1029.5 / 3981.6**; native document load **746.6 / 975.7 / 5997.0**; maximum visible resource fetch per document **25.0 / 31.9 / 1962.8**; heading→visible responseEnd **0 / 6.3 / 1938.7**; heading→visible load **13.1 / 17.8 / 1944.4**.
- **Page Editor n=10:** heading **862.4 / 1054.0 / 1933.7**; document load **872.0 / 1097.0 / 4158.0**; visible fetch **20.7 / 27.5 / 1989.0**; heading→visible responseEnd **12.1 / 17.2 / 1979.5**; heading→visible load **30.2 / 41.6 / 1980.1**. The slow visible image is in the rail; this is not a claim that main canvas rendering took that whole interval.
- **Preview n=10:** initial-cover heading **914.0 / 1050.0 / 1181.1**; document load **857.0 / 934.5 / 1204.2**. Following Body DOM observation, visible fetch **13.0 / 17.3 / 25.0**; body→visible responseEnd **13.1 / 17.5 / 25.0**; body→visible load **28.1 / 33.3 / 35.8**.

Visible resource fetch duration >1s / >3s / >5s: Edit **3 / 0 / 0**, Page Editor **1 / 0 / 0**, Preview **0 / 0 / 0**. Visible load readiness gaps have the same threshold counts. The first Edit document exceeds 5s total because it includes the pre-image/server portion; that is not a >5s image fetch. The severe 5–10s image tails from earlier tasks did not recur in this particular cohort.

## Source/tail association

- Edit exact-reuse cohort: **0/14** fetch tails >1s, max visible duration **41.2ms**.
- Edit changed-source cohort: **2/15**, max **1639.1ms**.
- First Edit observation: **1/1**, **1962.8ms**; no previous source exists to compare.
- Page Editor reuse: **0/2**; changed: **1/8**.
- Preview reuse: **0/3**; changed: **0/7**.

Thus all three comparable tails coincide with changed sources and advanced expiry; **27 of 30 changed-source documents are nevertheless fast**. This is a small observational association with cache/time/instance confounders, not an intervention or causal estimate. Source reuse does not guarantee cache hits, and changed sources do not guarantee slow responses. No same-source >1s tail was observed here, so Case B is not directly demonstrated; it is not ruled out globally.

## Tail samples and signing versus delivery

Only numeric ordinals/classifications are retained; no real object identity is disclosed.

- **Edit #1:** first observed source, signed original. Fetch start **3957.5**, responseEnd **5920.3**, duration **1962.8**, load **5926.0**; responseEnd→load **5.7ms**. Heading **3981.6**. Signing wrapper **184ms**. Eleven offscreen resource intervals overlap visible fetching.
- **Page Editor #1:** same object/variant, changed signed source, expiry advanced, stored derivative. Fetch start **1924.2**, responseEnd **3913.2**, duration **1989.0**, load **3913.8**; post-response **0.6ms**. Separate signing duration UNAVAILABLE. Twelve offscreen intervals overlap visible fetching.
- **Edit #3:** same anonymous slow original object as Edit #1; source changed, expiry advanced. Fetch **1079.9→2663.0**, duration **1583.1**, load **2666.8**; post-response **3.8ms**. Signing wrapper **139ms**. Eleven offscreen overlaps.
- **Edit #6:** same original object; source changed, expiry advanced. Fetch **1025.0→2664.1**, duration **1639.1**, load **2667.0**; post-response **2.9ms**. Signing wrapper **155ms**. Eleven offscreen overlaps.

All tails remain fetch-completion waits, not seconds of work after responseEnd. Fetch start is not wire requestStart: for the slow entries wire requestStart/responseStart are UNAVAILABLE. Overlap does not prove resource contention.

Existing runtime traces provide **400 sanitized stages / 50 request groups**, correlated by navigation time window. Signing wrapper time and image delivery time are separate; wrapper 139–184ms cannot be used to explain away a 1.6–2.0s image fetch. Log timestamps are not synchronized tracing spans, and no SQL execution time, SDK HTTP count or per-object sign invocation is inferred.

## CDN/header observability

The browser API exposes DOM, console logs and asset inventory, but **no response-header or network-request inspection API**. Asset inventory exposes URLs, not headers; it was not bundled/downloaded. No auxiliary HEAD/fetch was sent to warm caches or create a second vantage point.

Actual values/presence of the following remain **UNAVAILABLE**: `cache-control`, `age`, `etag`, `x-cache`-style headers, `cf-cache-status`, `Timing-Allow-Origin`. Opaque timing is not proof that TAO is absent; it only shows detailed fields were not exposed through this observation.

There are **1010 per-document deduplicated DOM-associated resource entries**: 950 have opaque detail fields, 60 expose positive responseStart. Protected fields in opaque entries are normalized to **UNAVAILABLE** (`requestStart`, `responseStart`, transfer/encoded/decoded body sizes); native startTime/responseEnd/duration remain recorded. These entry counts are not physical HTTP attempts or byte totals. `decodedBodySize` is HTTP body decoding size, not pixel decode time.

No cache HIT/MISS was positively identified for any measured image. Same URL, zero bytes or 0-duration timing is not used as a cache classification.

Provider documentation establishes a relevant mechanism, not this project's live cache state:

- [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn) documents separate cache entries for distinct signed-URL tokens when Smart CDN is enabled. The observed churn is compatible with weaker reuse of those entries. Whether this project currently has Smart CDN enabled is **UNVERIFIED**; no plan/config is inferred.
- [Supabase CDN fundamentals](https://supabase.com/docs/guides/storage/cdn/fundamentals) identifies `cf-cache-status` as direct cache evidence; that header is unavailable here. Provider TTL/cache semantics and browser reuse must not be conflated with the token's expiry claim.

## Security and correctness

No source, loader, TTL, Storage/CDN setting, image size/quality, bucket visibility, Auth, owner/RLS, path/membership, revision/clientSeq or cross-user isolation change. Existing private signed delivery stays intact. No public conversion, manual token minting, new global user/shared cache, save, replacement, layout mutation, checkout/order/PDF or Production request experiment.

All 50 samples: zero console errors, broken images or horizontal overflow; each Edit has 12 cards. No ambiguous source/timing joins. No fresh persistence acceptance is claimed. Genuine No-Crop browser acceptance remains **UNVERIFIED due to fixture absence**, not PASS.

Application/config diagnostics were not changed or redeployed. Existing exact-source verification is retained; `node --test tests/*.test.mjs` was additionally rerun: **1192/1192 PASS**. Local classifier synthetic checks pass; report/diff and privacy scans pass. Prior exact-source tsc/lint/build verification is referenced rather than claiming a new build. The previously recorded installed Next security advisory remains a separate follow-up, without upgrade/suppression in this task.

Ignored local evidence is under `outputs/task085-4-4-5-12/`; measurement JSON contains no real entity IDs, private host, absolute user path, signed URL or credential. Runtime responses were parsed in memory through the B1 safe parser; raw logs/request paths were not stored. Only this canonical report is a Git deliverable; existing unrelated report edits are preserved.

## Next recommendation and stop

Proceed only by a separately authorized **signed URL cross-navigation reuse design/controlled experiment**, with explicit verified owner/membership, object/variant identity, expiry freshness, invalidation and cross-user isolation. The current within-document dedup already works; do not spend another task merely consolidating those same references. A future design must also review provider cache/expiry semantics without changing private access policy or extending TTL as a shortcut.

Before attributing a causal CDN improvement, obtain a permitted response-header/cache observability path, or a controlled same-source versus regenerated-source experiment that does not weaken security. Do not treat the present association as proof that process-local cache placement is the cause.

Case C is not supported as the dominant cause (post-response load intervals are milliseconds). Case D is not met (>1s tails recur), despite no >3s fetch in this cohort. No Production release recommendation is made. Comparison alias restored; no new deployment, RPC, Task085.5 or UI redesign. **STOP.**
